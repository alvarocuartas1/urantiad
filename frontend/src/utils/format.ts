const BUSINESS_TIME_ZONE = 'America/Bogota'

const dateTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: BUSINESS_TIME_ZONE,
})

/** Format a UTC ISO timestamp from the API in the business time zone. */
export function formatDateTime(value: string | null): string {
  return value ? dateTimeFormatter.format(new Date(value)) : '—'
}
