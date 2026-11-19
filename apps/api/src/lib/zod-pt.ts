import { z, ZodIssueCode, type ZodErrorMap } from 'zod';

// mensagens padrão do zod em português; mensagem definida no schema continua valendo
export const ptErrorMap: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      return { message: issue.received === 'undefined' || issue.received === 'null' ? 'Campo obrigatório' : 'Tipo de valor inválido' };
    case ZodIssueCode.invalid_string:
      if (issue.validation === 'email') return { message: 'Endereço de e-mail inválido' };
      if (issue.validation === 'url') return { message: 'Endereço (URL) inválido' };
      if (issue.validation === 'uuid') return { message: 'Identificador inválido' };
      if (issue.validation === 'datetime' || issue.validation === 'date') return { message: 'Data inválida' };
      return { message: 'Formato inválido' };
    case ZodIssueCode.too_small:
      return { message: sizeMessage('min', issue.type, Number(issue.minimum)) };
    case ZodIssueCode.too_big:
      return { message: sizeMessage('max', issue.type, Number(issue.maximum)) };
    case ZodIssueCode.invalid_enum_value:
    case ZodIssueCode.invalid_literal:
    case ZodIssueCode.invalid_union:
    case ZodIssueCode.invalid_union_discriminator:
      return { message: 'Opção inválida' };
    case ZodIssueCode.invalid_date:
      return { message: 'Data inválida' };
    case ZodIssueCode.not_multiple_of:
      return { message: `Deve ser múltiplo de ${issue.multipleOf}` };
    case ZodIssueCode.unrecognized_keys:
      return { message: 'Campo não permitido' };
    case ZodIssueCode.custom:
      return { message: 'Valor inválido' };
    default:
      return { message: ctx.defaultError };
  }
};

function sizeMessage(edge: 'min' | 'max', type: string, n: number): string {
  const word = edge === 'min' ? 'Mínimo' : 'Máximo';
  if (type === 'string') return `${word} de ${n} caractere${n === 1 ? '' : 's'}`;
  if (type === 'array' || type === 'set') return `${word} de ${n} ${n === 1 ? 'item' : 'itens'}`;
  if (type === 'date') return edge === 'min' ? 'Data anterior ao permitido' : 'Data posterior ao permitido';
  return edge === 'min' ? `Deve ser no mínimo ${n}` : `Deve ser no máximo ${n}`;
}

z.setErrorMap(ptErrorMap);

// nome do campo na mensagem para o usuário
const FIELD_LABELS: Record<string, string> = {
  email: 'E-mail',
  password: 'Senha',
  currentPassword: 'Senha atual',
  newPassword: 'Nova senha',
  name: 'Nome',
  tenantId: 'Cliente',
  userRole: 'Cargo',
  origin: 'Origem',
  sort: 'Ordenação',
  role: 'Cargo',
  planId: 'Plano',
  phone: 'Telefone',
  title: 'Título',
  description: 'Descrição',
  url: 'Endereço (URL)',
  otp: 'Código',
  code: 'Código',
  text: 'Texto',
  key: 'Chave',
  userName: 'Nome',
  userEmail: 'E-mail',
  userPassword: 'Senha',
  tenantName: 'Nome do cliente',
  companyName: 'Nome da empresa',
  businessName: 'Nome da empresa',
  maxTenants: 'Vagas',
  priceCents: 'Preço',
  interval: 'Periodicidade',
  limits: 'Limites',
  adAccountId: 'Conta de anúncios',
  selectedAdAccountId: 'Conta de anúncios',
  campaignId: 'Campanha',
  dailyBudget: 'Orçamento diário',
  budget: 'Orçamento',
  headline: 'Título',
  primaryText: 'Texto principal',
  destinationUrl: 'Link de destino',
  startDate: 'Data de início',
  endDate: 'Data de término',
  scheduledAt: 'Data de publicação',
  caption: 'Legenda',
  prompt: 'Descrição da imagem',
  feedback: 'Ajuste',
  rating: 'Avaliação',
  city: 'Cidade',
  ageMin: 'Idade mínima',
  ageMax: 'Idade máxima',
  gender: 'Gênero',
  whatsapp_number: 'WhatsApp',
  primary_color: 'Cor principal',
  secondary_color: 'Cor secundária',
  voice_tone: 'Tom de voz',
  logo_url: 'Logo',
};

// só baixa a 1ª letra de palavra comum (preserva siglas: ID, URL, CPA)
const lowerFirst = (s: string) => (/^[A-ZÀ-Ý][a-zà-ÿ]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

// lista campo e motivo para a tela
export function describeZodIssues(issues: readonly { path: (string | number)[]; message: string }[]): string {
  const parts = issues.map((i) => {
    const key = [...i.path].reverse().find((p) => typeof p === 'string');
    if (!key) return i.message;
    return `${FIELD_LABELS[key] ?? key.slice(0, 40)}: ${lowerFirst(i.message)}`;
  });
  const unique = [...new Set(parts)];
  if (unique.length === 0) return 'Dados inválidos.';
  return `${unique.length === 1 ? 'Verifique o campo' : 'Verifique os campos'}: ${unique.join('; ')}.`;
}
