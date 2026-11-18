"""Local, explicit homologation policy; never queries provider catalogs."""
import json
import os
import re
from dataclasses import dataclass, field
from collections.abc import Mapping

MAX_FALLBACK_MODELS = 8
_MODEL_ID = re.compile(r'[A-Za-z0-9._-]+/[A-Za-z0-9/._:-]+')
_CORE_PARAMETERS = frozenset({'model', 'messages', 'stream', 'stream_options'})


def _valid_model(value):
    return isinstance(value, str) and len(value) <= 128 and _MODEL_ID.fullmatch(value)


@dataclass(frozen=True)
class ProviderPolicy:
    models: tuple[str, ...] = ()
    capabilities: dict = field(default_factory=dict)

    @classmethod
    def from_env(cls, env: Mapping | None = None):
        env = os.environ if env is None else env
        raw = env.get('CHAT_FALLBACK_MODELS', '').strip()
        try:
            models = json.loads(raw) if raw.startswith('[') else [v.strip() for v in raw.split(',')] if raw else []
            if (not isinstance(models, list) or len(models) > MAX_FALLBACK_MODELS
                    or any(not _valid_model(model) for model in models)):
                raise ValueError
            capabilities = json.loads(env.get('CHAT_FALLBACK_CAPABILITIES', '{}'))
            if not isinstance(capabilities, dict) or len(capabilities) > MAX_FALLBACK_MODELS:
                raise ValueError
            for model, config in capabilities.items():
                if (not _valid_model(model) or not isinstance(config, dict)
                        or set(config) - {'supported_parameters', 'vision'}
                        or not isinstance(config.get('supported_parameters'), list)
                        or any(not isinstance(p, str) or not re.fullmatch(r'[a-z_]{1,64}', p)
                               for p in config['supported_parameters'])
                        or type(config.get('vision', False)) is not bool):
                    raise ValueError
        except (ValueError, TypeError):
            raise ValueError('Invalid chat fallback configuration') from None
        return cls(tuple(dict.fromkeys(models)), capabilities)

    def candidates(self, payload):
        """Unknown parameters/modalities fail closed: skip, never strip context."""
        required = set(payload) - _CORE_PARAMETERS
        # Text-only parts are universally compatible; every other modality must
        # be explicitly homologated (only image input is supported here).
        modalities = {
            part.get('type') for message in payload.get('messages', [])
            if isinstance(message, dict) and isinstance(message.get('content'), list)
            for part in message['content'] if isinstance(part, dict)
        }
        result = []
        for model in self.models:
            config = self.capabilities.get(model)
            if model == payload.get('model') or config is None:
                continue
            if not required <= set(config['supported_parameters']):
                continue
            if modalities - {'text'} and (
                not config.get('vision') or modalities - {'text', 'image_url'}
            ):
                continue
            result.append(model)
        return tuple(result)
