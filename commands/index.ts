import { REST, Routes } from "discord.js";
import type { CommandInteraction, StringSelectMenuInteraction } from "discord.js";
import * as resetCommand from "./reset.js";
import * as modelsCommand from "./models.js";
import * as modeCommand from "./mode.js";
import * as stopCommand from "./stop.js";

// 命令集合
const commands = [
  resetCommand,
  modelsCommand,
  modeCommand,
  stopCommand,
];

// 註冊所有 slash commands 到 Discord
export async function registerCommands(token: string, applicationId: string) {
  const rest = new REST({ version: "10" }).setToken(token);
  const commandData = commands.map((cmd) => cmd.data.toJSON());

  await rest.put(Routes.applicationCommands(applicationId), {
    body: commandData,
  });

  console.log("Slash commands registered.");
}

// 處理 slash command 互動
export async function handleCommand(interaction: CommandInteraction) {
  const command = commands.find((cmd) => cmd.data.name === interaction.commandName);

  if (command) {
    await command.execute(interaction);
  }
}

// 處理選單選擇互動
export async function handleSelectMenu(interaction: StringSelectMenuInteraction) {
  const { customId } = interaction;

  switch (customId) {
    case "model_select":
      await modelsCommand.handleSelect(interaction);
      break;
    case "mode_select":
      await modeCommand.handleSelect(interaction);
      break;
  }
}
