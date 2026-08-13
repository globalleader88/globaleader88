'use client';

import { useFormState } from 'react-dom';
import {
  updateSettingsAction,
  updateRetentionAction,
  type SettingsFormResult,
} from '@/server/actions/settings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SubmitButton } from '@/components/submit-button';

interface SettingsValues {
  monthlyTokenLimit: string;
  dailyQueryLimitPerUser: number;
  maxRetrievedChunks: number;
  maxContextTokens: number;
  maxOutputTokens: number;
  warnThresholdPercent: number;
  similarityThreshold: number;
}

interface RetentionValues {
  mode: 'INDEFINITE' | 'DELETE_AFTER_DAYS';
  retentionDays: number | null;
  purgeGraceDays: number;
}

const initial: SettingsFormResult = { ok: false };

function Field({
  label,
  name,
  defaultValue,
  type = 'number',
  step,
}: {
  label: string;
  name: string;
  defaultValue: string | number;
  type?: string;
  step?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} step={step} defaultValue={String(defaultValue)} />
    </div>
  );
}

export function SettingsForms({
  settings,
  retention,
}: {
  settings: SettingsValues;
  retention: RetentionValues;
}) {
  const [sState, sAction] = useFormState(updateSettingsAction, initial);
  const [rState, rAction] = useFormState(updateRetentionAction, initial);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cost &amp; retrieval controls</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={sAction} className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Monthly token limit"
              name="monthlyTokenLimit"
              defaultValue={settings.monthlyTokenLimit}
            />
            <Field
              label="Daily queries / user"
              name="dailyQueryLimitPerUser"
              defaultValue={settings.dailyQueryLimitPerUser}
            />
            <Field
              label="Max retrieved chunks"
              name="maxRetrievedChunks"
              defaultValue={settings.maxRetrievedChunks}
            />
            <Field
              label="Max context tokens"
              name="maxContextTokens"
              defaultValue={settings.maxContextTokens}
            />
            <Field
              label="Max output tokens"
              name="maxOutputTokens"
              defaultValue={settings.maxOutputTokens}
            />
            <Field
              label="Warn threshold (%)"
              name="warnThresholdPercent"
              defaultValue={settings.warnThresholdPercent}
            />
            <Field
              label="Similarity threshold (0-1)"
              name="similarityThreshold"
              defaultValue={settings.similarityThreshold}
              step="0.01"
            />
            <div className="sm:col-span-2 flex items-center gap-3">
              <SubmitButton>Save settings</SubmitButton>
              {sState.error && <span className="text-sm text-destructive">{sState.error}</span>}
              {sState.message && <span className="text-sm text-emerald-600">{sState.message}</span>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data retention</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={rAction} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="mode">Mode</Label>
              <select
                id="mode"
                name="mode"
                defaultValue={retention.mode}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="INDEFINITE">Retain indefinitely</option>
                <option value="DELETE_AFTER_DAYS">Delete after N days</option>
              </select>
            </div>
            <Field
              label="Retention days"
              name="retentionDays"
              defaultValue={retention.retentionDays ?? 365}
            />
            <Field
              label="Purge grace days"
              name="purgeGraceDays"
              defaultValue={retention.purgeGraceDays}
            />
            <div className="sm:col-span-2 flex items-center gap-3">
              <SubmitButton>Save retention policy</SubmitButton>
              {rState.error && <span className="text-sm text-destructive">{rState.error}</span>}
              {rState.message && <span className="text-sm text-emerald-600">{rState.message}</span>}
            </div>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Deleting a document removes its embeddings immediately. The underlying file is purged
            after the grace window. Backups expire per their configured retention windows and are
            not deleted instantly — see the data-handling notice.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
