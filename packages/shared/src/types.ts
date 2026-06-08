import { UserRole, CreativeType, ComplianceStatus, CampaignStatus } from './enums.js';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
}

export interface MetaConnection {
  id: string;
  tenantId: string;
  metaUserId: string;
  accessToken: string;
  tokenExpiresAt: Date | null;
  adAccounts: MetaAdAccount[];
  createdAt: Date;
}

export interface MetaAdAccount {
  id: string;
  name: string;
  account_status: number;
  currency: string;
}

export interface MetaConnectionSafe extends Omit<MetaConnection, 'accessToken'> {
  accessTokenLast4: string;
}

export interface Campaign {
  id: string;
  tenantId: string;
  metaCampaignId: string;
  name: string;
  status: CampaignStatus;
  budget: Record<string, unknown>;
  metrics: Record<string, unknown>;
  lastSyncedAt: Date | null;
  createdAt: Date;
}

export interface CreativeAsset {
  id: string;
  tenantId: string;
  type: CreativeType;
  url: string;
  metaAssetId: string | null;
  complianceStatus: ComplianceStatus;
  createdAt: Date;
}

export interface ClientGoal {
  id: string;
  tenantId: string;
  objective: string;
  monthlyBudget: Record<string, unknown>;
  targetCpa: Record<string, unknown>;
  niche: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FuryInsight {
  id: string;
  tenantId: string;
  campaignId: string;
  suggestionType: string;
  suggestionData: Record<string, unknown>;
  appliedAt: Date | null;
  createdAt: Date;
}

// DTO types (for API requests/responses without sensitive fields)
export interface UserDTO {
  id: string;
  tenantId: string;
  name: string | null;
  email: string;
  role: UserRole;
  createdAt: Date;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  role?: UserRole;
}

export interface UpdateUserRequest {
  email?: string;
  password?: string;
  role?: UserRole;
}

export interface CreateCampaignRequest {
  metaCampaignId: string;
  name: string;
  status?: CampaignStatus;
  budget?: Record<string, unknown>;
}

export interface UpdateCampaignRequest {
  name?: string;
  status?: CampaignStatus;
  budget?: Record<string, unknown>;
}

export interface CreateCreativeAssetRequest {
  type: CreativeType;
  url: string;
}

export interface CreateClientGoalRequest {
  objective: string;
  monthlyBudget?: Record<string, unknown>;
  targetCpa?: Record<string, unknown>;
  niche?: string;
}

export interface UpdateClientGoalRequest {
  objective?: string;
  monthlyBudget?: Record<string, unknown>;
  targetCpa?: Record<string, unknown>;
  niche?: string;
}
