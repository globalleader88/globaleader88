import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandMark } from '@/components/brand-mark';

/** Public landing page. */
export default function LandingPage() {
  const features = [
    [
      'Isolated workspaces',
      'Every organization gets a hard-walled tenant. Your data never mixes with another client’s.',
    ],
    [
      'Grounded answers',
      'Ask questions and get answers cited to your own documents — with a clear signal when evidence is thin.',
    ],
    [
      'Encrypted by default',
      'Files are stored in private, KMS-encrypted S3 storage. Access is logged and auditable.',
    ],
    [
      'Structured reports',
      'Generate summaries, requirements, risk analyses, and compliance matrices from your documents.',
    ],
  ];
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="flex items-center justify-between">
        <BrandMark />
        <nav className="flex gap-3">
          <Button asChild variant="ghost">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Get started</Link>
          </Button>
        </nav>
      </header>

      <section className="py-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Turn confidential documents into answers — securely.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          A private, multi-tenant AI workspace for uploading business documents, asking questions,
          and generating structured outputs — without pasting sensitive information into consumer AI
          chat apps.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Button asChild size="lg">
            <Link href="/register">Create your workspace</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        {features.map(([title, body]) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{body}</CardContent>
          </Card>
        ))}
      </section>

      <footer className="mt-20 border-t pt-8 text-center text-xs text-muted-foreground">
        <p>
          The Global Connects Services, LLC. This platform provides technical controls; it is not
          automatically compliant with CMMC, FedRAMP, NIST 800-171, HIPAA, SOC 2, ITAR, or CUI
          requirements. See the data-handling notice after signing in.
        </p>
      </footer>
    </main>
  );
}
