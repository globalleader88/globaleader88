'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireOrganizationMembership } from '@/lib/authz';
import { generateReport } from '@/lib/reports/generate';
import { toPublicError } from '@/lib/errors';

const schema = z.object({
  type: z.enum([
    'DOCUMENT_SUMMARY',
    'REQUIREMENTS_EXTRACTION',
    'RISK_ANALYSIS',
    'COMPLIANCE_MATRIX',
    'COMPARISON',
    'EXECUTIVE_BRIEF',
    'ACTION_ITEMS',
  ]),
  title: z.string().max(255).optional(),
  documentScope: z.array(z.string().uuid()).max(50).optional(),
});

export async function generateReportAction(input: z.infer<typeof schema>) {
  // Analysts and admins may create reports; viewers cannot.
  const ctx = await requireOrganizationMembership({ minRole: 'ANALYST' });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: 'Invalid report request' };
  try {
    const { id } = await generateReport(ctx, parsed.data);
    revalidatePath('/reports');
    return { ok: true as const, id };
  } catch (err) {
    return { ok: false as const, error: toPublicError(err).message };
  }
}
