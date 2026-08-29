import { createHmac, timingSafeEqual } from 'node:crypto';
import type { GarmentOwnerScope } from './postgresGarmentStore.ts';

type GarmentDeliveryClaim = Readonly<{
  garmentId: string;
  viewId: string;
  tenantId: string;
  userId: string;
  expiresAt: number;
}>;

type WireClaim = Readonly<{ v: 1; t: string; u: string; g: string; w: string; e: number }>;

/** Short-lived delivery capability. Stable garment/view IDs remain the durable identity. */
export class GarmentDeliveryAuthority {
  constructor(private readonly secret: string, private readonly now: () => number = Date.now) {
    if (!secret) throw new Error('Garment delivery signing secret is required');
  }

  issue(scope: GarmentOwnerScope, garmentId: string, viewId: string, expiresAt = this.now() + 5 * 60_000): string {
    if (!garmentId || !viewId || !scope.tenantId || !scope.userId || !Number.isSafeInteger(expiresAt) || expiresAt <= this.now()) {
      throw new Error('Garment delivery claim is invalid');
    }
    const payload = Buffer.from(JSON.stringify({ v: 1, t: scope.tenantId, u: scope.userId, g: garmentId, w: viewId, e: expiresAt } satisfies WireClaim)).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  resolve(token: string, scope: GarmentOwnerScope): GarmentDeliveryClaim {
    if (!token || token.length > 4096) throw invalidDelivery();
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) throw invalidDelivery();
    const expected = this.sign(payload);
    const actualBytes = Buffer.from(signature, 'base64url');
    const expectedBytes = Buffer.from(expected, 'base64url');
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) throw invalidDelivery();
    let claim: WireClaim;
    try { claim = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as WireClaim; }
    catch { throw invalidDelivery(); }
    if (claim?.v !== 1 || typeof claim.t !== 'string' || typeof claim.u !== 'string' || typeof claim.g !== 'string' || typeof claim.w !== 'string'
      || !Number.isSafeInteger(claim.e) || claim.e <= this.now() || claim.t !== scope.tenantId || claim.u !== scope.userId) throw invalidDelivery();
    return Object.freeze({ garmentId: claim.g, viewId: claim.w, tenantId: claim.t, userId: claim.u, expiresAt: claim.e });
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update('bers-managed-garment-delivery-v1\0').update(payload).digest('base64url');
  }
}

function invalidDelivery(): Error & { status: number; code: string } {
  return Object.assign(new Error('Garment delivery capability is invalid or expired'), { status: 404, code: 'garment_view_not_found' });
}
