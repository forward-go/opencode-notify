# opencode-notify

Cross-platform desktop notification plugin for [OpenCode](https://opencode.ai).

Get notified when the AI finishes a task, when it needs your approval, or when something goes wrong — even if you've switched to another window.

## Features

- **Task completion** — notified when the AI finishes responding (`session.idle`)
- **Approval requests** — notified when a tool needs your permission (`permission.ask`)
- **Error alerts** — notified when a session encounters an error (`session.error`)
- **Session title** — notifications include the session title for context
- **Zero dependencies** — pure shell commands, no npm packages required at runtime

## Platform Support

| Platform | Method | Requirements |
|----------|--------|--------------|
| **WSL2** | `msg.exe` → BalloonTip fallback | Nothing extra |
| **Windows** (CMD / PowerShell) | Configurable (see below) | Nothing extra |
| **Linux** | `notify-send` → `dbus-send` fallback | `libnotify-bin` (or any D-Bus notification daemon) |
| **macOS** | `osascript` | Built-in |

WSL is auto-detected via `/proc/version`. No manual configuration needed.

## Verify Your Environment

Not sure if notifications work on your system? Run the test script:

**Linux / WSL / Git Bash:**

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/forward-go/opencode-notify/main/test-notify.sh)
```

**PowerShell / CMD:**

```powershell
irm https://raw.githubusercontent.com/forward-go/opencode-notify/main/test-notify.ps1 | iex
```

You should see a test notification pop up.

## Installation

### Option A: npm (recommended)

Add to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-notify"]
}
```

### Option B: Local file

Copy [`opencode-notify.ts`](opencode-notify.ts) (bundled single-file) to your plugins directory:

```bash
# Global (all projects)
cp opencode-notify.ts ~/.config/opencode/plugins/

# Project-level
cp opencode-notify.ts .opencode/plugins/
```

## Configuration (Windows / WSL)

The notification method is configurable on both native Windows and WSL.

### Via config file

Create `~/.config/opencode/notify.json` (global) or `.opencode/notify.json` (project-level):

```json
{
  "method": "balloon"
}
```

### Via plugin options (npm only)

```json
{
  "plugin": [["opencode-notify", { "method": "msg" }]]
}
```

### Method options

| `method` | Behavior | When to use |
|----------|----------|-------------|
| `auto` (default) | `msg.exe` first, BalloonTip fallback | Works out of the box on most systems |
| `balloon` | BalloonTip toast only | When you want toast notifications |
| `msg` | `msg.exe` dialog only | When toast/balloon is silently suppressed |
| `both` | BalloonTip then `msg.exe` | Guarantees at least one notification shows |

## How It Works

The plugin hooks into three OpenCode events:

| Hook / Event | Trigger | Notification |
|---|---|---|
| `session.idle` | AI finishes its turn | ✅ Task complete |
| `permission.ask` | Tool requests user approval | ⚠️ Approval needed |
| `session.error` | Session encounters an error | ❌ Error occurred |

Each notification includes the session title (queried via the OpenCode SDK) so you know which task the notification is about.

### Windows / WSL Technical Details

**BalloonTip** uses `NotifyIcon.ShowBalloonTip` via PowerShell (`System.Windows.Forms`), encoded as UTF-16LE Base64 for `-EncodedCommand`. Renders as a native toast on Windows 10+.

**msg.exe** uses `child_process.execFileSync` (not Bun shell) because Bun shell mangles `msg.exe` arguments — the `*` wildcard and Unicode characters cause `Invalid parameter(s)` errors. `execFileSync` passes args as an array, bypassing shell parsing entirely.

**Why `auto` tries msg.exe first?** BalloonTip always exits 0 even when no toast appears (suppressed by Focus Assist, disabled notifications, etc.), making auto-fallback impossible when placed first. msg.exe exits non-zero on real failure, so it can anchor a working fallback chain.

All shell output is suppressed with `.quiet()` / `stdio: "ignore"` to prevent polluting the OpenCode TUI.

## Development

```bash
npm install
npm run typecheck
```

## Project Structure

```
src/
├── index.ts          # Plugin entry — event hooks + session title lookup
└── notify.ts         # Cross-platform notification dispatcher
opencode-notify.ts    # Bundled single-file version (for local install)
test-notify.sh        # Environment test script (Linux / WSL / Git Bash)
test-notify.ps1       # Environment test script (PowerShell / CMD)
```

## License

MIT
