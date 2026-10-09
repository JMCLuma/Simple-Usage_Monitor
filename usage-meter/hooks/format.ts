import type { Limit, Mode } from '../types'

const LABELS: Record<string, { long: string; short: string }> = {
  five_hour: { long: '5-hour', short: '5h' },
  seven_day: { long: '7-day', short: '7d' },
  spend_limit: { long: 'Spend', short: '$' },
}

// An unknown window's name is cut to its column rather than widening the row.
export const label = (kind: string): string => (LABELS[kind]?.long ?? kind).slice(0, COL.label)
export const shortLabel = (kind: string): string => (LABELS[kind]?.short ?? kind).slice(0, 3)

/** Column widths in cells: "5-hour", "100% left", "↻ Wed 12:30 PM", "23h 59m". */
export const COL = { label: 7, left: 9, clock: 14, count: 7 } as const
/** Slim's leading "◆ 5h" and its trailing controls ("s: slim h: hide"). */
export const SLIM_LEAD = 6
export const CONTROLS = 15
export const MAX_BAR = { full: 32, slim: 20 } as const
const MIN_BAR = 8

/** Which columns a row draws, and the bar's width (0 when it does not fit). */
export type Plan = { bar: number; clock: boolean; controls: boolean }

/** The narrowest band each view draws whole; below it the band clips at its edge. */
export const MIN_COLUMNS = { full: COL.label + 1 + COL.left + 1 + COL.count, slim: SLIM_LEAD + COL.left + 1 + COL.count } as const

/**
 * Fits a row into `columns` cells. Always kept: the label, % left and the countdown.
 * Then, as room allows: slim's controls, the bar at its smallest, the reset clock,
 * and the bar grows into whatever is left. Each column costs a cell of gap.
 */
export function planRow(columns: number, mode: Mode): Plan {
  let room = columns - MIN_COLUMNS[mode]
  // Full draws its controls on the header row, which always has room for them.
  const plan: Plan = { bar: 0, clock: false, controls: mode === 'full' }
  if (mode === 'slim' && room >= CONTROLS + 1) {
    plan.controls = true
    room -= CONTROLS + 1
  }
  if (room >= MIN_BAR + 1) {
    plan.bar = MIN_BAR
    room -= MIN_BAR + 1
  }
  if (room >= COL.clock + 1) {
    plan.clock = true
    room -= COL.clock + 1
  }
  if (plan.bar > 0) plan.bar = Math.min(MAX_BAR[mode], plan.bar + room)
  return plan
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'now'
  const minutes = Math.ceil(ms / 60_000)
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export const percentLeft = (l: Limit): number =>
  Math.max(0, Math.round((100 - l.percentUsed) * 10) / 10)

export const countdown = (l: Limit, now: number): string =>
  l.resetsAt ? formatCountdown(Date.parse(l.resetsAt) - now) : ''

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** A local clock time, `4:30 PM`, with the weekday in front when it is not today. */
export function formatClock(at: Date, now: Date): string {
  const h = at.getHours() % 12 || 12
  const time = `${h}:${String(at.getMinutes()).padStart(2, '0')} ${at.getHours() < 12 ? 'AM' : 'PM'}`
  return at.toDateString() === now.toDateString() ? time : `${DAYS[at.getDay()]} ${time}`
}

/** When the window resets, in local time; empty when the window has no reset. */
export const resetClock = (l: Limit, now: number): string =>
  l.resetsAt ? formatClock(new Date(Date.parse(l.resetsAt)), new Date(now)) : ''

export const GREEN = '#3fb950'
export const YELLOW = '#e3b341'
export const ORANGE = '#f0883e'
export const RED = '#f85149'
export const CRIMSON = '#d1242f'

/** Bands by whole percent left, as the panel prints it, coolest first. */
const BANDS: { from: number; color: string }[] = [
  { from: 65, color: GREEN },
  { from: 35, color: YELLOW },
  { from: 10, color: ORANGE },
  { from: 5, color: RED },
  { from: 0, color: CRIMSON },
]

// How long each window runs; one not listed (a spend limit) has no pace.
const WINDOW_MS: Record<string, number> = {
  five_hour: 5 * 3_600_000,
  seven_day: 7 * 24 * 3_600_000,
}
// Too early in a window, one burst of use reads as a runaway pace.
const MIN_ELAPSED = 0.05

/** How far through its window a limit is (0 to 1), or undefined when that is unknown. */
export function elapsedFraction(l: Limit, now: number): number | undefined {
  const length = WINDOW_MS[l.kind]
  if (!length || !l.resetsAt || now <= 0) return undefined
  const remaining = Date.parse(l.resetsAt) - now
  if (Number.isNaN(remaining)) return undefined
  return Math.min(1, Math.max(0, 1 - remaining / length))
}

/** True when, at the rate so far, the limit runs out before the window resets. */
export function isOverPace(l: Limit, now: number): boolean {
  const elapsed = elapsedFraction(l, now)
  if (elapsed === undefined || elapsed < MIN_ELAPSED) return false
  return l.percentUsed / 100 > elapsed
}

export const isLimitReached = (l: Limit): boolean => percentLeft(l) <= 0

/**
 * The band for the percent left, one band warmer when the pace runs out before the
 * reset: 65–100 green, 35–64 yellow, 10–34 orange, 5–9 red, 0–4 crimson.
 */
export function levelColor(l: Limit, now: number): string {
  const left = Math.round(percentLeft(l))
  const band = BANDS.findIndex(b => left >= b.from)
  const warmer = isOverPace(l, now) ? 1 : 0
  return BANDS[Math.min(BANDS.length - 1, band + warmer)]!.color
}

/** How many of a bar's `width` cells are filled: the share left, so the bar drains. */
export function filledCells(l: Limit, width: number): number {
  const cells = Math.max(1, width)
  return Math.round((Math.min(100, percentLeft(l)) / 100) * cells)
}

/** A run of bar cells in one color: what the bar draws as one painted box. */
export type Segment = { cells: number; color: string }

/** The bar as runs: the fill, then the track; an empty run is left out. */
export function barSegments(l: Limit, width: number, now: number, track: string): Segment[] {
  const filled = filledCells(l, width)
  return [
    { cells: filled, color: levelColor(l, now) },
    { cells: width - filled, color: track },
  ].filter(s => s.cells > 0)
}

/** Slim shows the 5-hour window alone (or the first window when there is none). */
export const visibleLimits = (limits: Limit[], mode: Mode): Limit[] => {
  if (mode === 'full') return limits
  const five = limits.find(l => l.kind === 'five_hour') ?? limits[0]
  return five ? [five] : []
}

/** Thresholds (percent used) that earn a one-time toast per window. */
export const WARN_AT = [80, 90] as const
