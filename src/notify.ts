/**
 * Cross-platform desktop notification sender.
 *
 * - Linux:   `notify-send` (libnotify), fallback `dbus-send`
 * - WSL:     configurable: `auto` (default) / `msg` / `balloon` / `both`
 * - macOS:   `osascript` (display notification)
 * - Windows: configurable: `auto` (default) / `msg` / `balloon` / `both`
 *
 * Each method is wrapped in try/catch so a notification failure
 * never crashes the host process.
 */

import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"

type ShellExpression = string | { toString(): string } | { raw: string } | ReadableStream | ShellExpression[]

interface ShellPromise extends Promise<unknown> {
  quiet(): this
}

interface Shell {
  (strings: TemplateStringsArray, ...expressions: ShellExpression[]): ShellPromise
}

type Platform = "linux" | "wsl" | "macos" | "windows" | "other"

export type WindowsMethod = "auto" | "msg" | "balloon" | "both"

export function parseWindowsMethod(value: unknown): WindowsMethod {
  if (value === "msg" || value === "balloon" || value === "both") return value
  return "auto"
}

// Priority: plugin options → .opencode/notify.json → ~/.config/opencode/notify.json → "auto"
// WSL is excluded from config: msg.exe in WSL interop is unreliable, so WSL
// always uses "auto" (msg.exe → BalloonTip fallback) for maximum compatibility.
export function resolveWindowsMethod(options?: { method?: unknown }, platform?: Platform): WindowsMethod {
  if (platform === "wsl") return "auto"

  if (options?.method) return parseWindowsMethod(options.method)

  const home = process.env.HOME || process.env.USERPROFILE || ""
  for (const p of [".opencode/notify.json", `${home}/.config/opencode/notify.json`]) {
    try {
      const config = JSON.parse(readFileSync(p, "utf-8"))
      if (config.method) return parseWindowsMethod(config.method)
    } catch {
      // file not found or invalid — try next
    }
  }
  return "auto"
}

function isWSL(): boolean {
  try {
    return /microsoft/i.test(readFileSync("/proc/version", "utf-8"))
  } catch {
    return false
  }
}

export function detectPlatform(): Platform {
  if (isWSL()) return "wsl"
  switch (process.platform) {
    case "linux": return "linux"
    case "darwin": return "macos"
    case "win32": return "windows"
    default: return "other"
  }
}

export interface NotifyOptions {
  title: string
  body: string
  urgency?: "low" | "normal" | "critical"
}

export async function notify(
  shell: Shell,
  platform: Platform,
  opts: NotifyOptions,
  windowsMethod: WindowsMethod = "auto",
): Promise<void> {
  const { title, body } = opts
  const urgency = opts.urgency ?? "normal"

  try {
    switch (platform) {
      case "linux":
        try {
          await shell`notify-send --app-name=opencode --urgency=${urgency} --icon=dialog-information ${title} ${body}`.quiet()
        } catch {
          await shell`dbus-send --session --dest=org.freedesktop.Notifications --type=method_call /org/freedesktop/Notifications org.freedesktop.Notifications.Notify string:opencode uint32:0 string:dialog-information string:${title} string:${body} array:string: dict:string:string: int32:5000`.quiet()
        }
        break

      case "wsl":
      case "windows":
        await notifyWindows(shell, title, body, windowsMethod)
        break

      case "macos": {
        const escTitle = title.replace(/"/g, '\\"')
        const escBody = body.replace(/"/g, '\\"')
        await shell`osascript -e ${`display notification "${escBody}" with title "${escTitle}"`}`.quiet()
        break
      }

      default:
        console.log(`[opencode-notify] ${title}: ${body}`)
    }
  } catch {
    // Silently ignore — never crash the host
  }
}

// ── Windows / WSL ───────────────────────────────────────────────────────────

function buildEncodedBalloon(title: string, body: string): string {
  const psTitle = title.replace(/'/g, "''")
  const psBody = body.replace(/'/g, "''")
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$ni = New-Object System.Windows.Forms.NotifyIcon",
    "$ni.Icon = [System.Drawing.SystemIcons]::Information",
    "$ni.Visible = $true",
    `$ni.ShowBalloonTip(10000, '${psTitle}', '${psBody}', [System.Windows.Forms.ToolTipIcon]::Info)`,
    "Start-Sleep -Milliseconds 1500",
    "$ni.Dispose()",
  ].join("; ")
  return Buffer.from(script, "utf16le").toString("base64")
}

async function sendBalloon(shell: Shell, title: string, body: string): Promise<void> {
  const encoded = buildEncodedBalloon(title, body)
  for (const ps of ["powershell.exe", "pwsh.exe"] as const) {
    try {
      await shell`${ps} -NoProfile -EncodedCommand ${encoded}`.quiet()
      return
    } catch {
      // try next
    }
  }
  throw new Error("BalloonTip failed")
}

// Bun shell mangles msg.exe arguments (wildcard *, unicode) causing "Invalid
// parameter(s)". Use child_process which passes args as an array — no shell.
async function sendMsg(shell: Shell, title: string, body: string): Promise<void> {
  const message = `${title}: ${body}`
  execFileSync("msg.exe", ["*", "/TIME:10", message], { stdio: "ignore", windowsHide: true })
}

// "auto" tries msg.exe first (reliable exit code), then BalloonTip fallback.
// msg.exe exits non-zero on real failure; BalloonTip always exits 0 even when
// no toast appears — so only msg.exe can anchor a working auto-fallback chain.
async function notifyWindows(
  shell: Shell,
  title: string,
  body: string,
  method: WindowsMethod,
): Promise<void> {
  try {
    switch (method) {
      case "balloon":
        await sendBalloon(shell, title, body)
        break
      case "msg":
        await sendMsg(shell, title, body)
        break
      case "both":
        await sendBalloon(shell, title, body).catch(() => {})
        await sendMsg(shell, title, body)
        break
      default:
        try {
          await sendMsg(shell, title, body)
        } catch {
          await sendBalloon(shell, title, body).catch(() => {})
        }
    }
  } catch {
    // all methods failed — give up silently
  }
}
