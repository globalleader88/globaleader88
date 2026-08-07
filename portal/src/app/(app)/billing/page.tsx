import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Billing</h1>
      <Card>
        <CardHeader>
          <CardTitle>Billing is not yet enabled</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            This is a placeholder for the billing experience. Usage is currently tracked and
            estimated on the Usage page. A future release will connect a payment provider and expose
            invoices, plan limits, and payment methods here. No payment information is collected in
            this MVP.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
