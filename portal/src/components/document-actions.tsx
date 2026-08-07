'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getDownloadUrlAction, deleteDocumentAction } from '@/server/actions/documents';

export function DocumentActions({
  documentId,
  canDelete,
}: {
  documentId: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    const res = await getDownloadUrlAction(documentId);
    setBusy(false);
    if (res.ok) window.open(res.url, '_blank', 'noopener');
    else alert(res.error);
  }

  async function remove() {
    if (!confirm('Delete this document? Its embeddings are removed immediately.')) return;
    setBusy(true);
    const res = await deleteDocumentAction(documentId);
    setBusy(false);
    if (res.ok) router.push('/documents');
    else alert(res.error);
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={download} disabled={busy}>
        Download
      </Button>
      {canDelete && (
        <Button variant="destructive" onClick={remove} disabled={busy}>
          Delete
        </Button>
      )}
    </div>
  );
}
