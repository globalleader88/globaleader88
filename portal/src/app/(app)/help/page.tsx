import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Help &amp; Data-Handling Notice</h1>

      <Card>
        <CardHeader>
          <CardTitle>How your documents are handled</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Documents you upload are stored in private, encrypted object storage scoped to your
            organization. Text is extracted and split into passages, and vector embeddings are
            stored so questions can retrieve the most relevant passages. Only those retrieved
            passages — not entire documents — are sent to the AI model to answer a question.
          </p>
          <p>
            Answers are grounded in your organization&apos;s content and include citations. When the
            available documents do not contain enough information, the assistant says so rather than
            guessing.
          </p>
          <p>
            Document content is treated as untrusted reference material. Instructions embedded
            inside a document cannot change how the platform behaves.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Deletion &amp; retention</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Deleting a document removes its embeddings immediately, so it can no longer be
            retrieved. The underlying file is permanently purged after a short grace window
            configured by your administrator. Backups (database point-in-time recovery and versioned
            object storage) expire on their own configured schedules and are not deleted instantly.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compliance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            This platform provides technical controls (encryption, access control, audit logging,
            tenant isolation). It is <strong>not</strong> automatically compliant with CMMC,
            FedRAMP, NIST SP 800-171, HIPAA, SOC 2, ITAR, or CUI requirements. Achieving and
            maintaining compliance depends on your configuration, infrastructure, policies,
            contracts, personnel, and operating procedures.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
