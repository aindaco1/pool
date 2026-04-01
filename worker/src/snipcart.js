/**
 * Snipcart API Client
 * 
 * @see https://docs.snipcart.com/v3/api-reference/orders
 */

/**
 * Create a Snipcart API client
 */
export function createSnipcartClient(apiKey, baseUrl = 'https://app.snipcart.com/api') {
  const authHeader = 'Basic ' + btoa(apiKey + ':');

  async function request(method, path, data) {
    const url = `${baseUrl}${path}`;
    const options = {
      method,
      headers: {
        'Accept': 'application/json',
        'Authorization': authHeader
      }
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Snipcart API error ${response.status}: ${error}`);
    }

    return response.json();
  }

  return {
    orders: {
      /**
       * Get order by token
       */
      get: (token) => request('GET', `/orders/${token}`),

      /**
       * Update order (status, metadata, tracking, etc.)
       */
      update: (token, data) => request('PUT', `/orders/${token}`, data),

      /**
       * List orders with filters
       * @param {Object} params - { email, status, limit, offset, from, to }
       */
      list: (params = {}) => {
        const queryParams = new URLSearchParams();
        if (params.email) queryParams.set('email', params.email);
        if (params.status) queryParams.set('status', params.status);
        if (params.limit) queryParams.set('limit', String(params.limit));
        if (params.offset) queryParams.set('offset', String(params.offset));
        if (params.from) queryParams.set('from', params.from);
        if (params.to) queryParams.set('to', params.to);
        const query = queryParams.toString();
        return request('GET', `/orders${query ? '?' + query : ''}`);
      },

      /**
       * Refund an order
       */
      refund: (token, data) => request('POST', `/orders/${token}/refunds`, data)
    }
  };
}

/**
 * Extract pledge data from a Snipcart order
 */
export function extractPledgeFromOrder(order) {
  if (!order || !order.items || order.items.length === 0) {
    return null;
  }

  const cart = extractCartFromSnipcartItems(order.items);

  // Get the first item (pledge tier)
  const item = order.items[0];
  
  // Extract campaign slug from item custom fields or URL
  let campaignSlug = null;
  const slugField = order.customFields?.find(f => f.name === 'campaignSlug');
  if (slugField) {
    campaignSlug = slugField.value;
  } else {
    // Try to extract from item URL: /campaigns/{slug}/
    const match = item.url?.match(/\/campaigns\/([^/]+)/);
    if (match) {
      campaignSlug = match[1];
    }
  }

  return {
    orderId: order.token,
    email: order.email,
    status: order.status,
    paymentStatus: order.paymentStatus,
    campaignSlug,
    tierId: item.id,
    tierName: item.name,
    amount: Math.round(order.finalGrandTotal * 100), // Convert to cents
    tierSelections: cart.tierSelections,
    supportItems: cart.supportItems,
    customAmount: cart.customAmount,
    metadata: order.metadata || {},
    createdAt: order.creationDate,
    modifiedAt: order.modificationDate
  };
}

export function extractCartFromSnipcartItems(items = []) {
  const tierSelections = [];
  const supportItems = [];
  let customAmount = 0;
  let campaignSlug = null;

  for (const item of items || []) {
    if (!campaignSlug && item?.url) {
      const match = item.url.match(/\/campaigns\/([^/]+)/);
      if (match) {
        campaignSlug = match[1];
      }
    }

    const itemId = typeof item?.id === 'string' ? item.id : '';
    const quantity = Number(item?.quantity || 1);

    if (itemId.includes('__support__')) {
      supportItems.push({
        id: itemId.split('__support__')[1],
        amount: Math.round(Number(item?.price || 0) * quantity)
      });
      continue;
    }

    if (itemId.includes('__custom-support')) {
      customAmount += Math.round(Number(item?.price || 0) * quantity);
      continue;
    }

    if (!itemId.includes('__')) {
      continue;
    }

    const tierId = itemId.split('__')[1];
    if (!tierId) continue;

    const existingTier = tierSelections.find(entry => entry.id === tierId);
    if (existingTier) {
      existingTier.qty += quantity;
    } else {
      tierSelections.push({
        id: tierId,
        qty: quantity
      });
    }
  }

  return {
    campaignSlug,
    tierSelections,
    supportItems,
    customAmount
  };
}

/**
 * Check if an order can be cancelled
 */
export function canCancelOrder(order) {
  // Can cancel if not already cancelled and not charged
  if (order.status === 'Cancelled') {
    return { allowed: false, reason: 'Order is already cancelled' };
  }

  // Check metadata for charged status
  if (order.metadata?.charged) {
    return { allowed: false, reason: 'Order has already been charged' };
  }

  return { allowed: true };
}

/**
 * Check if an order can be modified
 */
export function canModifyOrder(order) {
  if (order.status === 'Cancelled') {
    return { allowed: false, reason: 'Order is cancelled' };
  }

  if (order.metadata?.charged) {
    return { allowed: false, reason: 'Order has already been charged' };
  }

  return { allowed: true };
}
