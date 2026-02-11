import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  ChannelType,
  type Interaction,
  type Message,
  type DMChannel,
} from "discord.js";
import {
  DISCORD_TOKEN,
  DISCORD_APPLICATION_ID,
  ALLOWED_USER_IDS,
} from "./core/types.js";
import { getOrCreateSession, destroySession, recreateSession } from "./core/session.js";
import { userStates } from "./core/types.js";
import { registerCommands, handleCommand, handleSelectMenu } from "./commands/index.js";

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
  await registerCommands(DISCORD_TOKEN, DISCORD_APPLICATION_ID);
});

// ─── Interaction Handler ─────────────────────────────────────────────────────

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  // Only allow whitelisted users
  if (!ALLOWED_USER_IDS.has(interaction.user.id)) return;

  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    await handleCommand(interaction);
    return;
  }

  // Handle select menu interactions
  if (interaction.isStringSelectMenu()) {
    await handleSelectMenu(interaction);
    return;
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

  console.log(`[Bot] Received message from ${message.author.id}: "${message.content}"`);

  // 攔截文字指令
  const trimmed = message.content.trim().toLowerCase();
  if (trimmed === "/stop") {
    const state = userStates.get(message.author.id);
    if (state) {
      await recreateSession(message.author.id, message.channel as DMChannel);
      await message.reply("⏹️ Execution stopped.");
    } else {
      await message.reply("No active session.");
    }
    return;
  }
  if (trimmed === "/reset") {
    destroySession(message.author.id);
    await message.reply("Session reset. Your next message will start a new conversation.");
    return;
  }

  // Show typing indicator
  await message.channel.sendTyping();

  try {
    const state = await getOrCreateSession(message.author.id, message.channel as DMChannel);
    console.log(`[Bot] Sending to session, mode: ${state.mode}`);

    // 添加超時保護 (30 秒)
    const sendPromise = state.session.send(message.content);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Session.send() timeout after 30s')), 30000)
    );

    await Promise.race([sendPromise, timeoutPromise]);
    console.log(`[Bot] Message sent to session successfully`);
  } catch (err) {
    console.error("[Bot] Error sending message:", err);
    await message.channel.send(
      `❌ Failed to send message: ${err instanceof Error ? err.message : 'Unknown error'}. Try /reset to start a new session.`
    );
  }
});

// ─── Startup & Graceful Shutdown ─────────────────────────────────────────────

client.login(DISCORD_TOKEN);

function shutdown() {
  console.log("\nShutting down...");
  // Import userStates dynamically to avoid circular dependency
  import("./core/types.js").then(({ userStates }) => {
    for (const [userId] of userStates) {
      destroySession(userId);
    }
    client.destroy();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
