"""Ferramentas de leitura com identidade delegada, sem expor dados do provedor."""
import httpx


class ChatReadTools:
    def __init__(self, base_url: str, token: str, client: httpx.AsyncClient):
        self.base_url = base_url.rstrip('/')
        self.token = token
        self.client = client

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
        from uuid import UUID
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
            response = await self.client.post(self.base_url + '/api/auth/me/chat-guided-update',
                headers={'Authorization': 'Bearer ' + self.token},
                json={'tenantName': tenant_name.strip(), 'businessContext': business_context.strip()}, timeout=15.0)
            response.raise_for_status()
            data = response.json().get('data')
            if not isinstance(data, dict):
                raise ValueError()
            return data
        except (httpx.HTTPError, ValueError, TypeError, KeyError, AttributeError):
            return {'error': 'Não foi possível salvar o contexto do negócio agora.'}
