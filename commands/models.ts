import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  type CommandInteraction,
  type StringSelectMenuInteraction,
  type DMChannel,
} from "discord.js";
import { DEFAULT_MODEL, MODELS, userStates } from "../core/types";
import { recreateSession } from "../core/session";

export const data = new SlashCommandBuilder()
  .setName("models")
  .setDescription("View and switch Claude models");

export async function execute(interaction: CommandInteraction) {
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
}

export async function handleSelect(interaction: StringSelectMenuInteraction) {
  const channel = (interaction.channel ?? (await interaction.user.createDM())) as DMChannel;
  const selectedModel = interaction.values[0];
  const state = userStates.get(interaction.user.id);

  if (state) {
    state.model = selectedModel;
    await recreateSession(interaction.user.id, channel);
  }

  const modelName = MODELS.find((m) => m.id === selectedModel)?.name ?? selectedModel;
  await interaction.update({
    content: `Model switched to **${modelName}**. Session has been reset.`,
    embeds: [],
    components: [],
  });
}
