"""Availability policy for proposals; the API remains the quota authority."""
from action_outcomes import ActionRefusal

UNAVAILABLE = 'Não foi possível verificar a disponibilidade de vídeos. Nenhuma proposta foi criada.'


class VideoAvailability:
    @staticmethod
    def refusal(options, *, creation: bool = True) -> dict | None:
        if not isinstance(options, dict) or not isinstance(options.get('enabled'), bool):
            return {'error': UNAVAILABLE}
        if not options['enabled']:
            return ActionRefusal('VIDEO_NOT_IN_PLAN').result()
        remaining = options.get('videosRemaining')
        if 'videosRemaining' not in options or (remaining is not None and (type(remaining) is not int or remaining < 0)):
            return {'error': UNAVAILABLE}
        # Adjustments have a per-video quota, not the monthly creation quota.
        # Neither options nor the versioned snapshot exposes that quota; the API
        # must still enforce it on confirmation.
        if creation and remaining == 0:
            return ActionRefusal('VIDEO_QUOTA_EXCEEDED').result()
        return None
