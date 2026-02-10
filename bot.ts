import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  REST,
  Routes,
  type DMChannel,
  type Interaction,
  type Message,
} from "discord.js";
import {
  unstable_v2_createSession,
  type SDKSession,
  type SDKMessage,
  type SDKAssistantMessage,
} from "@anthropic-ai/claude-agent-sdk";

// ─── Config ──────────────────────────────────────────────────────────────────

const DISCORD_TOKEN = process.env.DISCORD_TOKEN!;
const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID!;
const ALLOWED_USER_IDS = new Set(
  (process.env.ALLOWED_USER_IDS ?? "").split(",").filter(Boolean)
);
const DEFAULT_MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-5-20250929";

// ─── Types & Constants ───────────────────────────────────────────────────────

const MODELS = [
  { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
] as const;

type Mode = "plan" | "editAsk" | "autoEdit";

const MODE_LABELS: Record<Mode, string> = {
  plan: "Plan (read-only)",
  editAsk: "Edit & Ask",
  autoEdit: "Auto-Edit",
};

interface UserState {
  session: SDKSession;
  model: string;
  mode: Mode;
  dmChannel: DMChannel;
  streamAbort: AbortController;
}

const userStates = new Map<string, UserState>();

// ─── Session Management ──────────────────────────────────────────────────────

function buildSessionOptions(userId: string, mode: Mode, model: string) {
  const base = { model } as const;

  switch (mode) {
    case "plan":
      return { ...base, permissionMode: "plan" as const };
    case "autoEdit":
      return { ...base, permissionMode: "acceptEdits" as const };
    case "editAsk":
      return {
        ...base,
        permissionMode: "default" as const,
        canUseTool: createCanUseTool(userId),
      };
  }
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

async function getOrCreateSession(
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

function destroySession(userId: string) {
  const state = userStates.get(userId);
  if (!state) return;
  state.streamAbort.abort();
  state.session.close();
  userStates.delete(userId);
}

async function recreateSession(userId: string, channel: DMChannel) {
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

// ─── Stream Reader ───────────────────────────────────────────────────────────

async function startStreamReader(userId: string, state: UserState) {
  try {
    for await (const msg of state.session.stream()) {
      if (state.streamAbort.signal.aborted) break;

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

// ─── Utilities ───────────────────────────────────────────────────────────────

function extractText(msg: SDKAssistantMessage): string {
  if (!msg.message?.content) return "";
  const parts: string[] = [];
  for (const block of msg.message.content) {
    if ("text" in block && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("\n");
}

function splitMessage(text: string, maxLen = 2000): string[] {
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

async function sendLongMessage(channel: DMChannel, text: string) {
  const chunks = splitMessage(text);
  for (const chunk of chunks) {
    if (chunk.trim()) {
      await channel.send(chunk);
    }
  }
}

// ─── Slash Commands ──────────────────────────────────────────────────────────

const commands = [
  new SlashCommandBuilder()
    .setName("reset")
    .setDescription("Reset the current Claude session"),
  new SlashCommandBuilder()
    .setName("models")
    .setDescription("View and switch Claude models"),
  new SlashCommandBuilder()
    .setName("mode")
    .setDescription("View and switch permission modes"),
];

// ─── Discord Client ──────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// ─── Ready ───────────────────────────────────────────────────────────────────

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);

  // Register slash commands
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(DISCORD_APPLICATION_ID), {
    body: commands.map((cmd) => cmd.toJSON()),
  });
  console.log("Slash commands registered.");
});

// ─── Interaction Handler ─────────────────────────────────────────────────────

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  // Only allow whitelisted users in DMs
  if (!ALLOWED_USER_IDS.has(interaction.user.id)) return;

  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === "reset") {
      destroySession(interaction.user.id);
      await interaction.reply("Session reset. Your next message will start a new conversation.");
      return;
    }

    if (commandName === "models") {
      const state = userStates.get(interaction.user.id);
      const currentModel = state?.model ?? DEFAULT_MODEL;

      const embed = new EmbedBuilder()
        .setTitle("Claude Models")
        .setDescription(`Current model: **${currentModel}**`)
        .setColor(0x6366f1);

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("model_select")
          .setPlaceholder("Select a model")
          .addOptions(
            MODELS.map((m) => ({
              label: m.name,
              value: m.id,
              default: m.id === currentModel,
            }))
          )
      );

      await interaction.reply({ embeds: [embed], components: [row] });
      return;
    }

    if (commandName === "mode") {
      const state = userStates.get(interaction.user.id);
      const currentMode = state?.mode ?? "autoEdit";

      const embed = new EmbedBuilder()
        .setTitle("Permission Mode")
        .setDescription(`Current mode: **${MODE_LABELS[currentMode]}**`)
        .setColor(0x6366f1);

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("mode_select")
          .setPlaceholder("Select a mode")
          .addOptions([
            {
              label: "Plan",
              value: "plan",
              description: "Claude only plans, no tool execution",
              default: currentMode === "plan",
            },
            {
              label: "Edit & Ask",
              value: "editAsk",
              description: "Asks permission before dangerous operations",
              default: currentMode === "editAsk",
            },
            {
              label: "Auto-Edit",
              value: "autoEdit",
              description: "Auto-approves file edits",
              default: currentMode === "autoEdit",
            },
          ])
      );

      await interaction.reply({ embeds: [embed], components: [row] });
      return;
    }
  }

  // Handle select menu interactions
  if (interaction.isStringSelectMenu()) {
    const channel = (interaction.channel ?? (await interaction.user.createDM())) as DMChannel;

    if (interaction.customId === "model_select") {
      const selectedModel = interaction.values[0];
      const state = userStates.get(interaction.user.id);
      if (state) {
        state.model = selectedModel;
        await recreateSession(interaction.user.id, channel);
      }
      const modelName =
        MODELS.find((m) => m.id === selectedModel)?.name ?? selectedModel;
      await interaction.update({
        content: `Model switched to **${modelName}**. Session has been reset.`,
        embeds: [],
        components: [],
      });
      return;
    }

    if (interaction.customId === "mode_select") {
      const selectedMode = interaction.values[0] as Mode;
      const state = userStates.get(interaction.user.id);
      if (state) {
        state.mode = selectedMode;
        await recreateSession(interaction.user.id, channel);
      }
      await interaction.update({
        content: `Mode switched to **${MODE_LABELS[selectedMode]}**. Session has been reset.`,
        embeds: [],
        components: [],
      });
      return;
    }
  }
});

// ─── Message Handler ─────────────────────────────────────────────────────────

client.on(Events.MessageCreate, async (message: Message) => {
  // Ignore bots
  if (message.author.bot) return;

  // Only process DMs
  if (message.channel.type !== ChannelType.DM) return;

  // Check whitelist
  if (!ALLOWED_USER_IDS.has(message.author.id)) return;

  // Show typing indicator
  await message.channel.sendTyping();

  try {
    const state = await getOrCreateSession(message.author.id, message.channel as DMChannel);
    await state.session.send(message.content);
  } catch (err) {
    console.error("Error sending message:", err);
    await message.channel.send(
      "Failed to send message. Try /reset to start a new session."
    );
  }
});

// ─── Startup & Graceful Shutdown ─────────────────────────────────────────────

client.login(DISCORD_TOKEN);

function shutdown() {
  console.log("\nShutting down...");
  for (const [userId] of userStates) {
    destroySession(userId);
  }
  client.destroy();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
