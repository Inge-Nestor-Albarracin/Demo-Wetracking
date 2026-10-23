export const BUSINESS_TIME_ZONE = 'America/Bogota'


export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('es-CO', {
    timeZone: BUSINESS_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

// Time of day (HH:MM:SS) in the business time zone, for read timestamps.
export function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString('es-CO', { timeZone: BUSINESS_TIME_ZONE, hour12: false })
}
