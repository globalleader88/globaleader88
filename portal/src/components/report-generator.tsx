'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { generateReportAction } from '@/server/actions/reports';

const TYPES: Array<[string, string]> = [
  ['DOCUMENT_SUMMARY', 'Document Summary'],
  ['REQUIREMENTS_EXTRACTION', 'Requirements Extraction'],
  ['RISK_ANALYSIS', 'Risk Analysis'],
  ['COMPLIANCE_MATRIX', 'Compliance Matrix'],
  ['COMPARISON', 'Comparison Report'],
  ['EXECUTIVE_BRIEF', 'Executive Brief'],
  ['ACTION_ITEMS', 'Action-Item List'],
];

export function ReportGenerator() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const type = (e.currentTarget.elements.namedItem('type') as HTMLSelectElement).value;
    setBusy(true);
    setError(null);
    const res = await generateReportAction({ type: type as 'DOCUMENT_SUMMARY' });
    setBusy(false);
    if (res.ok) router.push(`/reports/${res.id}`);
    else setError(res.error);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label htmlFor="type" className="text-sm font-medium">
          Report type
        </label>
        <select
          id="type"
          name="type"
          className="flex h-10 w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {TYPES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? 'Generating…' : 'Generate report'}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
