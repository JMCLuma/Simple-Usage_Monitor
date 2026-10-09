import type { RenderPropsOf } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 11 },
    view: {},
  } as unknown as RenderPropsOf['AbovePrompt'],
} as const

const LIMITS = [
  { kind: 'five_hour', percentUsed: 38, resetsAt: '2026-10-07T21:30:00Z' },
  { kind: 'seven_day', percentUsed: 35, resetsAt: '2026-10-08T08:50:00Z' },
]

test('band draws both windows in full and one in slim, on terminal and desktop', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-07T20:55:00Z') })
  mock.store(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  // The engine's measurement, as a session raises it after a turn.
  await $.session.measure({ context: {}, rateLimits: LIMITS, changed: ['rateLimits'] } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-meter', surface, ...BAND })
    expect(await ui.find({ text: /62% left/ })).toBeDefined()
    expect(await ui.find({ text: /% used/ })).toBeUndefined()
    expect(await ui.find({ text: /65% left/ })).toBeDefined()
    expect(await ui.find({ text: /35m/ })).toBeDefined()
    expect(await ui.find({ text: /…/ })).toBeUndefined()
    await ui.press({ key: 'slim' })
    expect(await ui.find({ text: /65% left/ })).toBeUndefined()
    expect(await ui.find({ text: /62% left/ })).toBeDefined()
    await ui.press({ key: 'full' })
    expect(await ui.find({ text: /65% left/ })).toBeDefined()
    await ui.unmount()
  }
})
