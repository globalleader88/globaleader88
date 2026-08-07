import { redirect } from 'next/navigation';
import { loadOrgContext } from '@/server/context';
import { roleAtLeast } from '@/lib/authz';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DocumentUpload } from '@/components/document-upload';

export default async function UploadPage() {
  const ctx = await loadOrgContext();
  if (!roleAtLeast(ctx.role, 'ANALYST')) redirect('/documents');
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Upload document</h1>
      <Card>
        <CardHeader>
          <CardTitle>New document</CardTitle>
          <CardDescription>
            Files are checksummed in your browser, uploaded directly to encrypted storage via a
            short-lived signed URL, then processed in the background. The server chooses the storage
            location — the file never touches another organization&apos;s space.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentUpload />
        </CardContent>
      </Card>
    </div>
  );
}
