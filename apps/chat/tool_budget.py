"""Limita dados externos antes de incorporá-los ao contexto do modelo."""
import json


NOTICE = 'Conteúdo omitido por limite de contexto; consulte páginas menores ou filtre os resultados.'
MAX_BYTES = 8192


def limit_tool_result(value):
    """Mantém resultados pequenos intactos e reduz resultados extensos de forma explícita."""
    def clean(item, depth=0):
        if depth > 8:
            return NOTICE
        if isinstance(item, str):
            if item.lower().startswith('data:'):
                return '[Dados binários omitidos]'
            if len(item) > 512:
                if item.lower().startswith(('https://', 'http://')):
                    return '[URL extensa omitida]'
                return item[:512] + ' [conteúdo omitido]'
            return item
        if isinstance(item, dict):
            result = {str(k): clean(v, depth + 1) for k, v in list(item.items())[:30]}
            if len(item) > 30:
                result['_contexto'] = NOTICE
            return result
        if isinstance(item, (list, tuple)):
            result = [clean(v, depth + 1) for v in item[:8]]
            if len(item) > 8:
                result.append(NOTICE)
            return result
        if item is None or isinstance(item, (bool, int, float)):
            return item
        return '[Conteúdo omitido: formato não suportado]'

    cleaned = clean(value)
    if len(json.dumps(cleaned, ensure_ascii=False).encode('utf-8')) <= MAX_BYTES:
        return cleaned
    # Nunca entrega JSON incompleto ao modelo. O marcador pede uma consulta mais específica.
    return {'resultado': NOTICE}


async def budget_tool_result(function, args):
    return limit_tool_result(await function(**args))
