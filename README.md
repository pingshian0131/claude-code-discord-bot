# Claude Code Discord Bot

透過 Discord DM 與 Claude Code Agent 進行多輪對話的 Discord Bot。支援白名單使用者、多種權限模式，並可透過 Docker 部署。

## 功能特色

- ✅ **Discord 整合**：透過 DM 與 Claude Code 互動
- ✅ **白名單機制**：限制特定使用者存取
- ✅ **多種模式**：Plan、Edit & Ask、Auto-Edit 三種權限模式
- ✅ **Docker 部署**：完整的容器化環境
- ✅ **Python 支援**：內建 Python 3.11 + pipenv
- ✅ **Volume Mount**：可掛載任意專案目錄進行操作

## 架構說明

### 系統架構

```
bot.ts (Discord Bot)
  ↓
Claude Agent SDK (@anthropic-ai/claude-agent-sdk)
  ↓
Spawns → Claude Code CLI (bundled)
  ↓
操作 /workspace (mounted project)
```

### 程式架構（模組化設計）

```
claude-code-agent/
├── bot.ts                    # Discord 客戶端入口 (事件監聽)
├── commands/                 # Slash Commands 模組
│   ├── index.ts             # 命令註冊與路由
│   ├── reset.ts             # /reset - 重置 session
│   ├── models.ts            # /models - 切換模型
│   └── mode.ts              # /mode - 切換權限模式
├── core/                     # 核心功能模組
│   ├── types.ts             # 型別定義、常數與全域狀態
│   ├── session.ts           # Session 生命週期管理
│   └── stream.ts            # Claude 回應串流處理
└── utils/                    # 工具函式模組
    ├── git.ts               # Git 狀態查詢與格式化
    └── message.ts           # 訊息分割與傳送
```

## 環境需求

### 本地開發
- Node.js >= 18
- Discord Bot Token 與 Application ID
- Anthropic API Key

### Docker 部署
- Docker & Docker Compose
- Anthropic API Key
- 要操作的專案目錄（如 Panamera）

## 快速開始

### 1. 複製環境變數範本

```bash
cp .env.example .env
```

### 2. 設定環境變數

編輯 `.env`：

```env
# Discord 設定
DISCORD_TOKEN=你的-discord-bot-token
DISCORD_APPLICATION_ID=你的-application-id
ALLOWED_USER_IDS=你的-discord-user-id

# Claude 設定
CLAUDE_MODEL=claude-sonnet-4-5-20250929

# Docker 設定（僅 Docker 部署時需要）
WORK_DIR=/path/to/your/project
CLAUDE_CONFIG=/path/to/.claude
```

### 3. 設定 Anthropic API Key

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### 4. 啟動方式

#### 選項 A：Docker 部署（推薦）

```bash
# 建置映像檔
docker compose build

# 啟動容器
docker compose up -d

# 查看日誌
docker compose logs -f claude-bot

# 停止容器
docker compose down
```

#### 選項 B：本地執行

```bash
# 安裝依賴
npm install

# 開發模式
npm run bot:dev

# 正式執行
npm run bot
```

## Docker 配置說明

### Dockerfile 結構

1. **基礎映像檔**：`python:3.11-slim`
2. **系統依賴**：MySQL client、OpenCV、Pillow 等所需的系統函式庫
3. **Node.js 22**：從 nodesource 安裝
4. **Claude Code CLI**：全域安裝 `@anthropic-ai/claude-code`
5. **pipenv**：Python 套件管理工具
6. **Bot 應用**：Discord bot 的 TypeScript 程式碼

### Volume Mounts

| Host 路徑 | 容器路徑 | 用途 |
|----------|---------|------|
| `${WORK_DIR}` | `/workspace` | Claude Code 操作的專案目錄 |
| `${CLAUDE_CONFIG}` | `/root/.claude` | Claude 認證與設定 |

### 環境變數

| 變數名稱 | 必填 | 預設值 | 說明 |
|---------|------|--------|------|
| `DISCORD_TOKEN` | ✅ | - | Discord Bot Token |
| `DISCORD_APPLICATION_ID` | ✅ | - | Discord Application ID |
| `ALLOWED_USER_IDS` | ✅ | - | 白名單使用者 ID（逗號分隔） |
| `CLAUDE_MODEL` | ❌ | `claude-sonnet-4-5-20250929` | Claude 模型 |
| `WORK_DIR` | ❌ | `./` | 掛載的專案目錄 |
| `CLAUDE_CONFIG` | ❌ | `~/.claude` | Claude 設定目錄 |
| `ANTHROPIC_API_KEY` | ✅ | - | Anthropic API Key（需在 host 環境設定） |

## 使用方式

### Slash Commands

| 指令 | 說明 |
|-----|------|
| `/reset` | 重置當前 session |
| `/models` | 切換 Claude 模型 |
| `/mode` | 切換權限模式 |

### 權限模式

| 模式 | 說明 |
|-----|------|
| **Plan** | Claude 只規劃不執行，適合先審查計畫 |
| **Edit & Ask** | 危險操作需確認（預設） |
| **Auto-Edit** | 自動批准檔案編輯 |

### 使用範例

1. 在 Discord 對 bot 發送 DM
2. 直接輸入指令：「讀一下 panamera/models.py」
3. Claude Code 會在容器內的 `/workspace` 操作檔案
4. 支援多輪對話，可持續追問

## 切換工作目錄

如果要操作不同的專案：

```bash
WORK_DIR=/path/to/another/project docker compose up -d
```

或直接修改 `.env` 中的 `WORK_DIR` 後重啟。

## 資源限制

預設限制（可在 `docker-compose.yml` 調整）：
- **CPU**：2 核心
- **記憶體**：2GB

## 疑難排解

### 問題：Bot 回應 "Not logged in"

**原因**：容器內 Claude Code 未正確認證。

**解決方式**：
1. 確認 `ANTHROPIC_API_KEY` 已在 host 環境設定
2. 確認 `CLAUDE_CONFIG` 路徑正確且包含有效憑證
3. 重啟容器：`docker compose down && docker compose up -d`

### 問題：Python 套件找不到

**原因**：專案的 Pipfile 尚未安裝。

**解決方式**：
1. 進入容器：`docker exec -it claude-code-bot bash`
2. 切換到專案目錄：`cd /workspace`
3. 安裝依賴：`pipenv install --dev --system`
4. 或請 Claude Code 在對話中執行安裝

### 問題：容器無法存取專案檔案

**原因**：Volume mount 路徑錯誤或權限問題。

**解決方式**：
1. 確認 `.env` 中的 `WORK_DIR` 路徑正確
2. 確認該路徑在 host 上存在且可讀寫
3. 檢查容器內掛載：`docker exec claude-code-bot ls -la /workspace`

## 專案結構

```
.
├── bot.ts              # Discord Bot 主程式（事件處理器）
├── commands/           # Slash Commands 模組
│   ├── index.ts       # 命令註冊與路由
│   ├── reset.ts       # /reset 命令
│   ├── models.ts      # /models 命令
│   └── mode.ts        # /mode 命令
├── core/              # 核心功能模組
│   ├── types.ts       # 型別定義與常數
│   ├── session.ts     # Session 管理
│   └── stream.ts      # Stream 處理
├── utils/             # 工具函式
│   ├── git.ts         # Git 工具
│   └── message.ts     # 訊息工具
├── package.json       # Node.js 依賴
├── tsconfig.json      # TypeScript 配置
├── Dockerfile         # Docker 映像檔定義
├── docker-compose.yml # Docker Compose 配置
├── .dockerignore      # Docker build 排除檔案
├── .env               # 環境變數（不納入版控）
├── .env.example       # 環境變數範本
└── README.md          # 本文件
```

## 開發指南

### 新增 Slash Command

1. 在 [commands/](commands/) 目錄建立新檔案（例如 `hello.ts`）:

```typescript
import { SlashCommandBuilder, type CommandInteraction } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("hello")
  .setDescription("Say hello");

export async function execute(interaction: CommandInteraction) {
  await interaction.reply("Hello! 👋");
}
```

2. 在 [commands/index.ts](commands/index.ts) 中匯入新命令:

```typescript
import * as helloCommand from "./hello";

const commands = [
  resetCommand,
  modelsCommand,
  modeCommand,
  helloCommand,  // 新增這行
];
```

3. 重啟 bot，命令會自動註冊到 Discord

### 模組職責

| 模組 | 職責 | 何時修改 |
|-----|------|---------|
| [bot.ts](bot.ts) | Discord 事件監聽、路由 | 新增事件處理器 |
| [commands/](commands/) | Slash command 定義與執行 | 新增/修改命令 |
| [core/session.ts](core/session.ts) | Session 生命週期、權限管理 | 修改 session 行為 |
| [core/stream.ts](core/stream.ts) | Claude 回應處理 | 修改訊息處理邏輯 |
| [core/types.ts](core/types.ts) | 型別與常數定義 | 新增共用型別 |
| [utils/](utils/) | 可重用的工具函式 | 新增工具函式 |

### 架構優勢

- ✅ **關注點分離**：命令、核心邏輯、工具函式各自獨立
- ✅ **易於測試**：每個模組可單獨測試
- ✅ **可擴展性**：新增功能不影響現有程式碼
- ✅ **可讀性**：主程式從 611 行減少到 98 行
- ✅ **型別安全**：完整的 TypeScript 支援

## 技術棧

- **Discord.js** v14 - Discord API 整合
- **Claude Agent SDK** v0.2.38 - Claude Code 整合
- **TypeScript** - 型別安全的開發
- **tsx** - TypeScript 執行器
- **Docker** - 容器化部署
- **Python 3.11** - 支援 Python 專案操作
- **pipenv** - Python 依賴管理

## 授權

MIT License

## 參考資源

- [Claude Agent SDK 文件](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- [Discord.js 指南](https://discordjs.guide/)
- [參考專案](https://github.com/pingshian0131/claude-code-discord)
