import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditCard } from 'lucide-react';

// Payments module placeholder — UI shell only, business logic comes later.
export default function Billing() {
  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
      <h1 className="text-2xl font-heading font-semibold">Billing & Credits</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="w-4 h-4" /> Payments coming soon
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Plans, credit packs, and checkout will appear here once payments are connected.
        </CardContent>
      </Card>
    </div>
  );
}