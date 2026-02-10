import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  type CommandInteraction,
  type StringSelectMenuInteraction,
  type DMChannel,
} from "discord.js";
import { MODE_LABELS, userStates, type Mode } from "../core/types";
import { recreateSession } from "../core/session";

export const data = new SlashCommandBuilder()
  .setName("mode")
  .setDescription("View and switch permission modes");

export async function execute(interaction: CommandInteraction) {
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
}

export async function handleSelect(interaction: StringSelectMenuInteraction) {
  const channel = (interaction.channel ?? (await interaction.user.createDM())) as DMChannel;
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
}
