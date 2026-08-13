import Link from 'next/link';
import { BrandMark } from '@/components/brand-mark';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/40 px-4">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex justify-center">
          <BrandMark />
        </Link>
        {children}
      </div>
    </main>
  );
}
