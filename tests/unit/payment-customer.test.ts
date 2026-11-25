import { describe, expect, it, vi } from 'vitest';
import { StripeApiError } from '../../worker/src/stripe.js';
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

  it('recovers when the other completion attaches the method just after the conflict lookup', async () => {
    vi.useFakeTimers();
    try {
      const stripe = client();
      stripe.customers.create.mockRejectedValueOnce(
        new StripeApiError('Concurrent customer creation', { code: 'idempotency_key_in_use' })
      );
      setTimeout(() => {
        stripe.paymentMethods.retrieve.mockResolvedValue({ id: 'pm_saved', customer: 'cus_other_completion' });
      }, 250);

      await Promise.all([
        expect(resolvePaymentCustomer(stripe, identity)).resolves.toBe('cus_other_completion'),
        vi.advanceTimersByTimeAsync(1000)
      ]);
      expect(stripe.paymentMethods.retrieve).toHaveBeenCalledTimes(3);
      expect(stripe.customers.create).toHaveBeenCalledTimes(1);
      expect(stripe.paymentMethods.attach).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('recovers the actual attachment after a racing Stripe conflict', async () => {
    const stripe = client();
    stripe.paymentMethods.retrieve.mockResolvedValueOnce({ id: 'pm_saved', customer: null })
      .mockResolvedValueOnce({ id: 'pm_saved', customer: 'cus_other_completion' });
    stripe.paymentMethods.attach.mockRejectedValueOnce(
      new StripeApiError('Concurrent attachment', { code: 'idempotency_key_in_use' })
    );
    expect(await resolvePaymentCustomer(stripe, identity)).toBe('cus_other_completion');
    expect(stripe.paymentMethods.retrieve).toHaveBeenCalledTimes(2);
  });

  it('fails instead of returning an incomplete identity when attachment fails', async () => {
    const stripe = client();
    const error = new StripeApiError('Payment method unavailable', { code: 'resource_missing' });
    stripe.paymentMethods.attach.mockRejectedValueOnce(error);
    await expect(resolvePaymentCustomer(stripe, identity)).rejects.toBe(error);
    expect(stripe.paymentMethods.retrieve).toHaveBeenCalledTimes(2);
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
