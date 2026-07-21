# 旅迹 · AI 旅行规划工作台

一个以 AI 对话驱动的旅行规划 Web 应用。旅迹将目的地、日期、预算和偏好转化为可编辑的逐日行程，并通过地图、天气以及 MCP 外部服务补充真实旅行信息。

> 当前版本面向普通 Node.js 服务器运行，使用 PostgreSQL 保存数据。项目不会在外部服务不可用时生成虚假的搜索结果。

## 功能特性

- **AI 行程规划**：根据目的地、日期、人数、预算和旅行偏好生成或调整方案。
- **逐日行程管理**：管理景点、交通、住宿、用餐、时间和费用等安排。
- **对话式修改**：识别确认、修订和取消意图，避免误写入尚未确认的方案。
- **地图与天气**：接入高德地图及天气服务，为行程提供位置与出行参考。
- **MCP 工具扩展**：支持 12306、搜索、酒店、机票等 Streamable HTTP MCP Server。
- **版本与冲突保护**：提供版本快照、乐观并发、幂等操作和锁定安排保护。
- **日历导出**：将包含日期和时间的行程导出为日历事件。
- **用户数据隔离**：所有服务端读写都根据可信用户身份校验数据归属。

## 技术栈

- React 19、Next.js 16、TypeScript
- Vinext、Vite、Cloudflare Workers
- PostgreSQL 18、Drizzle ORM
- Zod、React Markdown、Lucide React
- Node.js Test Runner、ESLint

## 快速开始

### 环境要求

- Node.js 22.13 或更高版本
- pnpm（推荐）或 npm

### 安装与启动

```bash
git clone https://github.com/drfccv/AI-Trip-Planner.git
cd AI-Trip-Planner
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev
```

Windows PowerShell 可使用：

```powershell
Copy-Item .env.example .env
pnpm db:migrate
pnpm dev
```

启动后访问 <http://127.0.0.1:4173>。

> `.env.local` 已被 Git 忽略。不要将真实 API Key 写入 `.env.example` 或提交到仓库。

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

## PostgreSQL 与本地开发

生产环境使用 PostgreSQL，保存用户、行程、每日安排、地点、路线、AI 任务、MCP 配置、操作记录和版本快照。

数据库结构定义位于 `db/schema.ts`，PostgreSQL 迁移文件位于 `drizzle-pg/`。生成和执行 Drizzle migration：

```bash
pnpm db:generate
pnpm db:migrate
```

项目也提供 `docker-compose.yml`，可同时启动 PostgreSQL 18 和应用。生产环境应使用独立的高强度数据库密码与 `APP_ENCRYPTION_KEY`。

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
app/                 页面、组件和 API Routes
db/                  Drizzle Schema 与数据库入口
drizzle/             数据库迁移
lib/ai/              AI 规划、任务和意图分发
lib/mcp/             MCP 注册、网关、安全与审计
lib/trips/           行程序列化与操作规则
tests/               自动化测试
worker/              Cloudflare Worker 入口
```

## 部署说明

普通 Node 服务器部署需要提供：

1. Node.js 22.13 或更高版本；
2. PostgreSQL 18 数据库和 `DATABASE_URL`；
3. 高强度 `APP_ENCRYPTION_KEY`；
4. 执行 `pnpm install --frozen-lockfile && pnpm db:migrate && pnpm build && pnpm start`。

仓库不包含具体站点 ID、部署凭证或生产密钥。部署平台的本地配置应保存在被 Git 忽略的 `.openai/` 等目录中。

## License

本项目采用 [Apache License 2.0](LICENSE) 开源许可证。
