/**
 * opencode-notify — Desktop notification plugin for OpenCode
 *
 * Sends system notifications when:
 *   - session.idle     → AI finished responding
 *   - permission.ask   → tool needs approval
 *   - session.error    → session errored
 *
 * Platform support:
 *   WSL → powershell.exe WinRT Toast
 *   Linux → notify-send, fallback dbus-send
 *   macOS → osascript
 *   Windows → PowerShell WinRT Toast
 */

import type { Plugin } from "@opencode-ai/plugin"
import { readFileSync } from "node:fs"

// ── Shell type ──────────────────────────────────────────────────────────────

type ShellExpression = string | { toString(): string } | { raw: string } | ReadableStream | ShellExpression[]

interface ShellPromise extends Promise<unknown> {
  quiet(): this
}

interface Shell {
  (strings: TemplateStringsArray, ...expressions: ShellExpression[]): ShellPromise
}

// ── Platform detection ──────────────────────────────────────────────────────

type Platform = "linux" | "wsl" | "macos" | "windows" | "other"

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

// ── Notification dispatch ───────────────────────────────────────────────────

interface NotifyOptions {
  title: string
  body: string
  urgency?: "low" | "normal" | "critical"
}

async function notify(shell: Shell, platform: Platform, opts: NotifyOptions): Promise<void> {
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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function notifyWindows(shell: Shell, title: string, body: string): Promise<void> {
  const xml = `<toast><visual><binding template="ToastText02"><text id="1">${escapeXml(title)}</text><text id="2">${escapeXml(body)}</text></binding></visual></toast>`
  const script = [
    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null",
    "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null",
    "$doc = New-Object Windows.Data.Xml.Dom.XmlDocument",
    `$doc.LoadXml('${xml.replace(/'/g, "''")}')`,
    "$toast = New-Object Windows.UI.Notifications.ToastNotification $doc",
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Windows.SystemToast.PowerShell').Show($toast)",
  ].join("; ")
  const encoded = Buffer.from(script, "utf16le").toString("base64")
  return shell`powershell.exe -NoProfile -EncodedCommand ${encoded}`.quiet() as Promise<void>
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

export const NotifyPlugin: Plugin = async (ctx) => {
  const { $, client } = ctx
  const platform = detectPlatform()

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
      })
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
          })
          break
        }

        case "session.error": {
          const props = event.properties as { sessionID?: string }
          const sessionTitle = await getSessionTitle(client, props.sessionID)
          await notify($, platform, {
            title: "OpenCode ❌ 发生错误",
            body: sessionTitle ? `「${sessionTitle}」会话遇到错误` : "会话遇到错误，请检查详情",
            urgency: "critical",
          })
          break
        }
      }
    },
  }
}

export default NotifyPlugin
