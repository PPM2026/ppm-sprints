/**
 * Shared formatters and constants for PPM Admin Dashboard.
 */

export const PLATFORMS = [
  { key: 'assetmanagement', name: 'Assetmanagement', url: 'https://ppm-assetmanagement.vercel.app', github: 'https://github.com/PPM2026/ppm-assetmanagement' },
  { key: 'projectontwikkeling', name: 'Projectontwikkeling', url: 'https://ppm-projectontwikkeling.vercel.app', github: 'https://github.com/PPM2026/ppm-projectontwikkeling' },
  { key: 'acquisitie', name: 'Acquisitie', url: 'https://ppm-acquisitie.vercel.app', github: 'https://github.com/PPM2026/ppm-acquisitie' },
  { key: 'meta', name: 'Admin Dashboard', url: 'https://ppm-admin-dashboard.vercel.app', github: 'https://github.com/PPM2026/ppm-admin-dashboard' }
]

export function formatDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function truncate(str, len) {
  if (!str) return '-'
  return str.length > len ? str.substring(0, len) + '...' : str
}

export function statusPill(status) {
  const map = {
    open: { label: 'Open', cls: 'orange' },
    in_progress: { label: 'In behandeling', cls: 'blue' },
    resolved: { label: 'Opgelost', cls: 'green' },
    closed: { label: 'Gesloten', cls: 'gray' }
  }
  const s = map[status] || { label: status || '-', cls: 'gray' }
  return `<span class="pill-sm ${s.cls}">${s.label}</span>`
}

export function typePill(type) {
  if (type === 'bug') return `<span class="pill-sm red">Bug</span>`
  if (type === 'feature') return `<span class="pill-sm purple">Feature</span>`
  return `<span class="pill-sm gray">${type || '-'}</span>`
}

export function platformLabel(key) {
  const p = PLATFORMS.find(p => p.key === key)
  return p ? p.name : (key === 'meta' ? 'Admin Dashboard' : key || '-')
}

export function priorityPill(priority) {
  const map = {
    low: { label: 'Laag', cls: 'gray' },
    medium: { label: 'Medium', cls: 'orange' },
    high: { label: 'Hoog', cls: 'red' },
    critical: { label: 'Kritiek', cls: 'red' }
  }
  const p = map[priority] || { label: priority || '-', cls: 'gray' }
  return `<span class="pill-sm ${p.cls}">${p.label}</span>`
}
