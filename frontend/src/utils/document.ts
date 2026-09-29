import type { DocumentType, IdentityDocument } from '@/types/document'

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
export function formatDocument(document: IdentityDocument) {
  return `${DOCUMENT_TYPE_ABBREVIATIONS[document.document_type]} ${document.document_number}`
}
