import type { ProductType, StockStatus, UnitOfMeasure } from '@/types/catalog'

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  product: 'Producto',
  service: 'Servicio',
}

export const UNIT_LABELS: Record<UnitOfMeasure, string> = {
  unit: 'Unidad',
  pack: 'Paquete',
  box: 'Caja',
  kg: 'Kilogramo',
  g: 'Gramo',
  l: 'Litro',
  ml: 'Mililitro',
  page: 'Página',
}

export const UNIT_ABBREVIATIONS: Record<UnitOfMeasure, string> = {
  unit: 'und',
  pack: 'paq',
  box: 'caja',
  kg: 'kg',
  g: 'g',
  l: 'l',
  ml: 'ml',
  page: 'pág',
}

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  ok: 'Stock suficiente',
  low: 'Comprar pronto',
  critical: 'Stock crítico',
  out_of_stock: 'Agotado',
}

/** IVA rates used in Colombia (percentage included in the sale price). */
export const TAX_RATES = ['0', '5', '19'] as const

/** Entries of a label map, typed by key, for building `<option>` lists. */
export function labelEntries<K extends string>(labels: Record<K, string>): [K, string][] {
  return Object.entries(labels) as [K, string][]
}
