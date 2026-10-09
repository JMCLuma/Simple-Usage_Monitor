# Simple Usage Monitor

A Claude Code plugin that shows how much of your Claude usage is left, and when it resets, in a small panel above the prompt.

```
◆ Claude usage                                       s: slim  h: hide
5-hour  ███████████████████▒▒▒▒▒▒▒▒▒▒▒▒▒   62% left    ↻ 4:30 PM      35m
7-day   █████████████████████▒▒▒▒▒▒▒▒▒▒▒   65% left  ↻ Thu 3:50 AM  13h 55m
```

- **One bar per limit** (5-hour and 7-day). The bar shows what is left and drains as you use Claude.
- **Colour by % left:** green 65–100, yellow 35–64, orange 10–34, red 5–9, deep red 0–4.
- **Pace-aware:** if you are using a limit faster than its time is passing, so you would run out before it resets, the colour moves one band warmer.
- **Reset time** in your local time, plus a countdown.
- **Slim view** shows the 5-hour limit on one line. The choice is remembered.
- **Pop-up warnings** at 80% and 90% used.

Works in Claude Code in the terminal and in the desktop app's Code tab, on a Pro or Max subscription (API-key sign-ins report no usage limits).

## Install

In Claude Code:

```
/plugin marketplace add JMCLuma/Simple-Usage_Monitor
```

```
/plugin install usage-meter@usage-mod
```

Then start a new session.

## Use

| Action | How |
| --- | --- |
| Switch to slim / full | Click **slim** / **full**, press `s` / `f` with the panel focused, or run `/usage-meter slim` / `/usage-meter full` |
| Hide | Click **hide** or press `h` |
| Show again | `/usage-meter` |

## Update

```
/plugin marketplace update usage-mod
```

```
/plugin update usage-meter@usage-mod
```

Then start a new session.

## Develop

The plugin lives in [`usage-meter/`](usage-meter). Check and test it with:

```
claude plugin validate usage-meter
```

```
claude plugin test usage-meter
```
