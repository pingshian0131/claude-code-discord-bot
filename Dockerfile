FROM python:3.11-slim

# 1) 系統依賴（Panamera Python packages 需要）+ Node.js 22 + Claude Code CLI
RUN apt-get update && apt-get install -y --no-install-recommends \
    default-libmysqlclient-dev \
    build-essential \
    pkg-config \
    libjpeg-dev \
    zlib1g-dev \
    libpng-dev \
    libgl1 \
    libglib2.0-0 \
    libffi-dev \
    git \
    curl \
    ca-certificates \
    gnupg \
    sudo \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g @anthropic-ai/claude-code \
    && rm -rf /var/lib/apt/lists/*

# 2) 建立非 root 使用者（UID 1000 與 host 使用者一致）
RUN groupadd -g 1000 appuser && \
    useradd -m -u 1000 -g appuser -s /bin/bash appuser && \
    echo "appuser ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# 3) 安裝 pipenv（不預先安裝 project 的 Python dependencies）
RUN pip install "pip<24.1" && \
    pip install pipenv==2022.4.20

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 4) Node.js Bot 應用
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN chown -R appuser:appuser /app

# 5) Workspace 目錄（掛載點）
RUN mkdir -p /workspace && chown -R appuser:appuser /workspace

# 6) 設定 HOME 並切換到非 root 使用者
ENV HOME=/home/appuser
USER appuser

WORKDIR /workspace
CMD ["npx", "tsx", "/app/bot.ts"]
