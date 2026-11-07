import axios from 'axios';

export interface MetaSelectionError {
  code: string;
  message: string;
  isConnectionError: boolean;
}

export function getMetaSelectionError(error: unknown): MetaSelectionError {
  const apiError = axios.isAxiosError(error) ? error.response?.data?.error as { code?: string; message?: string } | undefined : undefined;
  const code = apiError?.code ?? '';
  const isConnectionError = code === 'META_TOKEN_EXPIRED' || code === 'META_PERMISSION_DENIED';
  return {
    code,
    isConnectionError,
    message: isConnectionError
      ? 'Sua conexão com a Meta precisa de atenção. Entre no Facebook e siga as instruções; depois reconecte sua conta. Confira também as permissões se o problema continuar.'
      : apiError?.message ?? (error instanceof Error ? error.message : 'Não foi possível carregar os ativos. Tente novamente.'),
  };
}

export function isConfirmedMetaSelection(
  saved: { instagramUserId?: string; businessIds?: string[]; pageIds?: string[]; adAccountIds?: string[] } | null | undefined,
  expected: { businessIds: string[]; pageIds: string[]; adAccountIds: string[]; instagramUserId: string },
) {
  return Boolean(saved) && saved.instagramUserId === expected.instagramUserId &&
    expected.businessIds.every((id) => saved.businessIds?.includes(id)) &&
    expected.pageIds.every((id) => saved.pageIds?.includes(id)) &&
    expected.adAccountIds.every((id) => saved.adAccountIds?.includes(id));
}
