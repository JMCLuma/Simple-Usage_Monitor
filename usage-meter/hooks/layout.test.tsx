import type { RenderPropsOf } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { MIN_COLUMNS, planRow } from './format'

// QA: draw the band over a grid of widths, views, surfaces and data, and measure what
// was drawn. No row may need more cells than the band has, and no fixed-width column
// (the bar, a number, a reset time) may hold more than its width.

const NOW = Date.parse('2026-10-07T20:55:00Z')
const hours = (h: number) => new Date(NOW + h * 3_600_000).toISOString()

const DATA = {
  typical: [
    { kind: 'five_hour', percentUsed: 38, resetsAt: hours(0.6) },
    { kind: 'seven_day', percentUsed: 35, resetsAt: hours(13.9) },
  ],
  extremes: [
    { kind: 'five_hour', percentUsed: 0, resetsAt: hours(4.99) },
    { kind: 'seven_day', percentUsed: 100, resetsAt: hours(6 * 24 + 23.9) },
    { kind: 'spend_limit', percentUsed: 120 },
    { kind: 'some_new_window_kind', percentUsed: 99.9, resetsAt: hours(-1) },
  ],
  single: [{ kind: 'seven_day', percentUsed: 76, resetsAt: hours(30) }],
  // Over pace on both, so each fill draws a band warmer.
  pace: [
    { kind: 'five_hour', percentUsed: 60, resetsAt: hours(2.5) },
    { kind: 'seven_day', percentUsed: 20, resetsAt: hours(24) },
  ],
}

const WIDTHS = [25, 30, 39, 40, 52, 60, 70, 80, 100, 140, 220]

type El = { type: string; props: Record<string, unknown>; children?: unknown[] }

const kids = (el: El): unknown[] =>
  ((el.children ?? (el.props.children as unknown[] | undefined) ?? []) as unknown[])
    .flat(Infinity)
    .filter(c => c !== null && c !== undefined && c !== false && c !== '')

/** The cells a node's content needs, recording every fixed-width box it overflows. */
function measure(node: unknown, faults: string[]): number {
  if (typeof node === 'string' || typeof node === 'number') return [...String(node)].length
  const el = node as El
  if (el.type === 'Button') {
    const { hotkey, label } = el.props as { hotkey?: string; label?: string }
    return [...(hotkey ? `${hotkey}: ${label ?? ''}` : (label ?? ''))].length
  }
  const children = kids(el)
  if (el.type === 'Text') return children.reduce<number>((n, c) => n + measure(c, faults), 0)
  const widths = children.map(c => measure(c, faults))
  const gap = Number(el.props.gap ?? 0)
  const content =
    el.props.flexDirection === 'column'
      ? Math.max(0, ...widths)
      : widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, widths.length - 1)
  const fixed = el.props.width
  if (typeof fixed === 'number') {
    if (content > fixed) faults.push(`${content} cells in a box ${fixed} wide: ${JSON.stringify(el).slice(0, 160)}`)
    return fixed
  }
  return content
}

/** Every row of the band: the root's children when it is a column, else the root. */
const rowsOf = (root: El): unknown[] => (root.props.flexDirection === 'column' ? kids(root) : [root])

const BAND = (bodyColumns: number) => ({
  component: 'AbovePrompt' as const,
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns,
    scroll: { offset: 0, bodyRows: 11 },
    view: {},
  } as unknown as RenderPropsOf['AbovePrompt'],
})

for (const [name, limits] of Object.entries(DATA)) {
  test(`layout fits every width: ${name}`, async ($, on) => {
    mock.clock(on, { now: NOW })
    mock.store(on)
    on('session.measure', ($, e) => ({ changed: e.changed }))
    await $.session.measure({ context: {}, rateLimits: limits, changed: ['rateLimits'] } as never)

    const faults: string[] = []
    for (const surface of ['terminal', 'desktop'] as const) {
      for (const columns of WIDTHS) {
        const ui = await $.ui.mount({ plugin: 'usage-meter', surface, ...BAND(columns) })
        for (const view of ['full', 'slim'] as const) {
          // Both buttons are only drawn where there is room for them; the command always works.
          await $.command.run({ command: 'usage-meter', args: view, origin: { kind: 'composer' } } as never)
          const root = (await ui.drawn()) as unknown as El
          const where = `${surface} ${columns} cols ${view}`
          if (columns < MIN_COLUMNS[view]) continue
          for (const row of rowsOf(root).map(r => (r as El).type === 'Box' ? (r as El) : null)) {
            if (!row) continue
            // The root box is the band's own width; what matters is what its rows need.
            const need =
              row === root ? kids(row).map(c => measure(c, faults)).reduce((a, b) => a + b, 0) + 1 : measure(row, faults)
            if (need > columns) faults.push(`${where}: a row needs ${need} cells`)
          }
          expect(await ui.find({ text: /…/ })).toBeUndefined()
          // The 7-day window at 100% reads "limit reached" wherever its bar is wide enough.
          if (name === 'extremes' && view === 'full' && planRow(columns, view).bar >= 13) {
            expect(await ui.find({ text: /limit reached/ })).toBeDefined()
          }
        }
        await ui.unmount()
      }
    }
    expect(faults).toEqual([])
  })
}

test('planner keeps the bar between its minimum and maximum at every width', () => {
  for (const view of ['full', 'slim'] as const) {
    for (let columns = MIN_COLUMNS[view]; columns <= 300; columns++) {
      const plan = planRow(columns, view)
      expect(plan.bar).toBeLessThanOrEqual(view === 'full' ? 32 : 20)
      expect(plan.bar === 0 || plan.bar >= 8).toBe(true)
    }
    // Wide enough, everything shows.
    expect(planRow(200, view)).toMatchObject({ clock: true, controls: true })
  }
})
