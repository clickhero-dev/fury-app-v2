export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
}

export enum CreativeType {
  IMAGE = 'image',
  VIDEO = 'video',
  COPY = 'copy',
}

export enum ComplianceStatus {
  PENDING = 'pending',
  PENDING_COMPLIANCE = 'pending_compliance',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum CampaignStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  ARCHIVED = 'archived',
}
