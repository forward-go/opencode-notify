/**
 * opencode-notify — Desktop notification plugin for OpenCode
 *
 * Platform support:
 *   WSL     → configurable: auto (default) / msg / balloon / both
 *   Linux   → notify-send → dbus-send
 *   macOS   → osascript
 *   Windows → configurable: auto (default) / msg / balloon / both
 *
 * Configure in opencode.json:
 *   { "plugin": [["opencode-notify", { "method": "msg" }]] }
 */

import type { Plugin } from "@opencode-ai/plugin"
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
type WindowsMethod = "auto" | "msg" | "balloon" | "both"

function parseWindowsMethod(value: unknown): WindowsMethod {
  if (value === "msg" || value === "balloon" || value === "both") return value
  return "auto"
}

// Priority: plugin options → .opencode/notify.json → ~/.config/opencode/notify.json → "auto"
function resolveWindowsMethod(options?: { method?: unknown }, platform?: Platform): WindowsMethod {
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

function detectPlatform(): Platform {
  if (isWSL()) return "wsl"
  switch (process.platform) {
    case "linux": return "linux"
    case "darwin": return "macos"
    case "win32": return "windows"
    default: return "other"
  }
}

interface NotifyOptions {
  title: string
  body: string
  urgency?: "low" | "normal" | "critical"
}

async function notify(
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
          await sendBalloon(shell, title, body)
        } catch {
          await sendMsg(shell, title, body).catch(() => {})
        }
    }
  } catch {
    // all methods failed — give up silently
  }
}

// ── Plugin entry ────────────────────────────────────────────────────────────

type PluginInput = Parameters<Plugin>[0]
type Client = PluginInput["client"]

async function getSessionTitle(client: Client, sessionID?: string): Promise<string | undefined> {
  if (!sessionID) return undefined
  try {
    const res = await client.session.get({ path: { id: sessionID } })
    if (res.data) {
      return res.data.title
    }
  } catch {
    // ignore — title is optional
  }
  return undefined
}

export const NotifyPlugin: Plugin = async (ctx, options) => {
  const { $, client } = ctx
  const platform = detectPlatform()
  const windowsMethod = resolveWindowsMethod(options as { method?: unknown } | undefined, platform)

  return {
    // Intentionally don't modify output.status — preserving the default "ask"
    "permission.ask": async (input) => {
      const sessionTitle = await getSessionTitle(client, input.sessionID)
      const body = sessionTitle
        ? `「${sessionTitle}」${input.title || `操作「${input.type}」需要许可`}`
        : input.title || `操作「${input.type}」需要您的许可`
      await notify($, platform, {
        title: "OpenCode ⚠️ 需要审批",
        body,
        urgency: "critical",
      }, windowsMethod)
    },

    event: async ({ event }) => {
      switch (event.type) {
        case "session.idle": {
          const props = event.properties as { sessionID?: string }
          const sessionTitle = await getSessionTitle(client, props.sessionID)
          await notify($, platform, {
            title: "OpenCode ✅ 任务完成",
            body: sessionTitle ? `「${sessionTitle}」AI 已完成响应` : "AI 已完成响应，请查看结果",
            urgency: "normal",
          }, windowsMethod)
          break
        }

        case "session.error": {
          const props = event.properties as { sessionID?: string }
          const sessionTitle = await getSessionTitle(client, props.sessionID)
          await notify($, platform, {
            title: "OpenCode ❌ 发生错误",
            body: sessionTitle ? `「${sessionTitle}」会话遇到错误` : "会话遇到错误，请检查详情",
            urgency: "critical",
          }, windowsMethod)
          break
        }
      }
    },
  }
}

export default NotifyPlugin
