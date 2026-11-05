export interface BudgetSuggestion {
  id: string;
  campaignId: string;
  campaignName: string;
  currentBudget: number;
  suggestedBudget: number;
  change_pct: number;
  reason: string;
  status: 'pending' | 'applied' | 'rejected';
  createdAt?: string;
  appliedAt?: string | null;
  rejectedAt?: string | null;
}

export interface BudgetConfig {
  tenantId: string;
  mode: 'suggestion' | 'auto';
  totalBudget: number;
  autoApplyEnabled: boolean;
  lastOptimizedAt?: string | null;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

// Trigger optimization response
export interface BudgetOptimizeData {
  optimizationId: string;
  totalBudget: number;
  mode: 'suggestion' | 'auto';
  suggestionsCount: number;
  suggestions: Omit<BudgetSuggestion, 'createdAt' | 'appliedAt' | 'rejectedAt'>[];
}

export type BudgetOptimizeResponse = ApiResponse<BudgetOptimizeData>;

// Get suggestions response
export interface BudgetSuggestionsData {
  count: number;
  suggestions: BudgetSuggestion[];
}

export type BudgetSuggestionsResponse = ApiResponse<BudgetSuggestionsData>;

// Apply single suggestion response
export type BudgetApplySuggestionResponse = ApiResponse<Omit<BudgetSuggestion, 'createdAt' | 'rejectedAt'>>;

// Reject single suggestion response
export type BudgetRejectSuggestionResponse = ApiResponse<Omit<BudgetSuggestion, 'createdAt' | 'appliedAt'>>;

// Get budget config response
export type BudgetConfigResponse = ApiResponse<BudgetConfig>;

// Apply bulk suggestions response
export interface BudgetApplyBulkData {
  appliedCount: number;
  appliedIds: string[];
  suggestions: Array<{
    id: string;
    campaignId: string;
    suggestedBudget: number;
    status: 'applied';
    appliedAt: string;
  }>;
}

export type BudgetApplyBulkResponse = ApiResponse<BudgetApplyBulkData>;

// Reject bulk suggestions response
export interface BudgetRejectBulkData {
  rejectedCount: number;
  rejectedIds: string[];
  suggestions: Array<{
    id: string;
    campaignId: string;
    suggestedBudget: number;
    status: 'rejected';
    rejectedAt: string;
  }>;
}

export type BudgetRejectBulkResponse = ApiResponse<BudgetRejectBulkData>;

// Query parameters
export interface GetSuggestionsParams {
  status?: 'pending' | 'applied' | 'rejected';
}

// Update config payload
export interface UpdateBudgetConfigPayload {
  mode?: 'suggestion' | 'auto';
  totalBudget?: number;
  autoApplyEnabled?: boolean;
}

// Apply bulk payload
export interface ApplyBulkPayload {
  suggestionIds: string[];
}

// Reject bulk payload
export interface RejectBulkPayload {
  suggestionIds: string[];
}
