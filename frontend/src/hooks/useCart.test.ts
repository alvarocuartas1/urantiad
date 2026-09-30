import type { Product } from '@/types/catalog'
import { cartReducer, EMPTY_CART } from './useCart'

const PRODUCT = {
  id: 1,
  type: 'product',
  sku: 'AGUA-1',
  name: 'Agua',
  unit_of_measure: 'unit',
  sale_price: '2000.00',
  tax_rate: '0.00',
  current_stock: '10.00',
} as Product

describe('cartReducer', () => {
  it('adds a product once and increments it when scanned again', () => {
    let state = cartReducer(EMPTY_CART, { type: 'add', product: PRODUCT })
    state = cartReducer(state, { type: 'add', product: PRODUCT })

    expect(state.lines).toHaveLength(1)
    expect(state.lines[0]?.quantity).toBe('2')
  })

  it('refreshes prices and stock of the lines', () => {
    const state = cartReducer(EMPTY_CART, { type: 'add', product: PRODUCT })

    const refreshed = cartReducer(state, {
      type: 'refreshProducts',
      products: [{ ...PRODUCT, sale_price: '2500.00', current_stock: '3.00' }],
    })

    expect(refreshed.lines[0]?.product.sale_price).toBe('2500.00')
    expect(refreshed.lines[0]?.product.current_stock).toBe('3.00')
  })

  it('removes lines and clears the whole sale', () => {
    let state = cartReducer(EMPTY_CART, { type: 'add', product: PRODUCT })
    state = cartReducer(state, { type: 'setSaleDiscount', value: '100' })

    expect(cartReducer(state, { type: 'remove', productId: 1 }).lines).toEqual([])
    expect(cartReducer(state, { type: 'clear' })).toEqual(EMPTY_CART)
  })
})
