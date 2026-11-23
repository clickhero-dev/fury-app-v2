import { TenantScopedRepository } from './base.repository.js';

/**
 * Porta de persistência da experiência comercial demo.
 *
 * A única leitura necessária é a identidade do tenant já autenticado. O dataset
 * é mantido no domínio, nunca no banco de um cliente, para evitar mistura de
 * dados demonstrativos e reais (ADR-0001).
 */
export class DemoDashboardRepository extends TenantScopedRepository {}
