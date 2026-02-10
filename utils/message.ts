import type { DMChannel } from "discord.js";
import type { SDKAssistantMessage } from "@anthropic-ai/claude-agent-sdk";

export function extractText(msg: SDKAssistantMessage): string {
  if (!msg.message?.content) return "";
  const parts: string[] = [];
  for (const block of msg.message.content) {
    if ("text" in block && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("\n");
}

export function splitMessage(text: string, maxLen = 2000): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Try paragraph break
    let splitIdx = remaining.lastIndexOf("\n\n", maxLen);
    if (splitIdx <= 0) {
      // Try line break
      splitIdx = remaining.lastIndexOf("\n", maxLen);
    }
    if (splitIdx <= 0) {
      // Hard cut
      splitIdx = maxLen;
    }

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).replace(/^\n+/, "");
  }

  return chunks;
}

export async function sendLongMessage(channel: DMChannel, text: string) {
  const chunks = splitMessage(text);
  for (const chunk of chunks) {
    if (chunk.trim()) {
      await channel.send(chunk);
    }
  }
}
