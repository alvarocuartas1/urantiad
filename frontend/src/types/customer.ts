import type { DocumentType, IdentityDocument } from './document'

export interface CustomerSummary extends IdentityDocument {
  id: number
  name: string
  is_active: boolean
  /** System customer "Consumidor final": cannot be edited or deactivated. */
  is_default: boolean
}

export interface Customer extends CustomerSummary {
  phone: string | null
  email: string | null
  address: string | null
  created_at: string
  updated_at: string
}

interface CustomerEditableFields {
  document_type: DocumentType
  document_number: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
}

export type CustomerCreate = CustomerEditableFields

export interface CustomerUpdate extends Partial<CustomerEditableFields> {
  is_active?: boolean
}

export interface CustomerListParams {
  page: number
  size: number
  search?: string
  is_active?: boolean
}
