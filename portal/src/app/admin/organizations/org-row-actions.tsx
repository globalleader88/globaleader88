'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { setOrganizationStatusAction } from '@/server/actions/admin';

export function OrgRowActions({
  organizationId,
  status,
}: {
  organizationId: string;
  status: string;
}) {
  const router = useRouter();
  async function toggle() {
    const next = status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    if (!confirm(`Set organization to ${next}?`)) return;
    const res = await setOrganizationStatusAction(organizationId, next);
    if (!res.ok) alert(res.error);
    router.refresh();
  }
  return (
    <Button variant="outline" size="sm" onClick={toggle}>
      {status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
    </Button>
  );
}
