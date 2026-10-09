export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Mode = 'slim' | 'full'

declare module 'claude-code' {
  interface PluginState {
    'usage-meter': { limits: Limit[]; now: number; isHidden: boolean; mode: Mode }
  }
}
