import React from 'react';
import { ArrowLeft, CreditCard, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function Subscription() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link to="/" className="p-2 -ml-2 rounded-lg hover:bg-accent" aria-label="Back to projects">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-semibold">Subscription</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-4 h-4" /> Server-owned billing is not connected yet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Plans, trials, checkout and credit purchases are not active in the production billing authority yet.
            This page cannot activate a paid plan, start a trial or change a credit balance.
          </p>
          <p>
            When billing is enabled, plan changes will be authorized by the server and paid entitlements will be
            activated only from verified payment-provider events.
          </p>
          <Button asChild variant="outline">
            <Link to="/billing"><CreditCard className="w-4 h-4 mr-2" />View billing status</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
