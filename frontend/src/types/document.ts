export type DocumentType = 'nit' | 'cc' | 'ce' | 'passport' | 'other'

/** Identity document of a supplier or customer. */
export interface IdentityDocument {
  document_type: DocumentType
  document_number: string
}
