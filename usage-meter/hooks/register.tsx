import { atom, read, update } from 'claude-code'
import type { Register, RenderNode } from 'claude-code'

import type { Limit, Mode } from '../types'
import {
  COL,
  CRIMSON,
  SLIM_LEAD,
  WARN_AT,
  barSegments,
  countdown,
  isLimitReached,
  label,
  levelColor,
  percentLeft,
  planRow,
  resetClock,
  shortLabel,
  visibleLimits,
} from './format'

const limits = atom({ plugin: 'usage-meter', key: 'limits' } as const, [] as Limit[])
const now = atom({ plugin: 'usage-meter', key: 'now' } as const, 0)
const isHidden = atom({ plugin: 'usage-meter', key: 'isHidden' } as const, false)
const mode = atom({ plugin: 'usage-meter', key: 'mode' } as const, 'full' as Mode)

// The view survives across sessions in the plugin's store.
const MODE_KEY = 'mode'
// The latest limits and when they were read. The store is a file on disk, so a monitor
// outside Claude Code (the ClaudeBar taskbar strip) can show them.
const SNAPSHOT_KEY = 'limits'
// The empty track, in the theme's own muted color so it suits light and dark.
const TRACK = 'subtle'
const REACHED = 'limit reached'

const isMode = (v: unknown): v is Mode => v === 'slim' || v === 'full'

export const register: Register = on => {
  // `${kind}:${resetsAt}:${threshold}` already toasted, so each window warns once per cycle
  const warned = new Set<string>()

  on('session.start', async ($, e, next) => {
    const usage = await $.session.usage()
    const t = await $.clock.now()
    const saved = await $.store.get(MODE_KEY)
    await update($, limits, () => usage.rateLimits)
    await update($, now, () => t)
    if (isMode(saved)) await update($, mode, () => saved)
    await $.store.set(SNAPSHOT_KEY, { at: t, limits: usage.rateLimits })
    await $.command.register({
      name: 'usage-meter',
      description: 'Show the usage bars; add "slim" or "full" to switch views',
    })
    // Tick the countdowns each minute between API responses.
    $.clock.every(60_000, async () => {
      const tick = await $.clock.now()
      await update($, now, () => tick)
    })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const t = await $.clock.now()
    await update($, limits, () => e.rateLimits)
    await update($, now, () => t)
    await $.store.set(SNAPSHOT_KEY, { at: t, limits: e.rateLimits })
    for (const l of e.rateLimits) {
      for (const threshold of WARN_AT) {
        const key = `${l.kind}:${l.resetsAt ?? ''}:${threshold}`
        if (l.percentUsed >= threshold && !warned.has(key)) {
          warned.add(key)
          $.ui.toast(`${label(l.kind)} usage is at ${l.percentUsed}%`)
        }
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const all = await read($, limits)
    if (e.props.hasSurvey || all.length === 0 || (await read($, isHidden))) {
      return next(e)
    }

    const t = await read($, now)
    const view = await read($, mode)
    const rows = visibleLimits(all, view)
    const { Box, Button, Text } = $.ui.resolve(e)

    const setMode = async (m: Mode) => {
      await update($, mode, () => m)
      await $.store.set(MODE_KEY, m)
    }

    // Painted boxes of exact widths: the fill on the track. No glyphs, so no font can
    // widen it past its column.
    const bar = (l: Limit, width: number) => {
      if (width <= 0) return null
      if (isLimitReached(l)) {
        return (
          <Box width={width} height={1} overflow="hidden" justifyContent="center" backgroundColor={TRACK}>
            {width >= REACHED.length ? (
              <Text color={CRIMSON} bold>
                {REACHED}
              </Text>
            ) : null}
          </Box>
        )
      }
      return (
        <Box width={width} height={1} overflow="hidden">
          {barSegments(l, width, t, TRACK).map(s => (
            <Box width={s.cells} height={1} backgroundColor={s.color}>
              <Text>{' '.repeat(s.cells)}</Text>
            </Box>
          ))}
        </Box>
      )
    }

    // A right-aligned column of fixed width.
    const col = (width: number, child: RenderNode) => (
      <Box width={width} justifyContent="flex-end">
        {child}
      </Box>
    )

    const leftCol = (l: Limit) =>
      col(
        COL.left,
        <Text color={levelColor(l, t)} bold>
          {Math.round(percentLeft(l))}% left
        </Text>,
      )

    // The reset columns are always laid out, blank when a window has no reset, so rows align.
    const clockCol = (l: Limit) => {
      const clock = resetClock(l, t)
      return col(COL.clock, clock ? <Text dimColor>↻ {clock}</Text> : null)
    }
    const countCol = (l: Limit) => col(COL.count, <Text>{countdown(l, t)}</Text>)

    const controls = (
      <Box gap={1}>
        {view === 'full' ? (
          <Button key="slim" hotkey="s" label="slim" plain dimColor onPress={() => setMode('slim')} />
        ) : (
          <Button key="full" hotkey="f" label="full" plain dimColor onPress={() => setMode('full')} />
        )}
        <Button key="hide" hotkey="h" label="hide" plain dimColor onPress={() => update($, isHidden, () => true)} />
      </Box>
    )

    const columns = e.props.bodyColumns
    const plan = planRow(columns, view)

    if (view === 'slim') {
      const l = rows[0]!
      return (
        <Box width={columns} overflow="hidden" justifyContent="space-between">
          <Box gap={1}>
            <Box width={SLIM_LEAD - 1} gap={1}>
              <Text color="claude">◆</Text>
              <Text bold>{shortLabel(l.kind)}</Text>
            </Box>
            {bar(l, plan.bar)}
            {leftCol(l)}
            {plan.clock ? clockCol(l) : null}
            {countCol(l)}
          </Box>
          {plan.controls ? controls : null}
        </Box>
      )
    }

    return (
      <Box width={columns} overflow="hidden" flexDirection="column">
        <Box justifyContent="space-between">
          <Box gap={1}>
            <Text color="claude">◆</Text>
            <Text bold>{columns >= 30 ? 'Claude usage' : 'Usage'}</Text>
          </Box>
          {controls}
        </Box>
        {rows.map(l => (
          <Box key={l.kind} gap={1}>
            <Box width={COL.label}>
              <Text dimColor>{label(l.kind)}</Text>
            </Box>
            {bar(l, plan.bar)}
            {leftCol(l)}
            {plan.clock ? clockCol(l) : null}
            {countCol(l)}
          </Box>
        ))}
      </Box>
    )
  })

  on('command.run', { command: 'usage-meter' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    await update($, isHidden, () => false)
    if (isMode(arg)) {
      await update($, mode, () => arg)
      await $.store.set(MODE_KEY, arg)
      return { text: `Usage bars shown, ${arg} view.` }
    }
    return { text: 'Usage bars shown above the prompt.' }
  })
}
