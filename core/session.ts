import {
  unstable_v2_createSession,
  type SDKSession,
} from "@anthropic-ai/claude-agent-sdk";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type DMChannel,
} from "discord.js";
import { DEFAULT_MODEL, WORK_DIR, userStates, type Mode, type UserState } from "./types.js";
import { startStreamReader } from "./stream.js";

function buildSessionOptions(userId: string, mode: Mode, model: string) {
  const base = {
    model,
    cwd: WORK_DIR,
  } as const;

  switch (mode) {
    case "plan":
      return { ...base, permissionMode: "plan" as const };
    case "autoEdit":
      // 使用自訂 canUseTool 來自動批准所有工具
      return {
        ...base,
        permissionMode: "default" as const,
        canUseTool: createAutoApproveTool(userId),
      };
    case "editAsk":
      return {
        ...base,
        permissionMode: "default" as const,
        canUseTool: createCanUseTool(userId),
      };
  }
}

function createAutoApproveTool(userId: string) {
  return async (
    toolName: string,
    input: Record<string, unknown>,
    options: { signal: AbortSignal; toolUseID: string }
  ) => {
    console.log(`[AutoEdit ${userId}] Auto-approving tool: ${toolName}`);
    return { behavior: "allow" as const };
  };
}

function createCanUseTool(userId: string) {
  return async (
    toolName: string,
    input: Record<string, unknown>,
    options: { signal: AbortSignal; toolUseID: string }
  ) => {
    const state = userStates.get(userId);
    if (!state) return { behavior: "deny" as const, message: "No active session" };

    const summary = Object.entries(input)
      .map(([k, v]) => {
        const val = typeof v === "string" ? v : JSON.stringify(v);
        return `**${k}:** ${val.length > 200 ? val.slice(0, 200) + "..." : val}`;
      })
      .join("\n");

    const embed = new EmbedBuilder()
      .setTitle("Tool Permission Request")
      .setDescription(`**Tool:** \`${toolName}\`\n\n${summary}`)
      .setColor(0xf59e0b);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`tool_allow_${options.toolUseID}`)
        .setLabel("Allow")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`tool_deny_${options.toolUseID}`)
        .setLabel("Deny")
        .setStyle(ButtonStyle.Danger)
    );

    const msg = await state.dmChannel.send({
      embeds: [embed],
      components: [row],
    });

    try {
      const interaction = await msg.awaitMessageComponent({
        filter: (i: { user: { id: string } }) => i.user.id === userId,
        time: 60_000,
      });
      await interaction.update({ components: [] });

      if (interaction.customId.startsWith("tool_allow_")) {
        return { behavior: "allow" as const };
      }
      return { behavior: "deny" as const, message: "User denied the tool." };
    } catch {
      // Timeout — treat as deny
      await msg.edit({ components: [] });
      return { behavior: "deny" as const, message: "Permission request timed out." };
    }
  };
}

export async function getOrCreateSession(
  userId: string,
  channel: DMChannel
): Promise<UserState> {
  const existing = userStates.get(userId);
  if (existing) return existing;

  const model = DEFAULT_MODEL;
  const mode: Mode = "autoEdit";
  const options = buildSessionOptions(userId, mode, model);
  const session = unstable_v2_createSession(options);
  const streamAbort = new AbortController();

  const state: UserState = { session, model, mode, dmChannel: channel, streamAbort };
  userStates.set(userId, state);

  // Start background stream reader
  startStreamReader(userId, state);

  return state;
}

export function destroySession(userId: string) {
  const state = userStates.get(userId);
  if (!state) return;
  state.streamAbort.abort();
  state.session.close();
  userStates.delete(userId);
}

export async function recreateSession(userId: string, channel: DMChannel) {
  const old = userStates.get(userId);
  const model = old?.model ?? DEFAULT_MODEL;
  const mode = old?.mode ?? "autoEdit";

  destroySession(userId);

  const options = buildSessionOptions(userId, mode, model);
  const session = unstable_v2_createSession(options);
  const streamAbort = new AbortController();

  const state: UserState = { session, model, mode, dmChannel: channel, streamAbort };
  userStates.set(userId, state);
  startStreamReader(userId, state);

  return state;
}
