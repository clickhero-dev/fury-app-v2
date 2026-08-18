import { z } from 'zod';

export const GOOGLE_ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MISSING_ENV: 'MISSING_ENV',
  GOOGLE_TOKEN_EXPIRED: 'GOOGLE_TOKEN_EXPIRED',
  GOOGLE_TOKEN_EXCHANGE_FAILED: 'GOOGLE_TOKEN_EXCHANGE_FAILED',
  INVALID_OAUTH_STATE: 'INVALID_OAUTH_STATE',
  NOT_FOUND: 'NOT_FOUND',
  BUSINESS_SETTINGS_INCOMPLETE: 'BUSINESS_SETTINGS_INCOMPLETE',
  DUPLICATE_LOCATION: 'DUPLICATE_LOCATION',
  GBP_CREATION_NOT_SUPPORTED: 'GBP_CREATION_NOT_SUPPORTED',
  GBP_UPDATE_REJECTED: 'GBP_UPDATE_REJECTED',
  INVALID_CATEGORY: 'INVALID_CATEGORY',
  FORBIDDEN: 'FORBIDDEN',
} as const;

export type GoogleErrorCode = (typeof GOOGLE_ERROR_CODES)[keyof typeof GOOGLE_ERROR_CODES];

export const googleAddressSchema = z.object({
  street: z.string().max(500).default(''),
  city: z.string().max(255).default(''),
  state: z.string().max(100).default(''),
  postalCode: z.string().max(20).default(''),
  country: z.string().max(3).default('BR'),
});

export const googleBusinessHoursSchema = z
  .record(
    z.string(),
    z.array(z.object({ open: z.string(), close: z.string() })).optional()
  )
  .optional()
  .nullable();

const optionalText = (max: number) => z.string().max(max).optional().or(z.literal(''));

export const settingsSchema = z.object({
  name: z.string().min(1, 'Nome do negócio é obrigatório').max(255),
  address: googleAddressSchema,
  phone: z.string().min(1, 'Telefone é obrigatório').max(40),
  email: optionalText(255),
  website: optionalText(2048),
  categoryId: z.string().max(255).optional().nullable(),
  hours: googleBusinessHoursSchema,
});

export const profileUpdateSchema = settingsSchema.partial();

export const verificationSchema = z.object({
  method: z.enum(['POSTAL', 'PHONE', 'EMAIL'], {
    errorMap: () => ({ message: 'Método de verificação inválido' }),
  }),
});

export const connectionIdParamsSchema = z.object({
  id: z.string().uuid('ID da conexão inválido'),
});

export const profileIdParamsSchema = z.object({
  id: z.string().uuid('ID do perfil inválido'),
});

export const contextQuerySchema = z.object({
  context: z.enum(['onboarding', 'settings']).default('settings'),
});

export const oauthCallbackQuerySchema = z.object({
  code: z.string().min(1, 'Code OAuth ausente'),
  state: z.string().min(1, 'State OAuth ausente'),
});

export const lookupQuerySchema = z.object({
  query: z.string().min(1).max(255).optional(),
});

export const categoriesQuerySchema = z.object({
  query: z.string().max(255).optional(),
});

export const syncLogsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
});