// Textos em pt-BR da assinatura; o valor salvo segue em inglês
const STATUS_LABELS: Record<string, string> = {
  trial: "Teste",
  active: "Ativo",
  past_due: "Pagamento atrasado",
  cancelled: "Cancelado",
  inactive: "Inativo",
};

const INTERVAL_LABELS: Record<string, string> = { monthly: "mês", yearly: "ano" };

export const statusLabel = (status: string) => STATUS_LABELS[status] ?? status;
export const intervalLabel = (interval: string) => INTERVAL_LABELS[interval] ?? interval;

export const formatPlanPrice = (priceCents: number) =>
  (priceCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
