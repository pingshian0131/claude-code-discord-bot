import type { SDKAssistantMessage } from "@anthropic-ai/claude-agent-sdk";
import { userStates } from "./types.js";
import { extractText, sendLongMessage } from "../utils/message.js";
import { notifyWorkspaceInfo } from "../utils/git.js";
import type { UserState } from "./types.js";

export async function startStreamReader(userId: string, state: UserState) {
  console.log(`[Stream ${userId}] Stream reader started`);

  // 持續運行直到被明確中止
  while (!state.streamAbort.signal.aborted) {
    try {
      console.log(`[Stream ${userId}] Starting new stream iteration`);
      for await (const msg of state.session.stream()) {
        if (state.streamAbort.signal.aborted) {
          console.log(`[Stream ${userId}] Stream aborted by signal`);
          break;
        }

        // Debug: 記錄所有收到的訊息類型
        console.log(`[Stream ${userId}] Received message type: ${msg.type}`);

      // 處理 system init 訊息 - 通知工作資訊（只在第一次顯示）
      if (msg.type === "system" && (msg as any).subtype === "init") {
        const cwd = (msg as any).cwd;
        if (cwd && !state.workspaceInfoShown) {
          console.log(`[Stream ${userId}] Showing workspace info for the first time`);
          state.workspaceInfoShown = true;
          // 非同步執行,不阻塞後續訊息處理
          notifyWorkspaceInfo(state.dmChannel, cwd).catch(err => {
            console.error(`Failed to notify workspace info for user ${userId}:`, err);
          });
        }
      }

      if (msg.type === "assistant") {
        const text = extractText(msg as SDKAssistantMessage);
        console.log(`[Stream ${userId}] Assistant text length: ${text?.length || 0}`);
        if (text) {
          await sendLongMessage(state.dmChannel, text);
        }
      } else if (msg.type === "user") {
        // 處理 SDK 回傳的 user 訊息（通常是 tool_result）
        const message = (msg as any).message;
        if (message?.content) {
          for (const item of message.content) {
            if (item.type === "tool_result" && item.is_error) {
              console.log(`[Stream ${userId}] Tool error: ${item.content}`);
              await sendLongMessage(
                state.dmChannel,
                `⚠️ **工具執行失敗**\n${item.content}\n\n提示：如果你在 Auto-Edit 模式，請切換到 Edit & Ask 模式來批准工具執行。`
              );
            }
          }
        }
      } else if (msg.type === "result") {
        console.log(`[Stream ${userId}] Result - is_error: ${"is_error" in msg && msg.is_error}`);
        if ("is_error" in msg && msg.is_error) {
          // 處理錯誤結果
          const errText =
            "result" in msg && typeof msg.result === "string"
              ? msg.result
              : "An error occurred.";
          await sendLongMessage(state.dmChannel, `**Error:** ${errText}`);
        } else if ("result" in msg && msg.result) {
          // 處理成功結果
          const resultContent =
            typeof msg.result === "string"
              ? msg.result
              : JSON.stringify(msg.result, null, 2);

          console.log(`[Stream ${userId}] Success result length: ${resultContent.length}`);
          // 只有在結果內容有實質內容時才發送
          if (resultContent.trim()) {
            // 使用程式碼區塊格式化輸出，提升可讀性
            const formattedResult = `\`\`\`\n${resultContent}\n\`\`\``;
            await sendLongMessage(state.dmChannel, formattedResult);
          }
        }
      } else {
        // 記錄未處理的訊息類型
        console.log(`[Stream ${userId}] Unhandled message type: ${msg.type}`, JSON.stringify(msg).slice(0, 200));
        }
      }
      console.log(`[Stream ${userId}] Stream iteration ended normally, waiting for next message...`);

      // 短暫延遲後繼續下一輪
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (err) {
      console.error(`[Stream ${userId}] Stream error:`, err);
      if (!state.streamAbort.signal.aborted) {
        console.error(`Stream error for user ${userId}:`, err);
        try {
          await state.dmChannel.send("Session ended unexpectedly. Use /reset to start a new one.");
        } catch {}
        userStates.delete(userId);
        break; // 出錯時退出循環
      }
    }
  }

  console.log(`[Stream ${userId}] Stream reader exited`);
}
