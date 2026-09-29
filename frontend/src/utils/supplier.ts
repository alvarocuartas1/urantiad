import type { DocumentType, SupplierSummary } from '@/types/supplier'

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  nit: 'NIT',
  cc: 'Cédula de ciudadanía',
  ce: 'Cédula de extranjería',
  passport: 'Pasaporte',
  other: 'Otro',
}

const DOCUMENT_TYPE_ABBREVIATIONS: Record<DocumentType, string> = {
  nit: 'NIT',
  cc: 'CC',
  ce: 'CE',
  passport: 'PAS',
  other: 'DOC',
}

/** "NIT 900123456-7". */
export function formatDocument(
  supplier: Pick<SupplierSummary, 'document_type' | 'document_number'>,
) {
  return `${DOCUMENT_TYPE_ABBREVIATIONS[supplier.document_type]} ${supplier.document_number}`
}
