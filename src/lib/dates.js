// Utilitaires de dates. Les dates sont stockées au format ISO 'YYYY-MM-DD'.

export function todayISO() {
  return toISO(new Date())
}

export function toISO(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso, days) {
  const date = fromISO(iso)
  date.setDate(date.getDate() + days)
  return toISO(date)
}

export function addMonths(iso, months) {
  const date = fromISO(iso)
  const day = date.getDate()
  date.setDate(1)
  date.setMonth(date.getMonth() + months)
  // Évite les débordements (ex: 31 janvier + 1 mois)
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(day, lastDay))
  return toISO(date)
}

export function compareISO(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

export function formatFR(iso) {
  return fromISO(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Différence approximative en mois entre deux dates ISO (a -> b)
export function monthsBetween(a, b) {
  const da = fromISO(a)
  const db = fromISO(b)
  return (
    (db.getFullYear() - da.getFullYear()) * 12 +
    (db.getMonth() - da.getMonth()) +
    (db.getDate() - da.getDate()) / 30
  )
}
