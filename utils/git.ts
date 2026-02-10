import { promisify } from 'util';
import { exec } from 'child_process';
import type { DMChannel } from "discord.js";
import type { GitStatusStats } from "../core/types";

const execAsync = promisify(exec);

export async function getGitBranch(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      timeout: 5000,
    });
    const branch = stdout.trim();

    // 處理 detached HEAD 狀態
    if (branch === 'HEAD') {
      const { stdout: hash } = await execAsync('git rev-parse --short HEAD', {
        cwd,
        timeout: 5000,
      });
      return `(detached: ${hash.trim()})`;
    }

    return branch;
  } catch (error) {
    return null;
  }
}

export async function getGitStatus(cwd: string): Promise<GitStatusStats | null> {
  try {
    const { stdout } = await execAsync('git status --porcelain', {
      cwd,
      timeout: 5000,
    });

    const lines = stdout.split('\n').filter(Boolean);
    const stats: GitStatusStats = {
      modified: 0,
      added: 0,
      deleted: 0,
      untracked: 0,
      renamed: 0,
    };

    for (const line of lines) {
      const statusCode = line.slice(0, 2);

      if (statusCode === '??') {
        stats.untracked++;
      } else if (statusCode.startsWith('R')) {
        stats.renamed++;
      } else {
        // 檢查 staging area (第一個字元)
        if (statusCode[0] === 'M') stats.modified++;
        if (statusCode[0] === 'A') stats.added++;
        if (statusCode[0] === 'D') stats.deleted++;

        // 檢查 working tree (第二個字元)
        if (statusCode[1] === 'M') stats.modified++;
        if (statusCode[1] === 'D') stats.deleted++;
      }
    }

    return stats;
  } catch (error) {
    return null;
  }
}

export function shortenPath(path: string): string {
  const home = process.env.HOME || '/root';
  if (path.startsWith(home)) {
    return path.replace(home, '~');
  }
  if (path.startsWith('/workspace')) {
    return path.replace('/workspace', '.');
  }
  return path;
}

export function formatWorkspaceInfo(
  cwd: string,
  branch: string | null,
  stats: GitStatusStats | null
): string {
  const shortPath = shortenPath(cwd);
  let message = '📍 **工作資訊**\n```\n';
  message += `工作目錄: ${shortPath}\n`;

  if (!branch) {
    message += '當前分支: (非 git repository)\n';
  } else {
    message += `當前分支: ${branch}\n`;

    if (!stats || Object.values(stats).every(v => v === 0)) {
      message += 'Git 狀態: (clean)';
    } else {
      const parts: string[] = [];
      if (stats.modified > 0) parts.push(`${stats.modified} 修改`);
      if (stats.added > 0) parts.push(`${stats.added} 新增`);
      if (stats.deleted > 0) parts.push(`${stats.deleted} 刪除`);
      if (stats.untracked > 0) parts.push(`${stats.untracked} 未追蹤`);
      if (stats.renamed > 0) parts.push(`${stats.renamed} 重新命名`);
      message += `Git 狀態: ${parts.join('，')}`;
    }
  }

  message += '\n```';
  return message;
}

export async function notifyWorkspaceInfo(channel: DMChannel, cwd: string): Promise<void> {
  try {
    // 並行取得 branch 和 status
    const branch = await getGitBranch(cwd);
    const stats = branch !== null ? await getGitStatus(cwd) : null;

    const message = formatWorkspaceInfo(cwd, branch, stats);
    await channel.send(message);
  } catch (error) {
    console.error('Failed to send workspace info:', error);
  }
}
