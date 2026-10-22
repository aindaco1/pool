import { describe, expect, it, vi } from 'vitest';
import { resolvePaymentCustomer } from '../../worker/src/payment-customer.js';

function client() {
  return {
    customers: { create: vi.fn(async () => ({ id: 'cus_shared' })) },
    paymentMethods: {
      retrieve: vi.fn(async () => ({ id: 'pm_saved', customer: null as string | null })),
      attach: vi.fn(async () => ({ id: 'pm_saved', customer: 'cus_shared' }))
    }
  };
}
const identity = { orderId: 'order-one', email: 'supporter@example.com', paymentMethodId: 'pm_saved' };

describe('saved payment customer resolution', () => {
  it('uses identical customer and attachment keys for concurrent completions', async () => {
    const stripe = client();
    expect(await Promise.all([
      resolvePaymentCustomer(stripe, identity), resolvePaymentCustomer(stripe, identity)
    ])).toEqual(['cus_shared', 'cus_shared']);
    expect(stripe.customers.create.mock.calls).toEqual([
      [{ email: identity.email }, { idempotencyKey: 'customer:checkout:order-one' }],
      [{ email: identity.email }, { idempotencyKey: 'customer:checkout:order-one' }]
    ]);
    expect(stripe.paymentMethods.attach).toHaveBeenCalledWith('pm_saved', { customer: 'cus_shared' }, {
      idempotencyKey: 'payment-method:attach:order-one'
    });
  });

  it('recovers the actual attachment after a racing Stripe conflict', async () => {
    const stripe = client();
    stripe.paymentMethods.retrieve.mockResolvedValueOnce({ id: 'pm_saved', customer: null })
      .mockResolvedValueOnce({ id: 'pm_saved', customer: 'cus_other_completion' });
    stripe.paymentMethods.attach.mockRejectedValueOnce(new Error('idempotency_key_in_use'));
    expect(await resolvePaymentCustomer(stripe, identity)).toBe('cus_other_completion');
  });

  it('fails instead of returning an incomplete identity when attachment fails', async () => {
    const stripe = client();
    stripe.paymentMethods.attach.mockRejectedValueOnce(new Error('idempotency_key_in_use'));
    await expect(resolvePaymentCustomer(stripe, identity)).rejects.toThrow('idempotency_key_in_use');
  });

  it('reuses an existing customer without creating or moving a payment method', async () => {
    const stripe = client();
    stripe.paymentMethods.retrieve.mockResolvedValue({ id: 'pm_saved', customer: 'cus_existing' });
    expect(await resolvePaymentCustomer(stripe, { ...identity, allowCreate: false })).toBe('cus_existing');
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.paymentMethods.attach).not.toHaveBeenCalled();
  });

  it('keeps existing-only repair read-only when no customer is attached', async () => {
    const stripe = client();
    await expect(resolvePaymentCustomer(stripe, { ...identity, allowCreate: false })).rejects.toThrow('no attached customer');
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.paymentMethods.attach).not.toHaveBeenCalled();
  });
});
