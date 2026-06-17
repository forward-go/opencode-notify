/**
 * opencode-notify
 *
 * OpenCode plugin that sends desktop system notifications when:
 *   - A session becomes idle  → "AI has finished, take a look"
 *   - A permission is asked    → "Approval needed"
 *   - A session errors         → "Something went wrong"
 *
 * Usage (local):
 *   Copy this file (or the built output) to:
 *     .opencode/plugins/notify.ts        (project-level)
 *     ~/.config/opencode/plugins/notify.ts (global)
 *
 * Usage (npm):
 *   Add to opencode.json:
 *     { "plugin": ["opencode-notify"] }
 */

import type { Plugin } from "@opencode-ai/plugin"
import { detectPlatform, notify, resolveWindowsMethod } from "./notify.js"
import type { WindowsMethod } from "./notify.js"

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
  const windowsMethod: WindowsMethod = resolveWindowsMethod(options as { method?: unknown } | undefined, platform)

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
