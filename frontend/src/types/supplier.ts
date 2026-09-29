import type { UnitOfMeasure } from './catalog'

export type DocumentType = 'nit' | 'cc' | 'ce' | 'passport' | 'other'

export interface SupplierSummary {
  id: number
  document_type: DocumentType
  document_number: string
  name: string
  is_active: boolean
}

export interface Supplier extends SupplierSummary {
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface SupplierEditableFields {
  document_type: DocumentType
  document_number: string
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  notes: string | null
}

export type SupplierCreate = SupplierEditableFields

export interface SupplierUpdate extends Partial<SupplierEditableFields> {
  is_active?: boolean
}

export interface SupplierListParams {
  page: number
  size: number
  search?: string
  is_active?: boolean
}

export interface LinkedProduct {
  id: number
  sku: string
  name: string
  unit_of_measure: UnitOfMeasure
  is_active: boolean
}

/** A product sold by a supplier, with its latest purchase price. */
export interface SupplierProduct {
  id: number
  supplier: SupplierSummary
  product: LinkedProduct
  supplier_sku: string | null
  /** Unit purchase cost before tax. */
  purchase_price: string | null
  /** When the price last changed; `null` without a price. */
  price_updated_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SupplierProductFields {
  supplier_sku: string | null
  purchase_price: string | null
  notes: string | null
}

export interface SupplierProductCreate extends SupplierProductFields {
  product_id: number
}

export type SupplierProductUpdate = Partial<SupplierProductFields>

export interface SupplierProductListParams {
  page: number
  size: number
  search?: string
}
