import { Badge } from '@/components/ui/badge';

const MAP: Record<
  string,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline';
  }
> = {
  UPLOADING: { label: 'Uploading', variant: 'secondary' },
  PENDING: { label: 'Queued', variant: 'warning' },
  PROCESSING: { label: 'Processing', variant: 'warning' },
  READY: { label: 'Ready', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'destructive' },
  DELETED: { label: 'Deleted', variant: 'outline' },
};

export function DocumentStatusBadge({ status }: { status: string }) {
  const s = MAP[status] ?? { label: status, variant: 'outline' as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}
