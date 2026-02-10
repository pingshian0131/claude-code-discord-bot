FROM python:3.11-slim

# 1) 系統依賴（Panamera Python packages 需要）+ Node.js 22
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
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# 2) Python 依賴（從 Panamera Pipfile 安裝）
WORKDIR /tmp/python-deps
COPY panamera-deps/Pipfile panamera-deps/Pipfile.lock ./
RUN pip install "pip<24.1" && \
    pip install pipenv==2022.4.20 && \
    pipenv install --dev --system && \
    rm -rf /tmp/python-deps

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 3) Node.js Bot 應用
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY bot.ts tsconfig.json ./

# 4) Workspace 目錄（掛載點）
RUN mkdir -p /workspace
WORKDIR /workspace

CMD ["npx", "tsx", "/app/bot.ts"]
