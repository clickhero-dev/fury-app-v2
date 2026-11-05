# ADR 0003: Issue Jobs
## Context
Os jobs não estão rodando corretamente, e os erros não estão chegando no meu email.

## Decision
Será necessário revisar a configuração dos jobs e implementar um sistema de notificação de erros para garantir que os problemas sejam reportados corretamente.

## logs
[Meta API] Full error body: {
  "error": {
    "message": "(#100) The Media Insights API does not support the replies metric for this media product type.",
    "code": 100,
    "type": "OAuthException",
    "fbtrace_id": "AiaH36GAJ-rSzfPUpm9qFPT"
  }
}
[Instagram] /18065768356960952/insights?metric=replies indisponivel: [Meta API] 100: (#100) The Media Insights API does not support the replies metric for this media product type.
[Meta API] Error response: {
  path: '/18056875601595385/insights?metric=replies',
  status: 400,
  code: 100,
  subcode: undefined,
  type: 'OAuthException',
  message: '(#100) The Media Insights API does not support the replies metric for this media product type.'
}
[Meta API] Full error body: {
  "error": {
    "message": "(#100) The Media Insights API does not support the replies metric for this media product type.",
    "type": "OAuthException",
    "code": 100,
    "fbtrace_id": "AXDQvym88i4frS9aG1owo3C"
  }
}
[Instagram] /18056875601595385/insights?metric=replies indisponivel: [Meta API] 100: (#100) The Media Insights API does not support the replies metric for this media product type.
[Meta API] Error response: {
  path: '/18517795102025787/insights?metric=plays',
  status: 400,
  code: 100,
  subcode: undefined,
  type: 'OAuthException',
  message: '(#100) metric[0] must be one of the following values: impressions, reach, replies, saved, likes, comments, shares, total_interactions, follows, profile_visits, profile_activity, navigation, ig_reels_video_view_total_time, ig_reels_avg_watch_time, views, reels_skip_rate, reposts, facebook_views, crossposted_views, total_views, total_likes, total_comments, link_clicks'
}
[Meta API] Full error body: {
  "error": {
    "message": "(#100) metric[0] must be one of the following values: impressions, reach, replies, saved, likes, comments, shares, total_interactions, follows, profile_visits, profile_activity, navigation, ig_reels_video_view_total_time, ig_reels_avg_watch_time, views, reels_skip_rate, reposts, facebook_views, crossposted_views, total_views, total_likes, total_comments, link_clicks",
    "type": "OAuthException",
    "code": 100,
    "fbtrace_id": "A5fLBLgJq5K8jdjgWHOccEu"
  }
}
[Instagram] /18517795102025787/insights?metric=plays indisponivel: [Meta API] 100: (#100) metric[0] must be one of the following values: impressions, reach, replies, saved, likes, comments, shares, total_interactions, follows, profile_visits, profile_activity, navigation, ig_reels_video_view_total_time, ig_reels_avg_watch_time, views, reels_skip_rate, reposts, facebook_views, crossposted_views, total_views, total_likes, total_comments, link_clicks
[Meta API] Error response: {
  path: '/18053880746614412/insights?metric=replies',
  status: 400,
  code: 100,
  subcode: undefined,
  type: 'OAuthException',
  message: '(#100) The Media Insights API does not support the replies metric for this media product type.'
}
[Meta API] Full error body: {
  "error": {
    "message": "(#100) The Media Insights API does not support the replies metric for this media product type.",
    "code": 100,
    "type": "OAuthException",
    "fbtrace_id": "AIZwU76qNBS5x8yX1OwZWJl"
  }
}
[Instagram] /18053880746614412/insights?metric=replies indisponivel: [Meta API] 100: (#100) The Media Insights API does not support the replies metric for this media product type.
[Meta API] Error response: {
  path: '/17891094939294655/insights?metric=plays',
  status: 400,
  code: 100,
  subcode: undefined,
  type: 'OAuthException',
  message: '(#100) metric[0] must be one of the following values: impressions, reach, replies, saved, likes, comments, shares, total_interactions, follows, profile_visits, profile_activity, navigation, ig_reels_video_view_total_time, ig_reels_avg_watch_time, views, reels_skip_rate, reposts, facebook_views, crossposted_views, total_views, total_likes, total_comments, link_clicks'
}
[Meta API] Full error body: {
  "error": {
    "message": "(#100) metric[0] must be one of the following values: impressions, reach, replies, saved, likes, comments, shares, total_interactions, follows, profile_visits, profile_activity, navigation, ig_reels_video_view_total_time, ig_reels_avg_watch_time, views, reels_skip_rate, reposts, facebook_views, crossposted_views, total_views, total_likes, total_comments, link_clicks",
    "type": "OAuthException",
    "code": 100,
    "fbtrace_id": "AtsJsazw8cpSJR83qp_Zp_s"
  }
}
[Instagram] /17891094939294655/insights?metric=plays indisponivel: [Meta API] 100: (#100) metric[0] must be one of the following values: impressions, reach, replies, saved, likes, comments, shares, total_interactions, follows, profile_visits, profile_activity, navigation, ig_reels_video_view_total_time, ig_reels_avg_watch_time, views, reels_skip_rate, reposts, facebook_views, crossposted_views, total_views, total_likes, total_comments, link_clicks
[Meta API] Error response: {
  path: '/17891094939294655/insights?metric=replies',
  status: 400,
  code: 100,
  subcode: undefined,
  type: 'OAuthException',
  message: '(#100) The Media Insights API does not support the replies metric for this media product type.'
}
[Meta API] Full error body: {
  "error": {
    "message": "(#100) The Media Insights API does not support the replies metric for this media product type.",
    "type": "OAuthException",
    "code": 100,
    "fbtrace_id": "AXllG2YRJBvABdrgMAu1H2I"
  }
}
[Instagram] /17891094939294655/insights?metric=replies indisponivel: [Meta API] 100: (#100) The Media Insights API does not support the replies metric for this media product type.
[Meta API] Error response: {
  path: '/18517795102025787/insights?metric=replies',
  status: 400,
  code: 100,
  subcode: undefined,
  type: 'OAuthException',
  message: '(#100) The Media Insights API does not support the replies metric for this media product type.'
}
[Meta API] Full error body: {
  "error": {
    "message": "(#100) The Media Insights API does not support the replies metric for this media product type.",
    "type": "OAuthException",
    "code": 100,
    "fbtrace_id": "AIcTkjuDbxD0YSWwQpg8m4i"
  }
}
[Instagram] /18517795102025787/insights?metric=replies indisponivel: [Meta API] 100: (#100) The Media Insights API does not support the replies metric for this media product type.
[Meta API] Error response: {
  path: '/18051429707571249/insights?metric=replies',
  status: 400,
  code: 100,
  subcode: undefined,
  type: 'OAuthException',
  message: '(#100) The Media Insights API does not support the replies metric for this media product type.'
}
[Meta API] Full error body: {
  "error": {
    "message": "(#100) The Media Insights API does not support the replies metric for this media product type.",
    "type": "OAuthException",
    "code": 100,
    "fbtrace_id": "AfNhwXt9vYSNSWb0QfaGdQP"
  }
}
[Instagram] /18051429707571249/insights?metric=replies indisponivel: [Meta API] 100: (#100) The Media Insights API does not support the replies metric for this media product type.