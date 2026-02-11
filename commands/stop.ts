import {
  SlashCommandBuilder,
  ChannelType,
  type CommandInteraction,
  type DMChannel,
} from "discord.js";
import { recreateSession } from "../core/session.js";
import { userStates } from "../core/types.js";

export const data = new SlashCommandBuilder()
  .setName("stop")
  .setDescription("Stop the current Claude execution");

export async function execute(interaction: CommandInteraction) {
  const userId = interaction.user.id;
  const state = userStates.get(userId);

  if (!state) {
    await interaction.reply("No active session to stop.");
    return;
  }

  const channel =
    interaction.channel?.type === ChannelType.DM
      ? (interaction.channel as DMChannel)
      : state.dmChannel;

  await recreateSession(userId, channel);
  await interaction.reply("Execution stopped. You can continue sending messages.");
}
