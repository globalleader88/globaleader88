'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { initiateUploadAction, finalizeUploadAction } from '@/server/actions/documents';

const ACCEPT = '.pdf,.docx,.txt,.csv,.xlsx';

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function DocumentUpload() {
  const router = useRouter();
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem('file') as HTMLInputElement;
    const titleInput = form.elements.namedItem('title') as HTMLInputElement;
    const classInput = form.elements.namedItem('classification') as HTMLSelectElement;
    const file = fileInput.files?.[0];
    if (!file) return;

    setBusy(true);
    try {
      setStatus('Hashing file…');
      const checksum = await sha256Hex(file);

      setStatus('Requesting secure upload URL…');
      const init = await initiateUploadAction({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        title: titleInput.value || undefined,
        classification: (classInput.value as 'CONFIDENTIAL') || undefined,
        sha256: checksum,
      });
      if (!init.ok) {
        setStatus(`Error: ${init.error}`);
        return;
      }

      setStatus('Uploading…');
      const put = await fetch(init.upload.url, {
        method: init.upload.method,
        headers: init.upload.headers,
        body: file,
      });
      if (!put.ok) {
        setStatus('Upload failed. Please try again.');
        return;
      }

      setStatus('Queuing for processing…');
      const fin = await finalizeUploadAction(init.documentId);
      if (!fin.ok) {
        setStatus(`Error: ${fin.error}`);
        return;
      }
      setStatus('Uploaded. Processing has started.');
      form.reset();
      router.refresh();
    } catch {
      setStatus('Unexpected error during upload.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="file">File (PDF, DOCX, TXT, CSV, XLSX)</Label>
        <Input id="file" name="file" type="file" accept={ACCEPT} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="title">Title (optional)</Label>
        <Input id="title" name="title" placeholder="Defaults to the file name" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="classification">Classification</Label>
        <select
          id="classification"
          name="classification"
          defaultValue="CONFIDENTIAL"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="PUBLIC">Public</option>
          <option value="INTERNAL">Internal</option>
          <option value="CONFIDENTIAL">Confidential</option>
          <option value="RESTRICTED">Restricted</option>
        </select>
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? 'Working…' : 'Upload document'}
      </Button>
      {status && <p className="text-sm text-muted-foreground">{status}</p>}
    </form>
  );
}
