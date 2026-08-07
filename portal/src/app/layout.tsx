import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Global Connects Client Intelligence Portal',
  description: 'Secure, multi-tenant AI document intelligence for confidential business documents.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
