"""Consultas permitidas à API Ady com identidade delegada."""
import httpx
from video_availability import VideoAvailability, UNAVAILABLE
from tool_budget import limit_tool_result

class AdyTools:
    def __init__(self, base_url: str, token: str, client: httpx.AsyncClient):
        self.base_url = base_url.rstrip('/')
        self.token = token
        self.client = client

    async def campaigns(self, limit: int = 20, offset: int = 0) -> dict:
        """Consultar campanhas paginadas; use limit entre 1 e 100 e offset para páginas seguintes."""
        try:
            if isinstance(limit, bool) or isinstance(offset, bool) or not 1 <= limit <= 100 or offset < 0:
                raise ValueError()
            response = await self.client.get(self.base_url + '/api/campaigns', params={'limit':limit, 'offset':offset}, headers={'Authorization': 'Bearer ' + self.token}, timeout=10.0)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError):
            return {'error': 'Não foi possível consultar o Ady.'}


    async def calendar(self, start_date: str, end_date: str) -> dict:
        """Consultar postagens do calendário entre datas ISO AAAA-MM-DD."""
        from datetime import date
        try:
            start = date.fromisoformat(start_date)
            end = date.fromisoformat(end_date)
            if start > end or (end - start).days > 366:
                raise ValueError()
            response = await self.client.get(self.base_url + '/api/planner/calendar', params={'startDate': start_date, 'endDate': end_date}, headers={'Authorization': 'Bearer ' + self.token}, timeout=10.0)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError):
            return {'error': 'Não foi possível consultar o calendário.'}


    async def brand(self) -> dict:
        """Consultar informações autorizadas da marca e do negócio."""
        try:
            response = await self.client.get(self.base_url + '/api/brand-kit', headers={'Authorization': 'Bearer ' + self.token}, timeout=10.0)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError):
            return {'error': 'Não foi possível consultar a marca.'}


    async def assets(self, page: int = 1, limit: int = 20, asset_type: str = '') -> dict:
        """Listar mídias paginadas; page começa em 1, limit até 100 e asset_type pode ser image, video ou copy."""
        try:
            if isinstance(page, bool) or isinstance(limit, bool) or page < 1 or not 1 <= limit <= 100 or asset_type not in ('', 'image', 'video', 'copy'):
                raise ValueError()
            params = {'page':page, 'limit':limit}
            if asset_type: params['type'] = asset_type
            response = await self.client.get(self.base_url + '/api/studio/assets', params=params, headers={'Authorization': 'Bearer ' + self.token}, timeout=10.0)
            response.raise_for_status()
            return limit_tool_result(response.json())
        except (httpx.HTTPError, ValueError):
            return {'error': 'Não foi possível consultar a biblioteca de mídias.'}


    async def video_options(self) -> dict:
        """Consultar disponibilidade de criação de vídeos sem executar uma ação."""
        try:
            request = httpx.Request('GET', self.base_url + '/api/studio/video/options',
                headers={'Authorization': 'Bearer ' + self.token},
                extensions={'timeout': httpx.Timeout(10.0).as_dict()})
            response = await self.client.send(request, auth=None, follow_redirects=False)
            response.raise_for_status()
            options = response.json()
            if not isinstance(options, dict):
                raise ValueError()
            return {key: options[key] for key in ('enabled', 'videosRemaining') if key in options}
        except (httpx.HTTPError, ValueError):
            return {'error': UNAVAILABLE}

    async def video_job(self, job_id: str) -> dict:
        """Consultar progresso de uma geração de vídeo autorizada."""
        from uuid import UUID
        try:
            job_id = str(UUID(job_id))
            response = await self.client.get(self.base_url + '/api/studio/video/jobs/' + job_id, headers={'Authorization': 'Bearer ' + self.token}, timeout=10.0)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError):
            return {'error': 'Não foi possível consultar o progresso do vídeo.'}


    async def campaign_ads(self, campaign_id: str) -> dict:
        """Consultar anúncios de uma campanha do usuário pelo UUID local."""
        from uuid import UUID
        try:
            campaign_id = str(UUID(campaign_id))
            response = await self.client.get(self.base_url + '/api/campaigns/' + campaign_id + '/chat-ads', headers={'Authorization':'Bearer '+self.token}, timeout=10.0)
            response.raise_for_status()
            return response.json()
        except (ValueError, httpx.HTTPError):
            return {'error':'Não foi possível consultar os anúncios.'}


    async def ad_details(self, campaign_id: str, ad_id: str) -> dict:
        """Consultar anúncio autorizado e identificar seu conjunto e criativo."""
        import re
        from uuid import UUID
        try:
            campaign_id = str(UUID(campaign_id))
            if not re.fullmatch(r'[0-9]{1,32}', ad_id): raise ValueError()
            response = await self.client.get(self.base_url + '/api/campaigns/' + campaign_id + '/chat-ads/' + ad_id, headers={'Authorization':'Bearer '+self.token}, timeout=10.0)
            response.raise_for_status()
            return response.json()
        except (ValueError, httpx.HTTPError):
            return {'error':'Não foi possível consultar o anúncio.'}


    async def ad_assets(self, campaign_id: str) -> dict:
        """Listar conjuntos e criativos já vinculados aos anúncios da campanha."""
        from uuid import UUID
        try:
            campaign_id = str(UUID(campaign_id))
            response = await self.client.get(self.base_url + '/api/campaigns/' + campaign_id + '/chat-ad-assets', headers={'Authorization':'Bearer '+self.token}, timeout=10.0)
            response.raise_for_status()
            return response.json()
        except (ValueError, httpx.HTTPError):
            return {'error':'Não foi possível consultar recursos dos anúncios.'}


    async def available_ad_assets(self, campaign_id: str) -> dict:
        """Consultar conjuntos e criativos disponíveis para criar anúncios na campanha."""
        from uuid import UUID
        try:
            campaign_id = str(UUID(campaign_id))
            response = await self.client.get(self.base_url + '/api/campaigns/' + campaign_id + '/chat-available-ad-assets', headers={'Authorization':'Bearer '+self.token}, timeout=10.0)
            response.raise_for_status()
            return response.json()
        except (ValueError, httpx.HTTPError):
            return {'error':'Não foi possível consultar os recursos disponíveis.'}


    async def profile(self) -> dict:
        """Consultar dados autorizados de perfil e negócio."""
        try:
            response = await self.client.get(self.base_url + '/api/auth/me/chat-snapshot', headers={'Authorization':'Bearer '+self.token}, timeout=10.0)
            response.raise_for_status()
            return response.json()
        except (ValueError, httpx.HTTPError):
            return {'error':'Não foi possível consultar perfil e negócio.'}


    async def brand_photos(self, kind: str = '', page: int = 1, limit: int = 20) -> dict:
        """Consultar fotos da marca por tipo (produto, equipe ou modelo), página e limite até 50; confira hasMore. Para vídeo, use apenas fotos produto ou equipe."""
        try:
            if kind not in ('', 'produto', 'equipe', 'modelo') or isinstance(page, bool) or isinstance(limit, bool) or page < 1 or not 1 <= limit <= 50:
                raise ValueError()
            params = {'page':page, 'limit':limit}
            if kind: params['kind'] = kind
            response = await self.client.get(self.base_url + '/api/brand-kit/chat-library', params=params, headers={'Authorization':'Bearer '+self.token}, timeout=10.0)
            response.raise_for_status()
            return response.json()
        except (ValueError, httpx.HTTPError):
            return {'error':'Não foi possível consultar as fotos da marca.'}


class ImageProposal:
    MODELS = frozenset(['black-forest-labs/flux.2-klein-4b', 'black-forest-labs/flux.2-max', 'black-forest-labs/flux.2-pro', 'bytedance-seed/seedream-5-0-pro', 'x-ai/grok-imagine-image-2.0', 'qwen/qwen-image-3-pro', 'google/gemini-3.1-flash-image'])

    def __init__(self, db, tenant_id, user_id, conversation_id, emit=None, ady=None):
        self.db, self.tenant_id, self.user_id, self.conversation_id = db, tenant_id, user_id, conversation_id
        self.emit = emit
        self.ady = ady

    async def propose_image(self, prompt: str, model: str, aspect_ratio: str = '1:1', resolution: str = '2K', reference_image_urls: list[str] | None = None, photo_ids: list[str] | None = None) -> dict:
        """Propor criação de imagem. Modelos: black-forest-labs/flux.2-klein-4b, black-forest-labs/flux.2-max, black-forest-labs/flux.2-pro, bytedance-seed/seedream-5-0-pro, x-ai/grok-imagine-image-2.0, qwen/qwen-image-3-pro, google/gemini-3.1-flash-image. Pode usar até duas fotos produto/equipe da biblioteca por photo_ids; não misture com URLs. Aguardará confirmação."""
        import json
        from uuid import UUID
        from urllib.parse import urlparse
        try:
            if photo_ids is not None and (not isinstance(photo_ids, list) or len(photo_ids) > 2):
                raise ValueError()
            normalized_photos = [str(UUID(value)) for value in (photo_ids or [])]
            if normalized_photos and reference_image_urls:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            return {'error':'Informe até dois IDs válidos de fotos ou URLs de referência, sem misturar.'}
        if reference_image_urls is not None and (len(reference_image_urls) > 2 or any(urlparse(url).scheme != 'https' or not urlparse(url).netloc for url in reference_image_urls)):
            return {'error':'Informe até duas imagens de referência HTTPS.'}
        if not 10 <= len(prompt) <= 1000 or model not in self.MODELS or aspect_ratio not in ('1:1', '16:9', '9:16') or resolution not in ('1K','2K','4K'):
            return {'error': 'Informe descrição, modelo, proporção e resolução válidos.'}
        body = {'prompt': prompt, 'model': model, 'aspect_ratio': aspect_ratio, 'resolution': resolution}
        if reference_image_urls:
            body['reference_image_urls'] = reference_image_urls
        if normalized_photos:
            body['photo_ids'] = normalized_photos
        row = await self.db.fetchrow("INSERT INTO chat_approvals(tenant_id,user_id,conversation_id,method,path,body,expires_at) VALUES($1,$2,$3,'POST','/api/studio/ai/generate-image',$4::jsonb,now()+interval '24 hours') RETURNING id,expires_at", self.tenant_id, self.user_id, self.conversation_id, json.dumps(body))
        approval = {'id': str(row['id']), 'action': 'Criar imagem', 'parameters': body, 'status': 'pending', 'expires_at': row['expires_at'].isoformat()}
        if self.emit:
            await self.emit(approval)
        return approval

    async def _propose(self, action: str, path: str, body: dict, display: dict | None = None) -> dict:
        import json
        row = await self.db.fetchrow("INSERT INTO chat_approvals(tenant_id,user_id,conversation_id,method,path,body,display,expires_at) VALUES($1,$2,$3,'POST',$4,$5::jsonb,$6::jsonb,now()+interval '24 hours') RETURNING id,expires_at", self.tenant_id, self.user_id, self.conversation_id, path, json.dumps(body), json.dumps(display) if display is not None else None)
        approval = {'id': str(row['id']), 'action': action, 'parameters': display if display is not None else body, 'status': 'pending', 'expires_at': row['expires_at'].isoformat()}
        if self.emit:
            await self.emit(approval)
        return approval

    async def propose_video(self, prompt: str, visual: str, narration: str = '', aspect_ratio: str = '9:16', photo_ids: list[str] | None = None) -> dict:
        """Propor vídeo de 15 segundos com cena, narração, formato e até quatro UUIDs de fotos produto ou equipe da biblioteca."""
        if not 10 <= len(prompt.strip()) <= 1000 or not 3 <= len(visual.strip()) <= 600 or len(narration) > 400 or aspect_ratio not in ('16:9', '9:16'):
            return {'error': 'Informe descrição, cena e proporção válidas.'}
        from uuid import UUID
        try:
            if photo_ids is not None and (not isinstance(photo_ids, list) or len(photo_ids) > 4):
                raise ValueError()
            normalized_photos = [str(UUID(value)) for value in (photo_ids or [])]
        except (ValueError, TypeError, AttributeError):
            return {'error': 'Informe até quatro IDs de fotos válidos.'}
        unavailable = VideoAvailability.refusal(await self.ady.video_options() if self.ady else None)
        if unavailable:
            return unavailable
        body = {'prompt':prompt, 'photoIds':normalized_photos, 'aspectRatio':aspect_ratio, 'duration':15, 'scenes':[{'start':0,'end':15,'visual':visual,'narration':narration}]}
        return await self._propose('Criar vídeo', '/api/studio/video/jobs', body)

    async def propose_instagram_post(self, caption: str, post_type: str, scheduled_at: str, image_url: str = '', image_urls: list[str] | None = None) -> dict:
        """Propor postagem no Instagram: mídia HTTPS única ou 2 a 10 URLs em image_urls para carrossel."""
        import re
        from datetime import datetime, timezone
        from zoneinfo import ZoneInfo
        from urllib.parse import urlparse
        def valid_url(url):
            parsed = urlparse(url)
            return parsed.scheme == 'https' and bool(parsed.netloc)
        def is_video(url):
            return bool(re.search(r'\.(mp4|mov)(\?|$)', url, re.IGNORECASE))
        try:
            dt = datetime.fromisoformat(scheduled_at.replace('Z', '+00:00'))
            if dt.tzinfo is None or dt <= datetime.now(timezone.utc) or len(caption) > 5000:
                raise ValueError()
            if post_type == 'carousel':
                if not isinstance(image_urls, list) or not 2 <= len(image_urls) <= 10 or not all(valid_url(url) for url in image_urls) or len({is_video(url) for url in image_urls}) != 1:
                    raise ValueError()
            elif post_type not in ('image', 'reel', 'stories') or not valid_url(image_url) or (post_type == 'reel' and not is_video(image_url)) or (post_type == 'image' and is_video(image_url)):
                raise ValueError()
        except (ValueError, TypeError):
            return {'error': 'Informe tipo, mídia HTTPS válida e horário futuro com fuso; a legenda é opcional.'}
        body = {'caption': caption, 'postType': post_type, 'platform': 'instagram', 'date': dt.astimezone(ZoneInfo('America/Sao_Paulo')).date().isoformat(), 'scheduledAt': dt.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')}
        if post_type == 'carousel':
            body['imageUrls'] = image_urls
        else:
            body['imageUrl'] = image_url
        return await self._propose('Agendar postagem', '/api/planner/posts', body)

    async def propose_campaign(self, name: str, objective: str, daily_budget_cents: int, ad_account_id: str) -> dict:
        """Propor campanha Meta; orçamento diário é inteiro em centavos de real numa conta BRL."""
        import re
        if len(name.strip()) < 3 or objective not in ('OUTCOME_SALES','OUTCOME_LEADS','OUTCOME_TRAFFIC','OUTCOME_AWARENESS') or isinstance(daily_budget_cents, bool) or daily_budget_cents < 500 or not re.fullmatch(r'act_[0-9]{1,32}', ad_account_id):
            return {'error': 'Informe nome, objetivo, conta e orçamento diário de pelo menos 500 centavos.'}
        try:
            response = await self.ady.client.get(self.ady.base_url + '/api/campaigns/chat-account/' + ad_account_id, headers={'Authorization':'Bearer '+self.ady.token}, timeout=10)
            response.raise_for_status()
            account = response.json()['data']
            if account.get('id') != ad_account_id or account.get('currency') != 'BRL':
                raise ValueError()
        except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
            return {'error':'Não foi possível confirmar que a conta de anúncios usa BRL.'}
        body = {'name':name, 'objective':objective, 'dailyBudget':daily_budget_cents, 'adAccountId':ad_account_id}
        return await self._propose('Criar campanha', '/api/campaigns/create', body, {**body, 'currency':'BRL'})

    async def propose_cancel_post(self, post_id: str) -> dict:
        """Propor cancelamento de agendamento de post do Instagram identificado pelo UUID."""
        import json
        from uuid import UUID
        try:
            post_id = str(UUID(post_id))
            response = await self.ady.client.get(self.ady.base_url + '/api/planner/posts/' + post_id + '/chat-snapshot', headers={'Authorization': 'Bearer ' + self.ady.token}, timeout=10)
            response.raise_for_status()
            snapshot = response.json()['data']
            if snapshot.get('platform') != 'instagram' or snapshot.get('status') != 'approved' or not snapshot.get('scheduledAt') or not str(snapshot.get('version', '')).isdigit():
                raise ValueError()
        except (ValueError, KeyError, TypeError, httpx.HTTPError):
            return {'error': 'Não foi possível consultar um post agendado do Instagram.'}
        path = '/api/planner/posts/' + post_id + '/chat-cancel'
        body = {'version': str(snapshot['version'])}
        row = await self.db.fetchrow("INSERT INTO chat_approvals(tenant_id,user_id,conversation_id,method,path,body,display,expires_at) VALUES($1,$2,$3,'PATCH',$4,$5::jsonb,$6::jsonb,now()+interval '24 hours') RETURNING id,expires_at", self.tenant_id, self.user_id, self.conversation_id, path, json.dumps(body), json.dumps(snapshot))
        approval = {'id':str(row['id']), 'action':'Cancelar agendamento', 'parameters':snapshot, 'status':'pending', 'expires_at':row['expires_at'].isoformat()}
        if self.emit:
            await self.emit(approval)
        return approval

    async def propose_brand_update(self, primary_color: str = '', secondary_color: str = '', voice_tone: str = '', whatsapp_number: str = '', clear_whatsapp: bool = False) -> dict:
        """Propor cores #RRGGBB, tom professional/casual/urgent/premium ou WhatsApp com 10–15 dígitos. Para remover o número, use clear_whatsapp."""
        import json
        import re
        changes = {key:value for key,value in {'primary_color':primary_color, 'secondary_color':secondary_color, 'voice_tone':voice_tone}.items() if value}
        if whatsapp_number and clear_whatsapp:
            return {'error':'Informe um número ou peça remoção, não ambos.'}
        if whatsapp_number:
            if not re.fullmatch(r'[0-9]{10,15}', whatsapp_number):
                return {'error':'Informe WhatsApp com 10 a 15 dígitos.'}
            changes['whatsapp_number'] = whatsapp_number
        elif clear_whatsapp:
            changes['whatsapp_number'] = None
        if not changes or any(not re.fullmatch(r'#[0-9a-fA-F]{6}', changes[k]) for k in ('primary_color','secondary_color') if k in changes) or ('voice_tone' in changes and voice_tone not in ('professional','casual','urgent','premium')):
            return {'error':'Informe pelo menos uma cor ou tom válido.'}
        try:
            response = await self.ady.client.get(self.ady.base_url + '/api/brand-kit/chat-snapshot', headers={'Authorization':'Bearer '+self.ady.token}, timeout=10)
            response.raise_for_status()
            snapshot = response.json()['data']
            version = str(snapshot['version'])
            if version != 'absent' and not version.isdigit(): raise ValueError()
        except (httpx.HTTPError, KeyError, ValueError, TypeError):
            return {'error':'Não foi possível consultar a marca para atualização.'}
        body = {'version':version, **changes}
        display = {'atual':snapshot, 'alterações':changes}
        row = await self.db.fetchrow("INSERT INTO chat_approvals(tenant_id,user_id,conversation_id,method,path,body,display,expires_at) VALUES($1,$2,$3,'PATCH',$4,$5::jsonb,$6::jsonb,now()+interval '24 hours') RETURNING id,expires_at", self.tenant_id, self.user_id, self.conversation_id, '/api/brand-kit/chat-update', json.dumps(body), json.dumps(display))
        approval = {'id':str(row['id']), 'action':'Atualizar marca', 'parameters':display, 'status':'pending', 'expires_at':row['expires_at'].isoformat()}
        if self.emit: await self.emit(approval)
        return approval

    async def propose_edit_image(self, asset_id: str, feedback: str) -> dict:
        """Propor edição de imagem existente por UUID e descrição do ajuste."""
        import json
        from uuid import UUID
        try:
            asset_id = str(UUID(asset_id))
            if not 3 <= len(feedback.strip()) <= 1000:
                raise ValueError()
            response = await self.ady.client.get(self.ady.base_url + '/api/studio/ai/assets/' + asset_id + '/chat-snapshot', headers={'Authorization':'Bearer '+self.ady.token}, timeout=10)
            response.raise_for_status()
            snapshot = response.json()['data']
            version = str(snapshot['version'])
            if snapshot.get('type') != 'image' or not version.isdigit(): raise ValueError()
        except (ValueError, KeyError, TypeError, httpx.HTTPError):
            return {'error':'Não foi possível consultar essa imagem para edição.'}
        body = {'assetId':asset_id, 'version':version, 'feedback':feedback}
        display = {'imagem':snapshot, 'ajuste':feedback}
        row = await self.db.fetchrow("INSERT INTO chat_approvals(tenant_id,user_id,conversation_id,method,path,body,display,expires_at) VALUES($1,$2,$3,'POST',$4,$5::jsonb,$6::jsonb,now()+interval '24 hours') RETURNING id,expires_at", self.tenant_id, self.user_id, self.conversation_id, '/api/studio/ai/chat-edit', json.dumps(body), json.dumps(display))
        approval = {'id':str(row['id']), 'action':'Editar imagem', 'parameters':display, 'status':'pending', 'expires_at':row['expires_at'].isoformat()}
        if self.emit: await self.emit(approval)
        return approval

    async def propose_edit_video(self, asset_id: str, feedback: str) -> dict:
        """Propor ajuste de vídeo existente; somente vídeos compatíveis podem ser ajustados."""
        import json
        from uuid import UUID
        try:
            asset_id = str(UUID(asset_id))
            if not 3 <= len(feedback.strip()) <= 500: raise ValueError()
            unavailable = VideoAvailability.refusal(await self.ady.video_options() if self.ady else None, creation=False)
            if unavailable:
                return unavailable
            response = await self.ady.client.get(self.ady.base_url + '/api/studio/ai/assets/' + asset_id + '/chat-snapshot', headers={'Authorization':'Bearer '+self.ady.token}, timeout=10)
            response.raise_for_status()
            snapshot = response.json()['data']
            version = str(snapshot['version'])
            if snapshot.get('type') != 'video' or not version.isdigit(): raise ValueError()
        except (ValueError, KeyError, TypeError, httpx.HTTPError):
            return {'error':'Não foi possível consultar esse vídeo para ajuste.'}
        body = {'version':version, 'feedback':feedback}
        display = {'vídeo':snapshot, 'ajuste':feedback}
        path = '/api/studio/video/assets/' + asset_id + '/chat-adjust'
        row = await self.db.fetchrow("INSERT INTO chat_approvals(tenant_id,user_id,conversation_id,method,path,body,display,expires_at) VALUES($1,$2,$3,'POST',$4,$5::jsonb,$6::jsonb,now()+interval '24 hours') RETURNING id,expires_at", self.tenant_id, self.user_id, self.conversation_id, path, json.dumps(body), json.dumps(display))
        approval = {'id':str(row['id']), 'action':'Editar vídeo', 'parameters':display, 'status':'pending', 'expires_at':row['expires_at'].isoformat()}
        if self.emit: await self.emit(approval)
        return approval

    async def propose_campaign_update(self, campaign_id: str, action: str, name: str = '', daily_budget_cents: int = 0) -> dict:
        """Propor pausa, renomeação ou orçamento diário de campanha: action pause, rename ou budget."""
        import json
        import re
        from uuid import UUID
        if action == 'budget' and self.ady is None:
            return {'error':'Alteração de orçamento indisponível até validar a moeda da conta.'}
        try:
            campaign_id = str(UUID(campaign_id))
            if action not in ('pause','rename','budget'): raise ValueError()
            if action == 'rename' and not 3 <= len(name.strip()) <= 255: raise ValueError()
            if action == 'budget' and (isinstance(daily_budget_cents, bool) or daily_budget_cents < 500): raise ValueError()
            response = await self.ady.client.get(self.ady.base_url + '/api/campaigns/' + campaign_id + '/chat-snapshot', headers={'Authorization':'Bearer '+self.ady.token}, timeout=10)
            response.raise_for_status()
            snapshot = response.json()['data']
            version = str(snapshot['version'])
            if not re.fullmatch('[a-f0-9]{64}', version): raise ValueError()
            if action == 'budget' and snapshot.get('currency') != 'BRL':
                return {'error':'Alteração de orçamento indisponível: moeda BRL não confirmada.'}
        except (ValueError, KeyError, TypeError, httpx.HTTPError):
            return {'error':'Não foi possível consultar a campanha ou os dados informados são inválidos.'}
        changes = {'action':action}
        if action == 'rename': changes['name'] = name.strip()
        if action == 'budget': changes['dailyBudget'] = daily_budget_cents
        body = {'version':version, **changes}
        shown_snapshot = snapshot if snapshot.get('currency') == 'BRL' else {key:value for key,value in snapshot.items() if key not in ('dailyBudget','lifetimeBudget')}
        display = {'atual':shown_snapshot, 'alterações':changes, 'observação':'O estado da Meta será conferido novamente, mas pode mudar após a conferência.'}
        path = '/api/campaigns/'+campaign_id+'/chat-update'
        row = await self.db.fetchrow("INSERT INTO chat_approvals(tenant_id,user_id,conversation_id,method,path,body,display,expires_at) VALUES($1,$2,$3,'PATCH',$4,$5::jsonb,$6::jsonb,now()+interval '24 hours') RETURNING id,expires_at", self.tenant_id, self.user_id, self.conversation_id, path, json.dumps(body), json.dumps(display))
        approval = {'id':str(row['id']), 'action':{'pause':'Pausar campanha','rename':'Renomear campanha','budget':'Alterar orçamento da campanha'}[action], 'parameters':display, 'status':'pending', 'expires_at':row['expires_at'].isoformat()}
        if self.emit: await self.emit(approval)
        return approval

    async def propose_ad_update(self, campaign_id: str, ad_id: str, action: str, name: str = '', creative_id: str = '') -> dict:
        """Propor pausa, renomeação, cópia pausada ou troca de criativo: action pause, rename, duplicate ou creative."""
        import json
        import re
        from uuid import UUID
        try:
            campaign_id = str(UUID(campaign_id))
            if not re.fullmatch(r'[0-9]{1,32}', ad_id) or action not in ('pause','rename','duplicate','creative'): raise ValueError()
            if action in ('rename','duplicate') and not 3 <= len(name.strip()) <= 255: raise ValueError()
            if action == 'creative' and not re.fullmatch(r'[0-9]{1,32}', creative_id): raise ValueError()
            path = '/api/campaigns/'+campaign_id+'/chat-ads/'+ad_id
            response = await self.ady.client.get(self.ady.base_url + path, params={'creativeId':creative_id} if action == 'creative' else None, headers={'Authorization':'Bearer '+self.ady.token}, timeout=10)
            response.raise_for_status()
            snapshot = response.json()['data']
            version = str(snapshot['version'])
            if not re.fullmatch('[a-f0-9]{64}', version): raise ValueError()
        except (ValueError, KeyError, TypeError, httpx.HTTPError):
            return {'error':'Não foi possível consultar o anúncio ou os dados informados são inválidos.'}
        changes = {'action':action}
        if action in ('rename','duplicate'): changes['name'] = name.strip()
        if action == 'creative': changes['creativeId'] = creative_id
        body = {'version':version, **changes}
        display = {'atual':snapshot, 'alterações':changes, 'observação':'O estado da Meta será conferido novamente, mas pode mudar após a conferência.'}
        row = await self.db.fetchrow("INSERT INTO chat_approvals(tenant_id,user_id,conversation_id,method,path,body,display,expires_at) VALUES($1,$2,$3,'PATCH',$4,$5::jsonb,$6::jsonb,now()+interval '24 hours') RETURNING id,expires_at", self.tenant_id, self.user_id, self.conversation_id, path, json.dumps(body), json.dumps(display))
        approval = {'id':str(row['id']), 'action':{'pause':'Pausar anúncio','rename':'Renomear anúncio','duplicate':'Duplicar anúncio pausado','creative':'Alterar criativo do anúncio'}[action], 'parameters':display, 'status':'pending', 'expires_at':row['expires_at'].isoformat()}
        if self.emit: await self.emit(approval)
        return approval

    async def propose_ad_create(self, campaign_id: str, adset_id: str, creative_id: str, name: str) -> dict:
        """Propor anúncio pausado com conjunto e criativo existentes e autorizados."""
        import json
        import re
        from uuid import UUID
        try:
            campaign_id = str(UUID(campaign_id))
            if not re.fullmatch(r'[0-9]{1,32}', adset_id) or not re.fullmatch(r'[0-9]{1,32}', creative_id) or not 3 <= len(name.strip()) <= 255:
                raise ValueError()
            path = '/api/campaigns/'+campaign_id+'/chat-ads-create'
            response = await self.ady.client.get(self.ady.base_url + path + '/snapshot', params={'adsetId':adset_id,'creativeId':creative_id}, headers={'Authorization':'Bearer '+self.ady.token}, timeout=10)
            response.raise_for_status()
            snapshot = response.json()['data']
            version = str(snapshot['version'])
            if not re.fullmatch('[a-f0-9]{64}', version): raise ValueError()
        except (ValueError, KeyError, TypeError, httpx.HTTPError):
            return {'error':'Não foi possível validar conjunto e criativo para o anúncio.'}
        body = {'version':version, 'name':name.strip(), 'adsetId':adset_id, 'creativeId':creative_id}
        display = {'atual':snapshot, 'alterações':{'nome':name.strip(),'status':'PAUSED'}, 'observação':'O estado da Meta será conferido novamente, mas pode mudar após a conferência.'}
        row = await self.db.fetchrow("INSERT INTO chat_approvals(tenant_id,user_id,conversation_id,method,path,body,display,expires_at) VALUES($1,$2,$3,'POST',$4,$5::jsonb,$6::jsonb,now()+interval '24 hours') RETURNING id,expires_at", self.tenant_id, self.user_id, self.conversation_id, path, json.dumps(body), json.dumps(display))
        approval = {'id':str(row['id']), 'action':'Criar anúncio pausado', 'parameters':display, 'status':'pending', 'expires_at':row['expires_at'].isoformat()}
        if self.emit: await self.emit(approval)
        return approval

    async def propose_profile_update(self, name: str | None = None, tenant_name: str | None = None, business_context: str | None = None) -> dict:
        """Propor atualização do nome do usuário, nome do negócio ou contexto comercial."""
        import json
        changes = {}
        if name is not None:
            if not 1 <= len(name.strip()) <= 255: return {'error':'Informe um nome de usuário válido.'}
            changes['name'] = name.strip()
        if tenant_name is not None:
            if not 1 <= len(tenant_name.strip()) <= 255: return {'error':'Informe um nome de negócio válido.'}
            changes['tenantName'] = tenant_name.strip()
        if business_context is not None:
            if len(business_context) > 10000: return {'error':'O contexto informado é muito longo.'}
            changes['businessContext'] = business_context
        if not changes: return {'error':'Informe pelo menos um dado para alterar.'}
        try:
            response = await self.ady.client.get(self.ady.base_url + '/api/auth/me/chat-snapshot', headers={'Authorization':'Bearer '+self.ady.token}, timeout=10)
            response.raise_for_status()
            snapshot = response.json()['data']
            uv, tv = str(snapshot['userVersion']), str(snapshot['tenantVersion'])
            if not uv.isdigit() or not tv.isdigit(): raise ValueError()
        except (httpx.HTTPError, KeyError, ValueError, TypeError):
            return {'error':'Não foi possível consultar perfil e negócio.'}
        body = {'userVersion':uv, 'tenantVersion':tv, **changes}
        display = {'atual':snapshot, 'alterações':changes}
        if 'tenantName' in changes:
            display['observação'] = 'A alteração do nome também atualiza o identificador do negócio.'
        row = await self.db.fetchrow("INSERT INTO chat_approvals(tenant_id,user_id,conversation_id,method,path,body,display,expires_at) VALUES($1,$2,$3,'PATCH',$4,$5::jsonb,$6::jsonb,now()+interval '24 hours') RETURNING id,expires_at", self.tenant_id, self.user_id, self.conversation_id, '/api/auth/me/chat-update', json.dumps(body), json.dumps(display))
        approval = {'id':str(row['id']), 'action':'Atualizar perfil e negócio', 'parameters':display, 'status':'pending', 'expires_at':row['expires_at'].isoformat()}
        if self.emit: await self.emit(approval)
        return approval
