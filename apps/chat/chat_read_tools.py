"""Ferramentas de leitura com identidade delegada, sem expor dados do provedor."""
import asyncio
from uuid import UUID

import httpx


class ProfileSyncTransient(Exception):
    """Profile reconciliation can safely be retried with the durable receipt."""


class _ProfileResponseUncertain(Exception):
    pass


class ChatReadTools:
    def __init__(self, base_url: str, token: str, client: httpx.AsyncClient, *,
                 conversation_id: str | None = None, run_id: str | None = None, lease_id: str | None = None):
        self.base_url = base_url.rstrip('/')
        self.token = token
        self.client = client
        self.conversation_id, self.run_id, self.lease_id = conversation_id, run_id, lease_id

    async def _get(self, path: str) -> dict:
        request = httpx.Request('GET', self.base_url + path,
                                headers={'Authorization': 'Bearer ' + self.token},
                                extensions={'timeout': httpx.Timeout(10.0).as_dict()})
        response = await self.client.send(request, auth=None, follow_redirects=False)
        response.raise_for_status()
        data = response.json().get('data')
        if not isinstance(data, dict):
            raise ValueError('invalid data')
        return data

    async def quotas(self) -> dict:
        """Consulta cotas permitidas de imagens e vídeos.

        Com assinatura ativa, uma categoria null foi omitida por falta de acesso;
        nunca interprete essa categoria como ilimitada. Valores null dentro de
        uma categoria permitida são distintos de uma categoria indisponível.
        Assinaturas ausentes ou expiradas não disponibilizam cotas.
        """
        try:
            data = await self._get('/api/studio/chat-quotas')
            if data.get('subscription') in ('missing', 'expired'):
                return {'subscription': data['subscription'], 'images': None, 'videos': None}
            if data.get('subscription') != 'active':
                raise ValueError('invalid subscription')
            result: dict = {'subscription': 'active'}
            for kind in ('images', 'videos'):
                item = data[kind]
                if item is None:
                    result[kind] = None
                    continue
                values = {key: item[key] for key in ('limit', 'remaining')}
                if any(value is not None and (type(value) is not int or value < 0) for value in values.values()):
                    raise ValueError('invalid quota')
                result[kind] = values
            return result
        except (httpx.HTTPError, ValueError, TypeError, KeyError, AttributeError):
            return {'error': 'Não foi possível consultar as cotas do plano.'}

    async def meta_ads_diagnostic(self) -> dict:
        """Diagnostica acesso à Meta sem publicar. Permissões abrangem apenas permissionScopes; resultado parcial não garante elegibilidade."""
        try:
            data = await self._get('/api/meta/chat-ads-diagnostic')
            if data.get('status') not in ('partial', 'missing', 'expired', 'error') or not isinstance(data.get('checks'), dict):
                raise ValueError('invalid diagnostic')
            allowed = ('connection', 'adsAndPagesPermissions', 'account', 'page', 'instagram', 'pageInstagramLink')
            checks = {key: value for key, value in data['checks'].items() if key in allowed}
            if any(value not in ('confirmed', 'missing', 'unknown', 'error', 'inactive', 'not_returned', 'missing_advertise') for value in checks.values()):
                raise ValueError('invalid check')
            result = {'status': data['status'], 'checks': checks}
            if 'adsAndPagesPermissions' in checks and 'permissionScopes' not in data:
                raise ValueError('missing assessed scopes')
            if 'permissionScopes' in data:
                scopes = data['permissionScopes']
                allowed_scopes = ('ads_management', 'ads_read', 'pages_show_list', 'pages_manage_ads')
                if not isinstance(scopes, list) or any(scope not in allowed_scopes for scope in scopes):
                    raise ValueError('invalid scopes')
                result['permissionScopes'] = scopes
            return result
        except (httpx.HTTPError, ValueError, TypeError, KeyError, AttributeError):
            return {'error': 'Não foi possível diagnosticar a conexão Meta.'}

    async def promote_attachment(self, conversation_id: str, attachment_id: str, target: str, kind: str = '') -> dict:
        """Salvar uma imagem enviada pelo usuário na marca: target logo, ou library com kind empresa/produto/equipe/modelo.

        Use apenas quando a pessoa tiver acabado de enviar a imagem para essa
        finalidade. A promoção usa o anexo privado pertencente à conversa, sem
        aceitar URLs externas nem arquivos de outro usuário.
        """
        try:
            conversation_id, attachment_id = str(UUID(conversation_id)), str(UUID(attachment_id))
            if target == 'logo':
                if kind:
                    raise ValueError()
                body = {'target': 'logo'}
            elif target == 'library' and kind in ('empresa', 'produto', 'equipe', 'modelo'):
                body = {'target': 'library', 'kind': kind}
            else:
                raise ValueError()
            response = await self.client.post(
                self.base_url + f'/api/chat/conversations/{conversation_id}/attachments/{attachment_id}/promote',
                headers={'Authorization': 'Bearer ' + self.token}, json=body, timeout=30.0,
            )
            response.raise_for_status()
            data = response.json().get('data')
            if not isinstance(data, dict):
                raise ValueError()
            return data
        except (httpx.HTTPError, ValueError, TypeError, KeyError, AttributeError):
            return {'error': 'Não foi possível salvar esta imagem na marca.'}

    async def save_guided_business_context(self, tenant_name: str, business_context: str) -> dict:
        """Persistir nome e oferta confirmados pelo fluxo guiado no contexto do negócio.

        Use somente os valores retornados por guided_setup_answer.profileUpdate.
        """
        try:
            if not 1 <= len(tenant_name.strip()) <= 255 or not 1 <= len(business_context.strip()) <= 5000:
                raise ValueError()
            body = {'tenantName': tenant_name.strip(), 'businessContext': business_context.strip(),
                    'conversationId': str(UUID(self.conversation_id)), 'runId': str(UUID(self.run_id)),
                    'leaseId': str(UUID(self.lease_id))}
        except (ValueError, TypeError, AttributeError):
            return {'error': 'Não foi possível salvar o contexto do negócio agora.'}
        for attempt in range(3):
            try:
                response = await self.client.post(self.base_url + '/api/auth/me/chat-guided-update',
                    headers={'Authorization': 'Bearer ' + self.token}, json=body, timeout=15.0)
                if response.status_code in (408, 429) or response.status_code >= 500:
                    raise httpx.HTTPStatusError('transient', request=response.request, response=response)
                response.raise_for_status()
                try:
                    data = response.json().get('data')
                    if (not isinstance(data, dict) or data.get('tenantName') != body['tenantName']
                            or data.get('businessContext') != body['businessContext']):
                        raise ValueError()
                except (ValueError, TypeError, AttributeError) as error:
                    raise _ProfileResponseUncertain() from error
                return data
            except (httpx.RequestError, httpx.HTTPStatusError, _ProfileResponseUncertain) as error:
                validation_rollout = False
                if isinstance(error, httpx.HTTPStatusError) and error.response.status_code == 400:
                    try:
                        validation_rollout = error.response.json().get('error', {}).get('code') == 'VALIDATION_ERROR'
                    except (ValueError, AttributeError):
                        pass
                if (isinstance(error, httpx.HTTPStatusError) and error.response.status_code < 500
                        and error.response.status_code not in (408, 429) and not validation_rollout):
                    if error.response.status_code == 409:
                        return {'error': 'O perfil ou a execução mudou. Confira os dados atuais antes de tentar novamente.'}
                    return {'error': 'Não foi possível salvar o contexto do negócio agora.'}
                if attempt == 2:
                    raise ProfileSyncTransient('Não foi possível confirmar o contexto do negócio.') from None
                await asyncio.sleep(0.25 * 2 ** attempt)
            except (ValueError, TypeError, KeyError, AttributeError):
                return {'error': 'Não foi possível salvar o contexto do negócio agora.'}
