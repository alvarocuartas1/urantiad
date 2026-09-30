import { useReducer } from 'react'
import type { Product } from '@/types/catalog'
import type { CustomerSummary } from '@/types/customer'
import { isDecimalInput, normalizeDecimal, toCents, fromCents, trimDecimal } from '@/utils/decimal'
import { toCartProduct, type CartLine } from '@/utils/sale'

export interface CartState {
  lines: CartLine[]
  /** Discount of the whole sale as typed; empty means 0. */
  saleDiscount: string
  /** `null` = "Consumidor final" (the backend's default customer). */
  customer: CustomerSummary | null
}

export type CartAction =
  | { type: 'add'; product: Product }
  | { type: 'setQuantity'; productId: number; value: string }
  | { type: 'setDiscount'; productId: number; value: string }
  | { type: 'remove'; productId: number }
  | { type: 'setSaleDiscount'; value: string }
  | { type: 'setCustomer'; customer: CustomerSummary | null }
  | { type: 'refreshProducts'; products: Product[] }
  | { type: 'clear' }

export const EMPTY_CART: CartState = { lines: [], saleDiscount: '', customer: null }

/** One more unit of a line (scanning a product already in the cart). */
function increment(quantity: string): string {
  const value = quantity.trim()
  if (!isDecimalInput(value)) return '1'
  return trimDecimal(fromCents(toCents(normalizeDecimal(value)) + 100n))
}

function updateLine(
  state: CartState,
  productId: number,
  change: (line: CartLine) => CartLine,
): CartState {
  return {
    ...state,
    lines: state.lines.map((line) => (line.product.id === productId ? change(line) : line)),
  }
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      const existing = state.lines.some((line) => line.product.id === action.product.id)
      if (existing) {
        return updateLine(state, action.product.id, (line) => ({
          ...line,
          quantity: increment(line.quantity),
        }))
      }
      const line = { product: toCartProduct(action.product), quantity: '1', discount: '' }
      return { ...state, lines: [...state.lines, line] }
    }
    case 'setQuantity':
      return updateLine(state, action.productId, (line) => ({ ...line, quantity: action.value }))
    case 'setDiscount':
      return updateLine(state, action.productId, (line) => ({ ...line, discount: action.value }))
    case 'remove':
      return {
        ...state,
        lines: state.lines.filter((line) => line.product.id !== action.productId),
      }
    case 'setSaleDiscount':
      return { ...state, saleDiscount: action.value }
    case 'setCustomer':
      return { ...state, customer: action.customer }
    case 'refreshProducts': {
      const fresh = new Map(action.products.map((product) => [product.id, product]))
      return {
        ...state,
        lines: state.lines.map((line) => {
          const product = fresh.get(line.product.id)
          return product ? { ...line, product: toCartProduct(product) } : line
        }),
      }
    }
    case 'clear':
      return EMPTY_CART
  }
}

/** Cart of the POS: lines, sale discount and customer. */
export function useCart() {
  return useReducer(cartReducer, EMPTY_CART)
}
