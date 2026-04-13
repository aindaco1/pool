import { beforeEach, describe, expect, it, vi } from 'vitest';

const ADD_ON_CONFIG = {
  enabled: true,
  low_stock_threshold: 5,
  products: [
    {
      id: 'dust-wave-sticker',
      name: 'DUST WAVE Sticker',
      description: '3" x 3" matte laminated circle-cut vinyl sticker.',
      image_url: 'https://shop.dustwave.xyz/assets/images/sticker-glove.png',
      price: 3,
      category: 'physical',
      shipping_preset: 'sticker',
      inventory: 50,
      variants: []
    },
    {
      id: 'dust-wave-tshirt',
      name: 'DUST WAVE T-Shirt',
      description: 'Our official t-shirt. 100% cotton.',
      image_url: 'https://shop.dustwave.xyz/assets/images/dustwave-tshirt.png',
      price: 25,
      category: 'physical',
      shipping_preset: 'tshirt',
      variant_option_name: 'Size',
      variants: [
        { id: 'm', label: 'M', inventory: 4 },
        { id: 'l', label: 'L', inventory: 4 }
      ]
    },
    {
      id: 'digital-zine',
      name: 'Digital Zine',
      description: 'A PDF companion download.',
      image_url: '',
      price: 5,
      category: 'digital',
      variants: []
    },
    {
      id: 'custom-pin',
      name: 'Custom Pin',
      description: 'A physical pin with explicit measurements.',
      image_url: '',
      price: 12,
      category: 'physical',
      shipping: {
        weight_oz: 2,
        packaging_weight_oz: 0.5,
        length_in: 2,
        width_in: 2,
        height_in: 0.5,
        stack_height_in: 0.2
      },
      inventory: 10,
      variants: []
    }
  ]
};

describe('add-on utils', () => {
  beforeEach(() => {
    vi.resetModules();
    delete (window as Window & { PoolAddOnUtils?: unknown }).PoolAddOnUtils;
    (window as any).POOL_CONFIG = {
      shipping: {
        presets: {
          sticker: {
            weight_oz: 1,
            packaging_weight_oz: 0.5,
            length_in: 4,
            width_in: 4,
            height_in: 0.1,
            stack_height_in: 0.05
          },
          tshirt: {
            weight_oz: 8,
            packaging_weight_oz: 1,
            length_in: 12,
            width_in: 10,
            height_in: 1.5,
            stack_height_in: 0.5
          }
        }
      }
    };
  });

  it('hides sold-out variants and marks low stock from the shared inventory snapshot', async () => {
    await import('../../assets/js/add-on-utils.js');

    const addOnUtils = (window as Window & { PoolAddOnUtils?: any }).PoolAddOnUtils;
    expect(addOnUtils).toBeTruthy();

    const entries = addOnUtils.buildProductStateEntries(ADD_ON_CONFIG, [], {
      lowStockThreshold: 5,
      products: {
        'dust-wave-tshirt': {
          inventory: 8,
          sold: 4,
          remaining: 4,
          available: true,
          soldOut: false,
          variants: {
            m: { inventory: 4, sold: 0, remaining: 4, available: true, soldOut: false },
            l: { inventory: 4, sold: 4, remaining: 0, available: false, soldOut: true }
          }
        },
        'dust-wave-sticker': {
          inventory: 50,
          sold: 50,
          remaining: 0,
          available: false,
          soldOut: true
        }
      }
    });

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: 'dust-wave-tshirt',
          lowStock: false,
          variants: [
            expect.objectContaining({
              id: 'm',
              remaining: 4,
              lowStock: true
            })
          ]
        })
      ])
    );

    const tshirt = entries.find((entry: { productId: string }) => entry.productId === 'dust-wave-tshirt');
    expect(tshirt?.variants.map((variant: { id: string }) => variant.id)).toEqual(['m']);
    expect(entries.find((entry: { productId: string }) => entry.productId === 'dust-wave-sticker')).toBeUndefined();
  });

  it('keeps saved remaining inventory separate from editable max for selected variants', async () => {
    await import('../../assets/js/add-on-utils.js');

    const addOnUtils = (window as Window & { PoolAddOnUtils?: any }).PoolAddOnUtils;
    expect(addOnUtils).toBeTruthy();

    const entries = addOnUtils.buildProductStateEntries(ADD_ON_CONFIG, [
      { productId: 'dust-wave-tshirt', variantId: 'm', quantity: 2 }
    ], {
      lowStockThreshold: 5,
      products: {
        'dust-wave-tshirt': {
          variants: {
            m: { inventory: 4, sold: 2, remaining: 2, available: true, soldOut: false }
          }
        }
      }
    });

    const tshirt = entries.find((entry: { productId: string }) => entry.productId === 'dust-wave-tshirt');
    const medium = tshirt?.variants.find((variant: { id: string }) => variant.id === 'm');
    expect(medium?.remaining).toBe(2);
    expect(medium?.maxQuantity).toBe(2);
    expect(medium?.editableMaxQuantity).toBe(4);
  });

  it('resolves physical add-on shipping from presets or explicit metadata and leaves digital add-ons unshippable', async () => {
    await import('../../assets/js/add-on-utils.js');

    const addOnUtils = (window as Window & { PoolAddOnUtils?: any }).PoolAddOnUtils;
    expect(addOnUtils).toBeTruthy();

    const tshirt = addOnUtils.normalizeSelection({
      productId: 'dust-wave-tshirt',
      variantId: 'm',
      quantity: 1
    }, ADD_ON_CONFIG);
    const pin = addOnUtils.normalizeSelection({
      productId: 'custom-pin',
      quantity: 1
    }, ADD_ON_CONFIG);
    const zine = addOnUtils.normalizeSelection({
      productId: 'digital-zine',
      quantity: 1
    }, ADD_ON_CONFIG);

    expect(tshirt.shipping_preset).toBe('tshirt');
    expect(tshirt.shipping).toEqual({
      weight_oz: 8,
      packaging_weight_oz: 1,
      length_in: 12,
      width_in: 10,
      height_in: 1.5,
      stack_height_in: 0.5
    });

    expect(pin.shipping).toEqual({
      weight_oz: 2,
      packaging_weight_oz: 0.5,
      length_in: 2,
      width_in: 2,
      height_in: 0.5,
      stack_height_in: 0.2
    });

    expect(zine.category).toBe('digital');
    expect(zine.shipping).toBeNull();
  });
});
