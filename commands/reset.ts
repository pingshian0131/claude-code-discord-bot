import { SlashCommandBuilder, type CommandInteraction } from "discord.js";
import { destroySession } from "../core/session.js";

export const data = new SlashCommandBuilder()
  .setName("reset")
  .setDescription("Reset the current Claude session");

export async function execute(interaction: CommandInteraction) {
  destroySession(interaction.user.id);
  await interaction.reply("Session reset. Your next message will start a new conversation.");
}
