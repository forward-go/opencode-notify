/**
 * Cross-platform desktop notification sender.
 *
 * - Linux:   `notify-send` (libnotify), fallback `dbus-send`
 * - WSL:     `powershell.exe` → `pwsh.exe` → `mshta.exe`
 * - macOS:   `osascript` (display notification)
 * - Windows: `powershell.exe` → `pwsh.exe` → `mshta.exe`
 *
 * Each method is wrapped in try/catch so a notification failure
 * never crashes the host process.
 */

import { readFileSync } from "node:fs"

type ShellExpression = string | { toString(): string } | { raw: string } | ReadableStream | ShellExpression[]

interface ShellPromise extends Promise<unknown> {
  quiet(): this
}

interface Shell {
  (strings: TemplateStringsArray, ...expressions: ShellExpression[]): ShellPromise
}

type Platform = "linux" | "wsl" | "macos" | "windows" | "other"

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
        await notifyWindows(shell, title, body)
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

async function notifyLinuxDBus(shell: Shell, title: string, body: string): Promise<void> {
  await shell`dbus-send --session --dest=org.freedesktop.Notifications --type=method_call /org/freedesktop/Notifications org.freedesktop.Notifications.Notify string:opencode uint32:0 string:dialog-information string:${title} string:${body} array:string: dict:string:string: int32:5000`.quiet()
}

// ── Windows / WSL ───────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function buildEncodedToast(title: string, body: string): string {
  const xml = `<toast><visual><binding template="ToastText02"><text id="1">${escapeXml(title)}</text><text id="2">${escapeXml(body)}</text></binding></visual></toast>`
  const script = [
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null",
    "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null",
    "$doc = New-Object Windows.Data.Xml.Dom.XmlDocument",
    `$doc.LoadXml('${xml.replace(/'/g, "''")}')`,
    "$toast = New-Object Windows.UI.Notifications.ToastNotification $doc",
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Windows.SystemToast.PowerShell').Show($toast)",
  ].join("; ")
  return Buffer.from(script, "utf16le").toString("base64")
}

async function notifyWindows(shell: Shell, title: string, body: string): Promise<void> {
  const encoded = buildEncodedToast(title, body)

  // powershell.exe (5.1) → pwsh.exe (7+): same WinRT toast API
  for (const ps of ["powershell.exe", "pwsh.exe"] as const) {
    try {
      await shell`${ps} -NoProfile -EncodedCommand ${encoded}`.quiet()
      return
    } catch {
      // try next PowerShell or fall through to mshta
    }
  }

  // Last resort: mshta.exe popup — no PowerShell needed, auto-dismiss in 10s
  const safe = (s: string) => s.replace(/'/g, "\\'").replace(/\n/g, " ")
  const js = `new ActiveXObject('WScript.Shell').Popup('${safe(body)}',10,'OpenCode: ${safe(title)}',64);close()`
  await shell`mshta.exe javascript:${js}`.quiet()
}
