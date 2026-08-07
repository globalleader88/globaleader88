'use client';

import { useFormState } from 'react-dom';
import { acceptInvitationAction, type FormState } from '@/server/actions/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SubmitButton } from '@/components/submit-button';
import { FormMessage } from '@/components/form-message';

const initial: FormState = { ok: false };

export default function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const [state, action] = useFormState(acceptInvitationAction, initial);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Accept invitation</CardTitle>
        <CardDescription>
          Sign in with the invited email address, then confirm to join the organization.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <FormMessage state={state} />
          <div className="space-y-2">
            <Label htmlFor="token">Invitation token</Label>
            <Input id="token" name="token" defaultValue={searchParams.token ?? ''} required />
          </div>
          <SubmitButton className="w-full">Join organization</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
