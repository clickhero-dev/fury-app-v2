/**
 * A credential rejected by Meta must only be retried through an explicit
 * user action. In particular, browser focus and network reconnects must not
 * continually call the API with the same invalid token.
 */
export const metaSelectionQuerySafety = {
  retry: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;
