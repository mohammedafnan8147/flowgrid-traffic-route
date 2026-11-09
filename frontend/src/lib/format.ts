import type { CongestionLevel, ObjectiveKey, Road } from '../types'

export const objectiveLabels: Record<ObjectiveKey, string> = {
  time: 'Minimum travel time',
  distance: 'Minimum distance',
  congestion: 'Minimum congestion',
  eco: 'Eco-friendly',
  balanced: 'Balanced weights',
}

export const objectiveShort: Record<ObjectiveKey, string> = {
  time: 'Fastest',
  distance: 'Shortest',
  congestion: 'Low congestion',
  eco: 'Eco',
  balanced: 'Balanced',
}

export const congestionColors: Record<CongestionLevel, string> = {
  free: '#2f9d83',
  moderate: '#c8b84d',
  heavy: '#e8a21e',
  severe: '#e65a4a',
  closed: '#d94b5c',
}

export const congestionBg: Record<CongestionLevel, string> = {
  free: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20',
  moderate: 'bg-yellow-400/10 text-yellow-300 border-yellow-400/20',
  heavy: 'bg-orange-400/10 text-orange-300 border-orange-400/20',
  severe: 'bg-red-400/10 text-red-300 border-red-400/20',
  closed: 'bg-rose-500/10 text-rose-300 border-rose-500/25',
}

export const routeColors = ['#43e0b0', '#f5b942', '#7cb4ff', '#c998ff', '#f4796b']

export function roadColor(road: Road): string {
  if (road.status === 'closed') return congestionColors.closed
  return congestionColors[road.congestion_level] ?? congestionColors.free
}

export function roadWeight(road: Road): number {
  if (road.status === 'closed') return 3
  switch (road.road_class) {
    case 'highway':
      return 5
    case 'arterial':
      return 4
    case 'collector':
      return 2.6
    default:
      return 1.7
  }
}

export function titleCase(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 1 })}`
}

export function formatTime(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—'
  if (minutes < 60) return `${minutes.toFixed(1)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${h}h ${m}m`
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diff = Math.max(0, Date.now() - then)
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}
