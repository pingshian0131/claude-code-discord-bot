import type { SDKAssistantMessage } from "@anthropic-ai/claude-agent-sdk";
import { userStates } from "./types.js";
import { extractText, sendLongMessage } from "../utils/message.js";
import { notifyWorkspaceInfo } from "../utils/git.js";
import type { UserState } from "./types.js";

export async function startStreamReader(userId: string, state: UserState) {
  try {
    for await (const msg of state.session.stream()) {
      if (state.streamAbort.signal.aborted) break;

      // 處理 system init 訊息 - 通知工作資訊
      if (msg.type === "system" && (msg as any).subtype === "init") {
        const cwd = (msg as any).cwd;
        if (cwd) {
          // 非同步執行,不阻塞後續訊息處理
          notifyWorkspaceInfo(state.dmChannel, cwd).catch(err => {
            console.error(`Failed to notify workspace info for user ${userId}:`, err);
          });
        }
      }

      if (msg.type === "assistant") {
        const text = extractText(msg as SDKAssistantMessage);
        if (text) {
          await sendLongMessage(state.dmChannel, text);
        }
      } else if (msg.type === "result") {
        if ("is_error" in msg && msg.is_error) {
          const errText =
            "result" in msg && typeof msg.result === "string"
              ? msg.result
              : "An error occurred.";
          await sendLongMessage(state.dmChannel, `**Error:** ${errText}`);
        }
      }
    }
  } catch (err) {
    if (!state.streamAbort.signal.aborted) {
      console.error(`Stream error for user ${userId}:`, err);
      try {
        await state.dmChannel.send("Session ended unexpectedly. Use /reset to start a new one.");
      } catch {}
      userStates.delete(userId);
    }
  }
}
