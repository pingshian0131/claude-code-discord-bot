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
import { getOrCreateSession, destroySession } from "./core/session.js";
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
