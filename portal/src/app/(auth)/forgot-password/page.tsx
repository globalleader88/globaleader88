'use client';

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { forgotPasswordAction, type FormState } from '@/server/actions/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SubmitButton } from '@/components/submit-button';
import { FormMessage } from '@/components/form-message';

const initial: FormState = { ok: false };

export default function ForgotPasswordPage() {
  const [state, action] = useFormState(forgotPasswordAction, initial);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset password</CardTitle>
        <CardDescription>We’ll email a reset code if an account exists.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <FormMessage state={state} />
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <SubmitButton className="w-full">Send reset code</SubmitButton>
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
