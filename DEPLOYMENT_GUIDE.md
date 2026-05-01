# Render 部署指南

## 📋 前置准备

### 1. 环境变量配置

在 Render 控制台中，为 Web Service 配置以下环境变量：

**必需：**
- `DATABASE_URL` - 自动从数据库服务获取（已在 render.yaml 中配置）
- `NODE_ENV` - production
- `PORT` - 3000

**可选（根据功能需求）：**
- `KIMI_API_KEY` - Kimi AI 接口密钥
- `WEATHER_API_KEY` - 天气 API 密钥
- `FISH_AUDIO_API_KEY` - Fish Audio API 密钥
- `APP_ID` - 应用 ID（自动生成）
- `APP_SECRET` - 应用密钥（自动生成）

### 2. 数据库配置

在 Render 控制台创建 MySQL 数据库服务，或使用 render.yaml 中的配置自动创建。

---

## 🚀 部署步骤

### 方式一：通过 Render Dashboard（推荐）

1. **登录 Render**  
   访问 https://dashboard.render.com

2. **创建新 Web Service**  
   - 点击 "New +" → "Web Service"
   - 连接 GitHub 仓库：`manlinayu-code/melo-dj`
   - 选择分支：`main`

3. **配置服务**
   - **Name**: `melo-dj`
   - **Runtime**: `Docker`
   - **Plan**: `Free`

4. **添加数据库**
   - 点击 "Create Database"
   - **Name**: `melo-dj-db`
   - **Database Name**: `melo_dj`
   - **Plan**: `Free`

5. **配置环境变量**
   - 在 "Environment" 标签页添加上述环境变量
   - `DATABASE_URL` 会自动从数据库服务注入

6. **部署**
   - 点击 "Create Web Service"
   - Render 会自动构建和部署

### 方式二：通过 render.yaml（基础设施即代码）

1. **确保 render.yaml 在仓库根目录**
2. **在 Render Dashboard 中**
   - 点击 "New +" → "Blueprint"
   - 连接 GitHub 仓库
   - Render 会自动读取 `render.yaml` 并创建所有服务

---

## 🔧 构建和部署流程

### 构建过程

```bash
# 1. 安装依赖
npm ci --prefer-offline --no-audit

# 2. 构建前端和后端
npm run build
# 执行：
# - vite build (输出到 dist/public)
# - esbuild api/boot.ts (输出到 dist/boot.cjs)

# 3. 推送数据库 schema
npm run db:push
```

### Docker 构建流程

```dockerfile
# 多阶段构建
FROM node:20-alpine AS base
WORKDIR /app

# 阶段 1: 安装依赖
FROM base AS deps
COPY package*.json ./
RUN npm ci --prefer-offline --no-audit

# 阶段 2: 构建应用
FROM deps AS build
COPY . .
RUN npm run build

# 阶段 3: 生产镜像
FROM node:20-alpine AS production
RUN apk add --no-cache curl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
RUN npm prune --production

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
CMD ["node", "dist/boot.cjs"]
```

---

## ✅ 健康检查

### 端点
`GET /health`

### 响应
```json
{
  "ok": true,
  "ts": 1704067200000
}
```

### Docker HEALTHCHECK
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

---

## 🐛 常见问题排查

### 1. 构建失败：`vite build` 报错

**原因**：依赖缺失或版本不兼容

**解决**：
```bash
# 本地测试构建
npm run build

# 检查 Node.js 版本（推荐 20.x）
node --version
```

### 2. 运行时错误：`Cannot find module`

**原因**：`node_modules` 不完整

**解决**：
- 确保 Dockerfile 中复制了完整的 `node_modules`
- 或使用 `npm prune --production` 精简依赖

### 3. 数据库迁移失败

**原因**：`DATABASE_URL` 未配置或数据库不可达

**解决**：
```bash
# 本地测试数据库连接
npm run db:push

# 检查环境变量
echo $DATABASE_URL
```

### 4. 健康检查失败

**原因**：`/health` 端点未正确响应

**解决**：
- 检查 `api/boot.ts` 中的路由配置
- 确保 `env.isProduction` 为 `true`

### 5. 前端页面 404

**原因**：静态文件未正确服务

**解决**：
- 检查 `dist/public` 目录是否存在
- 检查 `api/lib/vite.ts` 中的 `serveStaticFiles` 函数

---

## 📝 部署检查清单

- [ ] `render.yaml` 配置正确
- [ ] `.dockerignore` 文件存在
- [ ] `DATABASE_URL` 环境变量已配置
- [ ] 数据库服务已创建并可访问
- [ ] `npm run build` 本地构建成功
- [ ] `npm run start` 本地启动成功
- [ ] `/health` 端点返回 200 OK
- [ ] 所有必需的环境变量已设置

---

## 🔄 持续部署

### 自动部署

Render 会在每次推送到 `main` 分支时自动重新部署。

### 手动部署

在 Render Dashboard 中：
1. 进入服务页面
2. 点击 "Manual Deploy"
3. 选择分支并部署

---

## 📊 监控和日志

### 查看日志

在 Render Dashboard 中：
1. 进入服务页面
2. 点击 "Logs" 标签页

### 关键日志

- `[boot] Starting...` - 应用启动
- `[boot] Migration step done` - 数据库迁移完成
- `[boot] Server running on port 3000` - 服务器启动成功
- `[migrate] Auto-migration completed successfully` - 自动迁移完成

---

## 🆘 需要帮助？

如果你在部署过程中遇到任何问题，请提供：

1. **Render 部署日志**（从 Dashboard 复制）
2. **构建错误截图**
3. **运行时错误信息**

将这些信息提供给我，我会帮你具体分析并解决问题。
