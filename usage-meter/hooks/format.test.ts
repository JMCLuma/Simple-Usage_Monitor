import { expect, test } from 'claude-code/testing'

import {
  CRIMSON,
  GREEN,
  ORANGE,
  RED,
  YELLOW,
  barSegments,
  countdown,
  elapsedFraction,
  filledCells,
  isLimitReached,
  isOverPace,
  formatClock,
  formatCountdown,
  levelColor,
  percentLeft,
  visibleLimits,
} from './format'

const FIVE = { kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-07T14:30:00Z' }
const SEVEN = { kind: 'seven_day', percentUsed: 41, resetsAt: '2026-10-10T12:00:00Z' }

test('formats countdowns', () => {
  expect(formatCountdown(0)).toBe('now')
  expect(formatCountdown(5 * 60_000)).toBe('5m')
  expect(formatCountdown((2 * 60 + 14) * 60_000)).toBe('2h 14m')
  expect(formatCountdown((3 * 1440 + 4 * 60) * 60_000)).toBe('3d 4h')
})

const used = (percentUsed: number) => ({ kind: 'five_hour', percentUsed })

const H = 3_600_000
const NOW = Date.parse('2026-10-07T20:00:00Z')
// A 5-hour window with `hoursLeft` until it resets, so (5 - hoursLeft) / 5 has elapsed.
const fiveHour = (percentUsed: number, hoursLeft: number) => ({
  kind: 'five_hour',
  percentUsed,
  resetsAt: new Date(NOW + hoursLeft * H).toISOString(),
})

test('bands by % left: green 65+, yellow 35+, orange 10+, red 5+, crimson below', () => {
  // No reset time, so no pace: the band alone.
  const at = (u: number) => levelColor(used(u), NOW)
  expect([0, 35, 35.4].map(at)).toEqual([GREEN, GREEN, GREEN]) // 100, 65, 64.6 → 65 left
  expect([35.6, 36, 65].map(at)).toEqual([YELLOW, YELLOW, YELLOW]) // 64, 64, 35 left
  expect([66, 90].map(at)).toEqual([ORANGE, ORANGE]) // 34, 10 left
  expect([91, 95].map(at)).toEqual([RED, RED]) // 9, 5 left
  expect([96, 100, 120].map(at)).toEqual([CRIMSON, CRIMSON, CRIMSON]) // 4, 0, 0 left
})

test('pace: running out before the reset warms the color one band', () => {
  // 2.5 of 5 hours gone (50%). 30% used is under pace, 60% is over it.
  expect(elapsedFraction(fiveHour(30, 2.5), NOW)).toBe(0.5)
  expect(isOverPace(fiveHour(30, 2.5), NOW)).toBe(false)
  expect(levelColor(fiveHour(30, 2.5), NOW)).toBe(GREEN) // 70 left
  expect(isOverPace(fiveHour(60, 2.5), NOW)).toBe(true)
  expect(levelColor(fiveHour(60, 2.5), NOW)).toBe(ORANGE) // 40 left is yellow, one warmer
  // Already the warmest band: stays crimson.
  expect(levelColor(fiveHour(98, 2.5), NOW)).toBe(CRIMSON)
})

test('pace is not judged too early, or without a known window', () => {
  // 6 minutes into 5 hours is 2%: under the 5% floor, however fast.
  expect(isOverPace(fiveHour(40, 4.9), NOW)).toBe(false)
  expect(isOverPace({ kind: 'spend_limit', percentUsed: 90, resetsAt: fiveHour(0, 1).resetsAt }, NOW)).toBe(false)
  expect(isOverPace(used(90), NOW)).toBe(false)
})

test('the bar is one fill in the level color, then the track', () => {
  // 70% left fills 7 of 10 cells.
  expect(barSegments(fiveHour(30, 2.5), 10, NOW, 'T')).toEqual([
    { cells: 7, color: GREEN },
    { cells: 3, color: 'T' },
  ])
  // Over pace: the fill takes the warmer color too.
  expect(barSegments(fiveHour(60, 2.5), 10, NOW, 'T')[0]).toEqual({ cells: 4, color: ORANGE })
  // Full and empty bars draw a single run.
  expect(barSegments(used(0), 10, NOW, 'T')).toEqual([{ cells: 10, color: GREEN }])
  expect(barSegments(used(100), 10, NOW, 'T')).toEqual([{ cells: 10, color: 'T' }])
  // Segments always add up to the bar's width.
  for (const u of [0, 1, 49, 50, 99, 100, 130])
    for (const h of [-1, 0, 0.2, 2.5, 4.99, 6])
      for (const w of [1, 8, 13, 32])
        expect(barSegments(fiveHour(u, h), w, NOW, 'T').reduce((n, s) => n + s.cells, 0)).toBe(w)
})

test('limit reached at 0% left', () => {
  expect(isLimitReached(used(100))).toBe(true)
  expect(isLimitReached(used(120))).toBe(true)
  expect(isLimitReached(used(99.9))).toBe(false)
})

test('bar fills with what is left, to the nearest cell', () => {
  expect(filledCells(used(38), 10)).toBe(6)
  expect(filledCells(used(0), 10)).toBe(10)
  expect(filledCells(used(100), 10)).toBe(0)
  expect(filledCells(used(150), 10)).toBe(0)
})

test('reset clock is local time, with the weekday when not today', () => {
  const now = new Date(2026, 9, 7, 13, 55) // Wed 1:55 PM local
  expect(formatClock(new Date(2026, 9, 7, 14, 30), now)).toBe('2:30 PM')
  expect(formatClock(new Date(2026, 9, 7, 0, 5), now)).toBe('12:05 AM')
  expect(formatClock(new Date(2026, 9, 8, 3, 50), now)).toBe('Thu 3:50 AM')
})

test('reports remaining and reset', () => {
  expect(percentLeft(FIVE)).toBe(76.5)
  expect(countdown(FIVE, Date.parse('2026-10-07T12:00:00Z'))).toBe('2h 30m')
})

test('slim shows the 5-hour window, full shows all', () => {
  expect(visibleLimits([SEVEN, FIVE], 'slim')).toEqual([FIVE])
  expect(visibleLimits([SEVEN], 'slim')).toEqual([SEVEN])
  expect(visibleLimits([SEVEN, FIVE], 'full')).toEqual([SEVEN, FIVE])
})
