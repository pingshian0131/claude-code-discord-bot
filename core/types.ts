import type { SDKSession } from "@anthropic-ai/claude-agent-sdk";
import type { DMChannel } from "discord.js";

// ─── Config ──────────────────────────────────────────────────────────────────

export const DISCORD_TOKEN = process.env.DISCORD_TOKEN!;
export const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID!;
export const ALLOWED_USER_IDS = new Set(
  (process.env.ALLOWED_USER_IDS ?? "").split(",").filter(Boolean)
);
export const DEFAULT_MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-5-20250929";
export const WORK_DIR = process.env.WORK_DIR || process.cwd();

// ─── Constants ───────────────────────────────────────────────────────────────

export const MODELS = [
  { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
] as const;

export type Mode = "plan" | "editAsk" | "autoEdit";

export const MODE_LABELS: Record<Mode, string> = {
  plan: "Plan (read-only)",
  editAsk: "Edit & Ask",
  autoEdit: "Auto-Edit",
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GitStatusStats {
  modified: number;
  added: number;
  deleted: number;
  untracked: number;
  renamed: number;
}

export interface UserState {
  session: SDKSession;
  model: string;
  mode: Mode;
  dmChannel: DMChannel;
  streamAbort: AbortController;
}

export const userStates = new Map<string, UserState>();
