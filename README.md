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
| **WSL2** | `powershell.exe` WinRT Toast | Nothing extra |
| **Windows** (CMD / PowerShell / Git Bash) | PowerShell WinRT Toast | Nothing extra |
| **Linux** | `notify-send` → `dbus-send` fallback | `libnotify-bin` (or any D-Bus notification daemon) |
| **macOS** | `osascript` | Built-in |

WSL is auto-detected via `/proc/version`. Git Bash (MSYS2/MINGW) is auto-detected via `uname`. No manual configuration needed.

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

You should see a test toast notification pop up.

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

Copy [`src/index.ts`](src/index.ts) and [`src/notify.ts`](src/notify.ts) to your plugins directory:

```bash
# Global (all projects)
cp src/*.ts ~/.config/opencode/plugins/

# Project-level
cp src/*.ts .opencode/plugins/
```

> **Tip:** For local installs you can also use the bundled single-file version — see [`opencode-notify.ts`](opencode-notify.ts).

## How It Works

The plugin hooks into three OpenCode events:

| Hook / Event | Trigger | Notification |
|---|---|---|
| `session.idle` | AI finishes its turn | ✅ Task complete |
| `permission.ask` | Tool requests user approval | ⚠️ Approval needed |
| `session.error` | Session encounters an error | ❌ Error occurred |

Each notification includes the session title (queried via the OpenCode SDK) so you know which task the notification is about.

### WSL / Windows Technical Details

On WSL and native Windows, the plugin:

1. Builds a PowerShell script using the WinRT Toast API
2. Encodes it as UTF-16LE Base64 (PowerShell's `-EncodedCommand` format)
3. Executes via `powershell.exe`

This approach avoids all shell quoting/escaping issues between bash and PowerShell. All shell output is suppressed with `.quiet()` to prevent polluting the OpenCode TUI.

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
