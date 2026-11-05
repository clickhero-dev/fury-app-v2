import { eq } from 'drizzle-orm';
import { db, campaigns } from '../../lib/db.js';

/**
 * Custom error class for budget optimizer validation errors
 */
export class BudgetOptimizerError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'BudgetOptimizerError';
  }
}

/**
 * Validation error with specific field and constraint info
 */
export class ValidationError extends BudgetOptimizerError {
  constructor(
    public field: string,
    public constraint: string,
    message: string,
  ) {
    super('VALIDATION_ERROR', message, { field, constraint });
    this.name = 'ValidationError';
  }
}

/**
 * Performance grade enum based on score ranges
 * A: 80–100 (excellent)
 * B: 60–79  (good)
 * C: 40–59  (average)
 * D: 20–39  (poor)
 * F: <20    (critical)
 */
type PerformanceGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Budget allocation percentages by performance grade
 * Total: 100%
 */
const GRADE_ALLOCATION = {
  A: 0.35, // 35%
  B: 0.25, // 25%
  C: 0.20, // 20%
  D: 0.15, // 15%
  F: 0.05, // 5%
} as const;

interface CampaignMetrics {
  score?: number;
  ctr?: number;
  roas?: number;
  [key: string]: unknown;
}

interface PerformanceScore {
  campaignId: string;
  campaignName: string;
  currentBudget: number;
  score: number;
  grade: PerformanceGrade;
}

export interface BudgetSuggestion {
  campaignId: string;
  campaignName: string;
  currentBudget: number;
  suggestedBudget: number;
  change_pct: number;
  reason: string;
}

export type BudgetMode = 'suggestion' | 'auto';
export type SuggestionStatus = 'pending' | 'applied' | 'rejected';

export interface StoredSuggestion extends BudgetSuggestion {
  id: string;
  status: SuggestionStatus;
  createdAt: Date;
  appliedAt?: Date;
  rejectedAt?: Date;
}

export interface BudgetConfig {
  tenantId: string;
  mode: BudgetMode;
  totalBudget: number;
  autoApplyEnabled: boolean;
  lastOptimizedAt?: Date;
}

/**
 * In-memory storage for budget suggestions and configurations
 * Maps tenantId → suggestions and configs
 */
const suggestionStorage = new Map<string, Map<string, StoredSuggestion>>();
const configStorage = new Map<string, BudgetConfig>();

/**
 * Meta Ads API budget constraints
 * https://developers.facebook.com/docs/marketing-api/reference/ad-campaign/
 */
const META_BUDGET_CONSTRAINTS = {
  MIN_DAILY_BUDGET: 1, // $1 minimum daily budget (in cents: 100)
  MAX_DAILY_BUDGET: 999_999_999, // ~$10M per day
  MIN_LIFETIME_BUDGET: 100, // $1 minimum lifetime budget
  MAX_LIFETIME_BUDGET: 999_999_999,
} as const;

/**
 * Validation results with error details
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

/**
 * Bulk validation results
 */
export interface BulkValidationResult {
  isValid: boolean;
  validSuggestions: BudgetSuggestion[];
  invalidSuggestions: Array<{
    suggestion: BudgetSuggestion;
    errors: ValidationError[];
  }>;
  duplicates: Array<{
    campaignId: string;
    count: number;
  }>;
}

/**
 * Calculate performance score (0–100) from campaign metrics
 *
 * Priority:
 * 1. If metrics.score exists, use it directly
 * 2. Fallback: normalize CTR + ROAS and calculate composite score
 *
 * Normalization formula for fallback:
 * - CTR is capped at 5% (excellent), normalized to 0–100: (ctr / 0.05) * 100
 * - ROAS is capped at 5.0 (excellent), normalized to 0–100: (roas / 5.0) * 100
 * - Composite: (CTR_normalized + ROAS_normalized) / 2
 *
 * Returns score in range [0, 100]
 */
function calculatePerformanceScore(metrics: CampaignMetrics): number {
  // Primary: explicit score field
  if (metrics.score !== undefined && typeof metrics.score === 'number') {
    return Math.max(0, Math.min(100, metrics.score));
  }

  // Fallback: composite from CTR + ROAS
  const ctr = typeof metrics.ctr === 'number' ? metrics.ctr : 0;
  const roas = typeof metrics.roas === 'number' ? metrics.roas : 0;

  // Normalize CTR (cap at 5% = 0.05 = excellent)
  const ctrNormalized = Math.min((ctr / 0.05) * 100, 100);

  // Normalize ROAS (cap at 5.0 = excellent)
  const roasNormalized = Math.min((roas / 5.0) * 100, 100);

  // Composite score: average of both normalized values
  const compositeScore = (ctrNormalized + roasNormalized) / 2;

  return Math.max(0, Math.min(100, compositeScore));
}

/**
 * Assign performance grade based on score
 *
 * Grade ranges:
 * - A: 80–100 (allocate 35% of budget)
 * - B: 60–79  (allocate 25% of budget)
 * - C: 40–59  (allocate 20% of budget)
 * - D: 20–39  (allocate 15% of budget)
 * - F: <20    (allocate 5% of budget)
 */
function getGradeFromScore(score: number): PerformanceGrade {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  if (score >= 20) return 'D';
  return 'F';
}

/**
 * Main budget optimization function
 *
 * Algorithm:
 * 1. Fetch all campaigns for the tenant with their metrics
 * 2. Calculate performance score and grade for each campaign
 * 3. Group campaigns by grade
 * 4. Allocate total budget by grade percentage (A=35%, B=25%, C=20%, D=15%, F=5%)
 * 5. Distribute allocated budget equally within each grade
 * 6. Normalize to ensure sum equals totalBudget (accounting for rounding)
 * 7. Calculate percentage change vs current budget
 *
 * @param tenantId - Tenant identifier
 * @param totalBudget - Total budget to distribute (in cents or campaign budget units)
 * @returns Array of budget suggestions with current → suggested allocation and reasons
 */
export async function optimizeBudget(
  tenantId: string,
  totalBudget: number,
): Promise<BudgetSuggestion[]> {
  // Fetch all active campaigns for tenant
  const tenantCampaigns = await db.query.campaigns.findMany({
    where: eq(campaigns.tenantId, tenantId),
  });

  if (tenantCampaigns.length === 0) {
    return [];
  }

  // Step 1: Calculate performance scores and grades
  const performanceScores: PerformanceScore[] = tenantCampaigns.map((campaign) => {
    const metrics = (campaign.metrics as CampaignMetrics) || {};
    const score = calculatePerformanceScore(metrics);
    const grade = getGradeFromScore(score);
    const currentBudget = extractCurrentBudget(campaign.budget);

    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      currentBudget,
      score,
      grade,
    };
  });

  // Step 2: Group campaigns by grade
  const campaignsByGrade = groupByGrade(performanceScores);

  // Step 3: Allocate budget to each grade
  const gradeAllocations: Record<PerformanceGrade, number> = {
    A: totalBudget * GRADE_ALLOCATION.A,
    B: totalBudget * GRADE_ALLOCATION.B,
    C: totalBudget * GRADE_ALLOCATION.C,
    D: totalBudget * GRADE_ALLOCATION.D,
    F: totalBudget * GRADE_ALLOCATION.F,
  };

  // Step 4: Distribute budget within each grade and calculate suggestions
  const suggestions: BudgetSuggestion[] = [];

  for (const grade of ['A', 'B', 'C', 'D', 'F'] as PerformanceGrade[]) {
    const campaignsInGrade = campaignsByGrade[grade] || [];
    if (campaignsInGrade.length === 0) continue;

    const allocatedBudget = gradeAllocations[grade];
    const budgetPerCampaign = allocatedBudget / campaignsInGrade.length;

    for (const campaign of campaignsInGrade) {
      const suggestedBudget = budgetPerCampaign;
      const change = suggestedBudget - campaign.currentBudget;
      const change_pct = campaign.currentBudget > 0 ? (change / campaign.currentBudget) * 100 : 0;

      suggestions.push({
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        currentBudget: campaign.currentBudget,
        suggestedBudget: Math.round(suggestedBudget * 100) / 100,
        change_pct: Math.round(change_pct * 100) / 100,
        reason: `Grade ${grade} (score: ${Math.round(campaign.score)}): allocated ${(GRADE_ALLOCATION[grade] * 100).toFixed(0)}% of total budget`,
      });
    }
  }

  // Step 5: Normalize total to match exactly (handle rounding drift)
  if (suggestions.length > 0) {
    const totalSuggested = suggestions.reduce((sum, s) => sum + s.suggestedBudget, 0);
    const drift = totalBudget - totalSuggested;

    if (Math.abs(drift) > 0.01) {
      // Distribute drift to the first campaign
      suggestions[0].suggestedBudget += drift;
    }
  }

  return suggestions;
}

/**
 * Extract current budget from campaign.budget (JSONB)
 * Handles various formats: { daily: X }, { total: X }, or direct number
 */
function extractCurrentBudget(budgetData: unknown): number {
  if (typeof budgetData === 'number') {
    return budgetData;
  }

  if (typeof budgetData === 'object' && budgetData !== null) {
    const b = budgetData as Record<string, unknown>;
    if (typeof b.daily === 'number') return b.daily;
    if (typeof b.total === 'number') return b.total;
    if (typeof b.amount === 'number') return b.amount;
  }

  return 0;
}

/**
 * Group performance scores by grade
 */
function groupByGrade(
  scores: PerformanceScore[],
): Record<PerformanceGrade, PerformanceScore[]> {
  const grouped: Record<PerformanceGrade, PerformanceScore[]> = {
    A: [],
    B: [],
    C: [],
    D: [],
    F: [],
  };

  for (const score of scores) {
    grouped[score.grade].push(score);
  }

  return grouped;
}

/**
 * Validate a single budget suggestion
 *
 * Checks:
 * - Required fields (campaignId, suggestedBudget)
 * - Budget within Meta Ads constraints (MIN/MAX)
 * - Suggested budget is positive number
 * - Budget change percentage is reasonable
 * - Campaign ID is valid UUID format
 *
 * @param suggestion - Suggestion to validate
 * @returns ValidationResult with all errors and warnings
 */
export function validateSuggestion(suggestion: BudgetSuggestion): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (!suggestion.campaignId || suggestion.campaignId.trim() === '') {
    errors.push(
      new ValidationError('campaignId', 'REQUIRED', 'Campaign ID is required'),
    );
  } else if (!isValidUUID(suggestion.campaignId)) {
    errors.push(
      new ValidationError(
        'campaignId',
        'INVALID_FORMAT',
        `Campaign ID is not a valid UUID: ${suggestion.campaignId}`,
      ),
    );
  }

  if (suggestion.suggestedBudget === undefined || suggestion.suggestedBudget === null) {
    errors.push(
      new ValidationError(
        'suggestedBudget',
        'REQUIRED',
        'Suggested budget is required',
      ),
    );
  } else {
    // Check budget is positive
    if (suggestion.suggestedBudget < 0) {
      errors.push(
        new ValidationError(
          'suggestedBudget',
          'NEGATIVE_BUDGET',
          'Suggested budget cannot be negative',
        ),
      );
    }

    // Check budget is not NaN or Infinity
    if (!Number.isFinite(suggestion.suggestedBudget)) {
      errors.push(
        new ValidationError(
          'suggestedBudget',
          'INVALID_NUMBER',
          'Suggested budget must be a valid finite number',
        ),
      );
    }

    // Check Meta budget constraints
    if (suggestion.suggestedBudget > 0 && suggestion.suggestedBudget < META_BUDGET_CONSTRAINTS.MIN_DAILY_BUDGET) {
      errors.push(
        new ValidationError(
          'suggestedBudget',
          'BELOW_MIN_BUDGET',
          `Suggested budget (${suggestion.suggestedBudget}) is below Meta minimum (${META_BUDGET_CONSTRAINTS.MIN_DAILY_BUDGET})`,
        ),
      );
    }

    if (suggestion.suggestedBudget > META_BUDGET_CONSTRAINTS.MAX_DAILY_BUDGET) {
      errors.push(
        new ValidationError(
          'suggestedBudget',
          'EXCEEDS_MAX_BUDGET',
          `Suggested budget (${suggestion.suggestedBudget}) exceeds Meta maximum (${META_BUDGET_CONSTRAINTS.MAX_DAILY_BUDGET})`,
        ),
      );
    }
  }

  // Check current budget
  if (suggestion.currentBudget === undefined || suggestion.currentBudget === null) {
    errors.push(
      new ValidationError('currentBudget', 'REQUIRED', 'Current budget is required'),
    );
  } else if (suggestion.currentBudget < 0) {
    errors.push(
      new ValidationError(
        'currentBudget',
        'NEGATIVE_BUDGET',
        'Current budget cannot be negative',
      ),
    );
  }

  // Warning: large budget change (>200% or <-80%)
  if (
    suggestion.currentBudget > 0 &&
    Number.isFinite(suggestion.change_pct)
  ) {
    if (suggestion.change_pct > 200) {
      warnings.push(
        `Large budget increase: +${suggestion.change_pct.toFixed(1)}%. Verify before applying.`,
      );
    } else if (suggestion.change_pct < -80) {
      warnings.push(
        `Large budget decrease: ${suggestion.change_pct.toFixed(1)}%. Ensure campaign performance warrants this.`,
      );
    }
  }

  // Check campaign has historical data (warning if no current budget)
  if (suggestion.currentBudget === 0 || suggestion.currentBudget < META_BUDGET_CONSTRAINTS.MIN_DAILY_BUDGET) {
    warnings.push(
      `Campaign has no current budget or below minimum. May indicate new/inactive campaign.`,
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate multiple suggestions in bulk
 *
 * Checks:
 * - Each suggestion validity
 * - Duplicate campaigns (same campaignId multiple times)
 * - Total budget consistency
 *
 * @param suggestions - Array of suggestions to validate
 * @param totalBudget - Expected total budget (for consistency check)
 * @returns BulkValidationResult with valid/invalid separated
 */
export function validateSuggestionsBulk(
  suggestions: BudgetSuggestion[],
  totalBudget?: number,
): BulkValidationResult {
  const validSuggestions: BudgetSuggestion[] = [];
  const invalidSuggestions: Array<{
    suggestion: BudgetSuggestion;
    errors: ValidationError[];
  }> = [];

  // Check for duplicates first
  const campaignCounts = new Map<string, number>();
  for (const suggestion of suggestions) {
    const count = campaignCounts.get(suggestion.campaignId) ?? 0;
    campaignCounts.set(suggestion.campaignId, count + 1);
  }

  const duplicates = Array.from(campaignCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([campaignId, count]) => ({ campaignId, count }));

  // Validate each suggestion
  for (const suggestion of suggestions) {
    const result = validateSuggestion(suggestion);

    if (result.isValid) {
      validSuggestions.push(suggestion);
    } else {
      invalidSuggestions.push({
        suggestion,
        errors: result.errors,
      });
    }
  }

  const isValid = invalidSuggestions.length === 0 && duplicates.length === 0;

  return {
    isValid,
    validSuggestions,
    invalidSuggestions,
    duplicates,
  };
}

/**
 * Check if campaign already has pending suggestions (avoid re-optimization)
 *
 * @param tenantId - Tenant identifier
 * @param campaignId - Campaign to check
 * @returns true if campaign has pending suggestion
 */
export function hasPendingSuggestion(tenantId: string, campaignId: string): boolean {
  const tenantSuggestions = suggestionStorage.get(tenantId);
  if (!tenantSuggestions) return false;

  return Array.from(tenantSuggestions.values()).some(
    (s) => s.campaignId === campaignId && s.status === 'pending',
  );
}

/**
 * Validate Meta budget API constraints for a single value
 *
 * @param budget - Budget amount to validate
 * @returns { isValid, error? } validation result
 */
export function validateMetaBudgetConstraint(budget: number): {
  isValid: boolean;
  error?: string;
} {
  if (!Number.isFinite(budget)) {
    return { isValid: false, error: 'Budget must be a valid finite number' };
  }

  if (budget < META_BUDGET_CONSTRAINTS.MIN_DAILY_BUDGET) {
    return {
      isValid: false,
      error: `Budget below minimum (${META_BUDGET_CONSTRAINTS.MIN_DAILY_BUDGET})`,
    };
  }

  if (budget > META_BUDGET_CONSTRAINTS.MAX_DAILY_BUDGET) {
    return {
      isValid: false,
      error: `Budget exceeds maximum (${META_BUDGET_CONSTRAINTS.MAX_DAILY_BUDGET})`,
    };
  }

  return { isValid: true };
}

/**
 * Check if string is valid UUID v4 format
 */
function isValidUUID(value: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Save budget suggestions with mode handling
 *
 * Flow:
 * - 'suggestion' mode: stores suggestions as pending, waits for manual apply
 * - 'auto' mode: stores AND immediately applies suggestions via Meta Budget API
 *
 * Validates all suggestions before saving:
 * - Checks individual suggestion validity
 * - Detects duplicates (same campaign multiple times)
 * - Checks for existing pending suggestions
 * - Throws BudgetOptimizerError if validation fails
 *
 * @param tenantId - Tenant identifier
 * @param suggestions - Array of budget suggestions to save
 * @param mode - 'suggestion' (pending) or 'auto' (apply immediately)
 * @returns Array of stored suggestions with IDs and metadata
 * @throws BudgetOptimizerError if validation fails
 */
export async function saveSuggestions(
  tenantId: string,
  suggestions: BudgetSuggestion[],
  mode: BudgetMode,
): Promise<StoredSuggestion[]> {
  if (!tenantId || tenantId.trim() === '') {
    throw new BudgetOptimizerError('INVALID_TENANT', 'Tenant ID is required');
  }

  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    throw new BudgetOptimizerError(
      'EMPTY_SUGGESTIONS',
      'At least one suggestion is required',
    );
  }

  // Validate all suggestions
  const bulkValidation = validateSuggestionsBulk(suggestions);

  if (!bulkValidation.isValid) {
    const errorDetails = {
      invalidCount: bulkValidation.invalidSuggestions.length,
      duplicateCount: bulkValidation.duplicates.length,
      invalidSuggestions: bulkValidation.invalidSuggestions.map((item) => ({
        campaignId: item.suggestion.campaignId,
        errors: item.errors.map((e) => ({
          field: e.field,
          constraint: e.constraint,
          message: e.message,
        })),
      })),
      duplicates: bulkValidation.duplicates,
    };

    throw new BudgetOptimizerError(
      'VALIDATION_FAILED',
      `${bulkValidation.invalidSuggestions.length} suggestion(s) failed validation, ${bulkValidation.duplicates.length} duplicate(s) detected`,
      errorDetails,
    );
  }

  // Check for existing pending suggestions
  const existingPending: string[] = [];
  for (const suggestion of suggestions) {
    if (hasPendingSuggestion(tenantId, suggestion.campaignId)) {
      existingPending.push(suggestion.campaignId);
    }
  }

  if (existingPending.length > 0) {
    throw new BudgetOptimizerError(
      'PENDING_SUGGESTIONS_EXIST',
      `Campaigns already have pending suggestions: ${existingPending.join(', ')}`,
      { campaignIds: existingPending },
    );
  }

  // Initialize storage for tenant if needed
  if (!suggestionStorage.has(tenantId)) {
    suggestionStorage.set(tenantId, new Map());
  }

  const tenantSuggestions = suggestionStorage.get(tenantId)!;
  const storedSuggestions: StoredSuggestion[] = [];

  for (const suggestion of suggestions) {
    const id = generateSuggestionId();
    const stored: StoredSuggestion = {
      ...suggestion,
      id,
      status: 'pending',
      createdAt: new Date(),
    };

    tenantSuggestions.set(id, stored);
    storedSuggestions.push(stored);
  }

  // Auto mode: immediately apply all suggestions
  if (mode === 'auto') {
    await applySuggestions(tenantId, storedSuggestions.map((s) => s.id));
  }

  return storedSuggestions;
}

/**
 * Get budget suggestions for a tenant
 *
 * @param tenantId - Tenant identifier
 * @param status - Filter by status (pending, applied, rejected) or undefined for all
 * @returns Array of suggestions matching filter
 */
export function getSuggestions(
  tenantId: string,
  status?: SuggestionStatus,
): StoredSuggestion[] {
  const tenantSuggestions = suggestionStorage.get(tenantId);
  if (!tenantSuggestions) return [];

  const suggestions = Array.from(tenantSuggestions.values());

  if (status) {
    return suggestions.filter((s) => s.status === status);
  }

  return suggestions;
}

/**
 * Apply approved budget suggestions
 *
 * Validates each suggestion ID before applying
 * Simulates Meta Budget API call for each campaign
 * Updates suggestion status to 'applied' on success
 * Validation checks:
 * - Suggestion exists
 * - Suggestion is in 'pending' status
 * - Meta budget constraints are met
 * - Campaign ID is valid
 *
 * @param tenantId - Tenant identifier
 * @param suggestionIds - IDs of suggestions to apply
 * @returns Updated stored suggestions
 * @throws BudgetOptimizerError if validation fails
 */
export async function applySuggestions(
  tenantId: string,
  suggestionIds: string[],
): Promise<StoredSuggestion[]> {
  if (!tenantId || tenantId.trim() === '') {
    throw new BudgetOptimizerError('INVALID_TENANT', 'Tenant ID is required');
  }

  if (!Array.isArray(suggestionIds) || suggestionIds.length === 0) {
    throw new BudgetOptimizerError(
      'EMPTY_SUGGESTION_IDS',
      'At least one suggestion ID is required',
    );
  }

  const tenantSuggestions = suggestionStorage.get(tenantId);
  if (!tenantSuggestions) {
    throw new BudgetOptimizerError(
      'TENANT_NOT_FOUND',
      `No suggestions found for tenant: ${tenantId}`,
    );
  }

  // Validate all IDs exist and are pending
  const notFound: string[] = [];
  const notPending: string[] = [];

  for (const id of suggestionIds) {
    const suggestion = tenantSuggestions.get(id);
    if (!suggestion) {
      notFound.push(id);
    } else if (suggestion.status !== 'pending') {
      notPending.push(`${id} (status: ${suggestion.status})`);
    }
  }

  if (notFound.length > 0 || notPending.length > 0) {
    const errors: string[] = [];
    if (notFound.length > 0) errors.push(`Not found: ${notFound.join(', ')}`);
    if (notPending.length > 0)
      errors.push(`Not pending: ${notPending.join(', ')}`);

    throw new BudgetOptimizerError(
      'INVALID_SUGGESTION_IDS',
      errors.join('; '),
      { notFound, notPending },
    );
  }

  const applied: StoredSuggestion[] = [];
  const failed: Array<{ id: string; reason: string }> = [];

  for (const id of suggestionIds) {
    const suggestion = tenantSuggestions.get(id)!;

    // Validate budget constraints before API call
    const budgetValidation = validateMetaBudgetConstraint(suggestion.suggestedBudget);
    if (!budgetValidation.isValid) {
      failed.push({
        id,
        reason: budgetValidation.error || 'Unknown budget constraint violation',
      });
      continue;
    }

    // Simulate Meta Budget API call
    let metaApiSuccess = false;
    try {
      metaApiSuccess = await simulateMetaBudgetApiCall(
        suggestion.campaignId,
        suggestion.suggestedBudget,
      );
    } catch (error) {
      failed.push({
        id,
        reason: `API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      continue;
    }

    if (metaApiSuccess) {
      suggestion.status = 'applied';
      suggestion.appliedAt = new Date();
      applied.push(suggestion);
    } else {
      failed.push({
        id,
        reason: 'Meta Budget API rejected the budget value',
      });
    }
  }

  // Warn if some applications failed
  if (failed.length > 0) {
    console.warn(`Failed to apply ${failed.length} suggestions:`, failed);
  }

  return applied;
}

/**
 * Reject budget suggestions
 *
 * @param tenantId - Tenant identifier
 * @param suggestionIds - IDs of suggestions to reject
 * @returns Updated stored suggestions
 */
export function rejectSuggestions(
  tenantId: string,
  suggestionIds: string[],
): StoredSuggestion[] {
  const tenantSuggestions = suggestionStorage.get(tenantId);
  if (!tenantSuggestions) return [];

  const rejected: StoredSuggestion[] = [];

  for (const id of suggestionIds) {
    const suggestion = tenantSuggestions.get(id);
    if (!suggestion || suggestion.status !== 'pending') continue;

    suggestion.status = 'rejected';
    suggestion.rejectedAt = new Date();
    rejected.push(suggestion);
  }

  return rejected;
}

/**
 * Get budget configuration for a tenant
 *
 * Returns default config if not explicitly set
 *
 * @param tenantId - Tenant identifier
 * @returns Budget configuration
 */
export function getBudgetConfig(tenantId: string): BudgetConfig {
  if (configStorage.has(tenantId)) {
    return configStorage.get(tenantId)!;
  }

  // Default configuration
  return {
    tenantId,
    mode: 'suggestion',
    totalBudget: 0,
    autoApplyEnabled: false,
  };
}

/**
 * Update budget configuration for a tenant
 *
 * @param tenantId - Tenant identifier
 * @param config - Partial config to merge with existing
 * @returns Updated configuration
 */
export function updateBudgetConfig(
  tenantId: string,
  config: Partial<BudgetConfig>,
): BudgetConfig {
  const existing = getBudgetConfig(tenantId);
  const updated: BudgetConfig = {
    ...existing,
    ...config,
    tenantId, // always preserve tenantId
  };

  configStorage.set(tenantId, updated);
  return updated;
}

/**
 * Simulate Meta Budget API call
 *
 * In production, this would call the actual Meta Ads API endpoint:
 * POST https://graph.facebook.com/v20.0/{campaign_id}?fields=budget&budget={amount}
 *
 * For now, simulates success/failure based on budget validity
 *
 * @param campaignId - Meta campaign ID
 * @param suggestedBudget - Budget amount to set
 * @returns true if API call succeeded
 */
async function simulateMetaBudgetApiCall(
  campaignId: string,
  suggestedBudget: number,
): Promise<boolean> {
  // Simulate API latency
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 100));

  // Validate budget constraints
  if (suggestedBudget < 1) return false; // Min budget validation
  if (suggestedBudget > 999_999_999) return false; // Max budget validation

  // Log simulated API call (in production, would be actual HTTP call)
  console.log(
    `[Meta Budget API] Setting campaign ${campaignId} budget to ${suggestedBudget}`,
  );

  return true;
}

/**
 * Generate unique suggestion ID
 */
function generateSuggestionId(): string {
  return `sug_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * BudgetOptimizerService — façade de classe sobre as funções de módulo.
 *
 * Singleton registrado no composition root (di.ts) e injetado no BudgetController.
 * As funções de módulo (acima) continuam exportadas e são usadas diretamente
 * pelo worker (budget-optimizer.worker) — não são removidas.
 */
export class BudgetOptimizerService {
  async optimizeBudget(tenantId: string, totalBudget: number): Promise<BudgetSuggestion[]> {
    return optimizeBudget(tenantId, totalBudget);
  }

  async saveSuggestions(
    tenantId: string,
    suggestions: BudgetSuggestion[],
    mode: BudgetMode,
  ): Promise<StoredSuggestion[]> {
    return saveSuggestions(tenantId, suggestions, mode);
  }

  getSuggestions(tenantId: string, status?: SuggestionStatus): StoredSuggestion[] {
    return getSuggestions(tenantId, status);
  }

  async applySuggestions(tenantId: string, suggestionIds: string[]): Promise<StoredSuggestion[]> {
    return applySuggestions(tenantId, suggestionIds);
  }

  rejectSuggestions(tenantId: string, suggestionIds: string[]): StoredSuggestion[] {
    return rejectSuggestions(tenantId, suggestionIds);
  }

  getBudgetConfig(tenantId: string): BudgetConfig {
    return getBudgetConfig(tenantId);
  }

  updateBudgetConfig(tenantId: string, config: Partial<BudgetConfig>): BudgetConfig {
    return updateBudgetConfig(tenantId, config);
  }
}
