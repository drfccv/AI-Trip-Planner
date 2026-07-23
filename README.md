<div align="center">
  <img src="https://raw.githubusercontent.com/drfccv/lvji-travel/drfccv/electron-local/desktop/assets/icon.svg" alt="旅迹图标" width="120" height="120" />
</div>

<div align="center">

# 旅迹 · AI 旅行规划工作台

</div>

一个以 AI 对话驱动的旅行规划 Web 应用。旅迹将目的地、日期、预算和偏好转化为可编辑的逐日行程，并通过地图、天气以及 MCP 外部服务补充真实旅行信息。

**在线Demo：** [https://drfccv.github.io/lvji-travel/](https://drfccv.github.io/lvji-travel/)

![旅迹首页截图](https://picui.ogmua.cn/s1/2026/07/21/6a5ee653883d9.webp)

## 功能特性

- **AI 行程规划**：根据目的地、日期、人数、预算和旅行偏好生成或调整方案。
- **逐日行程管理**：管理景点、交通、住宿、用餐、时间和费用等安排。
- **对话式修改**：识别确认、修订和取消意图，避免误写入尚未确认的方案。
- **地图与天气**：接入高德地图及天气服务，为行程提供位置与出行参考。
- **MCP 工具扩展**：支持 12306、搜索、酒店、机票等 Streamable HTTP MCP Server。
- **版本与冲突保护**：提供版本快照、乐观并发、幂等操作和锁定安排保护。
- **日历导出**：将包含日期和时间的行程导出为日历事件。
- **用户数据隔离**：所有服务端读写都根据可信用户身份校验数据归属。
- **桌面客户端**：基于 Electron 43，内置 SQLite，无需数据库即可本地运行。

## 技术栈

- **前端框架**：Next.js 16（App Router）、React 19、TypeScript 5.9
- **桌面端**：Electron 43、better-sqlite3
- **样式与界面**：Tailwind CSS 4、Lucide React、React Markdown
- **服务端与数据**：Node.js 22、PostgreSQL 18、Drizzle ORM
- **AI 与外部服务**：OpenAI-compatible API、MCP（Streamable HTTP）、高德地图
- **校验与工程化**：Zod 4、ESLint 9、Node.js Test Runner
- **部署**：Docker、Docker Compose

## 快速开始

### 桌面客户端（推荐）

> 基于 Electron 43 构建，内置 SQLite，无需 PostgreSQL 即可本地运行，配置在 `drfccv/electron-local` 分支。

前往 [Releases 页面](https://github.com/drfccv/lvji-travel/releases) 下载对应系统的安装包：

| 平台 | 安装包 |
|------|--------|
| Windows | `lvji-*-win-x64.exe`（安装版）或 `lvji-*-win-x64-portable.exe`（便携版） |
| Linux | `lvji-*-linux-x86_64.AppImage` 或 `lvji-*-linux-amd64.deb` |
| macOS (Intel) | `lvji-*-mac-x64.dmg` |
| macOS (Apple Silicon) | `lvji-*-mac-arm64.dmg` |

下载安装后首次启动会打开配置页面，填入 AI 和 MCP 密钥即可使用，无需额外搭建数据库。

### Docker 部署

#### 首次安装

```bash
curl -fsSLO \
  https://raw.githubusercontent.com/drfccv/lvji-travel/main/docker-compose.yml \
  https://raw.githubusercontent.com/drfccv/lvji-travel/main/.env.example
cp .env.example .env

# 生成随机数据库凭据和加密密钥并追加到 .env
node -e "
const crypto = require('crypto');
console.log('DB_USER=' + crypto.randomBytes(4).toString('hex'));
console.log('DB_PASS=' + crypto.randomBytes(12).toString('hex'));
console.log('APP_ENCRYPTION_KEY=' + crypto.randomBytes(32).toString('base64'));
" >> .env

# 可选的 AI / MCP 等配置，参考下方"环境变量"表格继续编辑 .env
docker compose up -d
```

启动后访问 <http://127.0.0.1:4173>（可通过 `.env` 中的 `APP_PORT` 更改宿主机端口）。

#### 更新编排文件到最新

```bash
docker compose down
curl -fsSLO \
  https://raw.githubusercontent.com/drfccv/lvji-travel/main/docker-compose.yml \
  https://raw.githubusercontent.com/drfccv/lvji-travel/main/.env.example
docker compose up -d
```

#### 更新服务镜像到最新

```bash
docker compose down
docker compose pull
docker compose up -d
```

镜像由 GitHub Actions 在每次推送代码到 `main` 时自动构建并推送至 GitHub Container Registry。

### 源码安装与启动

#### 环境要求

- Node.js 22.13 或更高版本
- pnpm（推荐）或 npm

#### 安装与启动

```bash
git clone https://github.com/drfccv/lvji-travel.git
cd lvji-travel
pnpm install                # 安装依赖
cp .env.example .env        # 复制环境变量模板，编辑填入 AI Key 等配置
pnpm db:migrate             # 在 PostgreSQL 中创建表结构（需先配置 DATABASE_URL）
pnpm build                  # 构建生产版本
pnpm start                  # 启动服务，访问 http://127.0.0.1:4173
```

Windows PowerShell 可使用：

```powershell
Copy-Item .env.example .env
pnpm db:migrate
pnpm build
pnpm start
```

启动后访问 <http://127.0.0.1:4173>。

## 环境变量

所有配置均为可选项；未配置的上游能力会返回明确错误或保持不可用状态。

| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 连接字符串，例如 `postgresql://user:password@127.0.0.1:5432/ai_trip_planner` |
| `DATABASE_POOL_SIZE` | 可选；数据库连接池上限，默认 10 |
| `APP_ENCRYPTION_KEY` | 使用 AES-GCM 加密保存 AI/MCP 凭证；生产环境保存密钥时必须配置高强度值 |
| `AI_PROVIDER` | AI 服务商标识，默认使用 OpenAI-compatible 协议 |
| `AI_BASE_URL` | OpenAI-compatible API 地址 |
| `AI_API_KEY` | AI 服务密钥 |
| `AI_MODEL` | 默认模型名称 |
| `AMAP_WEB_SERVICE_KEY` | 高德 Web 服务端 Key |
| `NEXT_PUBLIC_AMAP_JS_KEY` | 高德地图 JavaScript API Key |
| `AMAP_JS_SECURITY_CODE` | 高德地图 JavaScript API 安全密钥 |
| `UAPI_API_KEY` | UAPI Key；留空时使用可用的访客额度 |
| `MCP_12306_URL` | 12306 MCP Server 地址 |
| `MCP_12306_API_KEY` | 12306 MCP 凭证 |
| `MCP_SEARXNG_URL` | SearXNG MCP Server 地址 |
| `MCP_AMAP_URL` | 高德 MCP Server 地址 |
| `MCP_TAVILY_URL` / `TAVILY_API_KEY` | Tavily MCP 地址和凭证 |
| `MCP_DIDA_URL` / `MCP_DIDA_FLIGHT_URL` | RollingGo 酒店和机票 MCP 地址 |
| `DIDA_API_KEY` / `ROLLINGGO_API_KEY` | RollingGo 兼容凭证 |

## PostgreSQL

生产环境使用 PostgreSQL，保存用户、行程、每日安排、地点、路线、AI 任务、MCP 配置、操作记录和版本快照。数据库结构定义位于 `db/schema.ts`。

项目提供 Docker 编排（详见[快速开始](#docker-部署推荐)），可一键启动 PostgreSQL 18 和应用。镜像由 GitHub Actions 在每次推送代码到 `main` 分支时自动构建并推送至 GitHub Container Registry。

## MCP Gateway 与安全

应用支持无认证、Bearer Token 和自定义 Authorization 三种 MCP 认证方式。MCP Gateway 会：

- 只允许公开 HTTPS 目标；
- 阻止回环、私网、链路本地和云元数据地址；
- 限制重定向、请求超时和响应体积；
- 仅在服务端解密并发送凭证；
- 在列表接口中只返回密钥掩码。

仅使用无认证 MCP 时不需要设置 `APP_ENCRYPTION_KEY`，应用也不会发送 `Authorization` Header。

## 数据一致性

- AI 与手工修改统一经过 `preview → apply` 流程。
- 提交操作必须携带当前 `revision` 和 `idempotencyKey`。
- 并发版本冲突返回 HTTP 409。
- 锁定的安排不能被修改、移动或删除。
- 重要修改会生成版本快照，支持回退。

## 质量检查

提交代码前建议运行：

```bash
pnpm test
pnpm lint
pnpm build
```

测试覆盖行程领域规则、计划分发、模型推理参数、日历导出、Markdown 处理和 MCP 安全策略。

## 项目结构

```text
.
├── app/                        # 页面、组件与 API 路由
│   ├── api/
│   │   ├── ai/                 # AI 对话、任务分发与管理 API
│   │   ├── mcp/                # MCP 代理与配置 API
│   │   ├── trips/              # 行程 CRUD API
│   │   └── user/               # 用户相关 API
│   ├── AiAssistant.tsx         # AI 对话组件
│   ├── PlanningFields.tsx      # 行程规划字段组件
│   └── SettingsPanel.tsx       # 设置面板
├── db/                         # Drizzle Schema 与数据库入口
│   └── schema.ts               # 全部表定义（用户、行程、安排、MCP 等）
├── lib/                        # 核心业务逻辑
│   ├── ai/                     # AI 规划、任务分发、意图识别
│   ├── auth/                   # 用户认证
│   ├── http/                   # HTTP 工具与错误处理
│   ├── mcp/                    # MCP 注册、网关、安全与审计
│   └── trips/                  # 行程序列化与操作规则
├── public/                     # 静态资源
├── scripts/                    # 构建与脚本工具
├── tests/                      # 自动化测试
├── docker-compose.yml          # Docker 编排（含 PostgreSQL）
├── Dockerfile                  # 容器镜像构建
├── drizzle.config.ts           # Drizzle Kit 配置
├── next.config.ts              # Next.js 配置
├── proxy.ts                    # 匿名用户代理中间件
├── package.json
└── tsconfig.json
```
