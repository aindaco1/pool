/**
 * Resolve a saved payment method's customer without letting checkout/webhook
 * races persist an unchargeable pledge. Stripe owns the attachment.
 */
function objectId(value) {
  return typeof value === 'string' ? value : String(value?.id || '');
}

export async function resolvePaymentCustomer(stripe, {
  orderId, email, paymentMethodId, customerId = '', allowCreate = true
}) {
  const methodId = objectId(paymentMethodId);
  if (!methodId || !orderId) throw new Error('Missing saved payment identity');
  const knownCustomer = objectId(customerId);
  if (knownCustomer) return knownCustomer;

  const attachedCustomer = async () => {
    const method = await stripe.paymentMethods.retrieve(methodId);
    if (method?.id !== methodId) throw new Error('Saved payment method could not be verified');
    return objectId(method.customer);
  };
  const existingCustomer = await attachedCustomer();
  if (existingCustomer) return existingCustomer;
  if (!allowCreate) throw new Error('Saved payment method has no attached customer');

  try {
    // Both completion paths use identical parameters and the same provider key.
    const customer = await stripe.customers.create(
      { email }, { idempotencyKey: `customer:checkout:${orderId}` }
    );
    if (!customer?.id) throw new Error('Stripe customer creation failed');
    const method = await stripe.paymentMethods.attach(
      methodId,
      { customer: customer.id },
      { idempotencyKey: `payment-method:attach:${orderId}` }
    );
    if (method?.id !== methodId || objectId(method.customer) !== customer.id) {
      throw new Error('Stripe payment method attachment could not be verified');
    }
    return customer.id;
  } catch (error) {
    let recoveredCustomer = await attachedCustomer();
    if (!recoveredCustomer && error?.code === 'idempotency_key_in_use') {
      // The competing completion may still be attaching this payment method.
      await new Promise(resolve => setTimeout(resolve, 1000));
      recoveredCustomer = await attachedCustomer();
    }
    if (recoveredCustomer) return recoveredCustomer;
    throw error;
  }
}
