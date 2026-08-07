import { env } from '@/env';
import type { OrganizationSetting } from '@prisma/client';
import type { TaskClass } from './provider';

/**
 * Model routing. Maps a task class to a concrete Bedrock model id, preferring
 * per-organization overrides (OrganizationSetting) and falling back to env.
 *
 *   low       → classification, metadata extraction, simple Q&A, summaries
 *   standard  → detailed analysis, report generation, multi-doc synthesis
 *   advanced  → complex reasoning, proposal strategy, compliance review
 */
export function resolveModelId(
  taskClass: TaskClass,
  settings?: Pick<
    OrganizationSetting,
    'lowCostModelId' | 'standardModelId' | 'advancedModelId'
  > | null,
): string {
  switch (taskClass) {
    case 'low':
      return settings?.lowCostModelId ?? env.AWS_BEDROCK_LOW_COST_MODEL_ID;
    case 'advanced':
      return settings?.advancedModelId ?? env.AWS_BEDROCK_ADVANCED_MODEL_ID;
    case 'standard':
    default:
      return settings?.standardModelId ?? env.AWS_BEDROCK_CHAT_MODEL_ID;
  }
}

/** Choose a task class for a report type. */
export function taskClassForReport(reportType: string): TaskClass {
  switch (reportType) {
    case 'DOCUMENT_SUMMARY':
    case 'ACTION_ITEMS':
      return 'low';
    case 'RISK_ANALYSIS':
    case 'COMPLIANCE_MATRIX':
    case 'COMPARISON':
      return 'advanced';
    default:
      return 'standard';
  }
}
