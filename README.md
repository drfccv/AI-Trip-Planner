# 旅迹（Lvji）

旅迹是一款由 AI 辅助规划行程的旅行工作台，支持逐日安排、对话式修改、地图与天气、MCP 旅行工具、版本恢复和日历导出。

- GitHub：[drfccv/lvji-travel](https://github.com/drfccv/lvji-travel)
- Windows 下载：[Releases](https://github.com/drfccv/lvji-travel/releases)
- Web 版：`main` 分支
- Windows Electron 版：`drfccv/electron-local` 分支

项目采用 [Apache-2.0 License](./LICENSE)。

## Windows 桌面版

Electron 桌面版将应用、SQLite 数据库和运行环境一并打包，安装后不需要额外安装 Node.js、pnpm、PostgreSQL 或其他开发工具。

### 主要功能

- 创建、编辑和删除行程，管理每日时间轴
- 使用 OpenAI-compatible 模型生成或调整旅行计划
- 支持思考模式、AI 任务进度、确认、修订、取消和重试
- 配置 12306、搜索、地图、酒店和机票等 MCP 服务
- 查询天气、导出日历、锁定安排和恢复历史版本
- 通过系统文件选择器导入、导出 JSON 行程备份
- 单实例运行、窗口状态保存和原生 Windows 安装程序

### 安装

从 [GitHub Releases](https://github.com/drfccv/lvji-travel/releases) 下载最新的 `旅迹-安装程序-*.exe`，运行安装程序并按提示完成安装。

当前安装包面向 Windows x64。首次使用时，可在应用设置中配置 AI 服务、地图、天气和 MCP 凭证。

> 未配置代码签名证书时，Windows SmartScreen 可能显示未知发布者提示。请仅从本仓库 Releases 页面下载安装包。

## 数据与安全

桌面版使用 `better-sqlite3` 和 Drizzle ORM，数据库默认位于：

```text
%APPDATA%\Lvji\data\trip-planner.db
```

应用启动时自动执行数据库迁移，并启用 SQLite 外键、WAL 和 busy timeout。

AI 与 MCP 凭证通过 Electron `safeStorage` 使用当前 Windows 账户的系统能力加密。Renderer 只能读取配置状态和脱敏值，无法取得完整密钥。普通 JSON 行程备份不包含 AI 或 MCP 凭证，换机后需要重新配置。

桌面安全配置包括：

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- 最小化 preload IPC 白名单和 Zod 参数校验
- Content Security Policy 与外部 HTTPS 域名限制
- MCP SSRF 防护、超时和响应体积限制
- 生产版本默认关闭 DevTools

## 本地开发

### 环境要求

- Windows 10/11 x64
- Node.js 22.13 或更高版本
- pnpm

### 启动桌面开发版

```powershell
git clone https://github.com/drfccv/lvji-travel.git
cd lvji-travel
git switch drfccv/electron-local
pnpm install
pnpm desktop:dev
```

### 测试与构建

```powershell
# 通用测试
pnpm test

# Electron + SQLite 集成测试
pnpm desktop:test

# 编译桌面应用
pnpm desktop:build

# 生成 Windows NSIS 安装程序
pnpm desktop:package
```

编译产物位于 `dist/`，安装程序位于 `release/`：

```text
release\旅迹-安装程序-<version>.exe
```

`desktop:dev` 和 `desktop:package` 会针对 Electron ABI 重新编译 `better-sqlite3`；`desktop:test` 会针对本机 Node.js ABI 重新编译。

## 技术架构

- UI：React 19、TypeScript、Vite
- 桌面运行时：Electron
- 本地数据：SQLite、better-sqlite3、Drizzle ORM
- Web 运行时：Next.js、PostgreSQL
- AI：OpenAI-compatible API
- 工具扩展：MCP Streamable HTTP
- 安装程序：electron-builder、NSIS

Renderer 通过受限 preload API 将请求发送给 Main 进程，Main 内的 Route dispatcher 复用行程、AI、MCP、天气、版本和用户数据 API。桌面构建使用 SQLite 运行时适配，Web 构建使用 PostgreSQL。

## 已知限制

- 当前仅提供 Windows x64 安装包。
- 行程备份不迁移已加密凭证。
- AI、地图、天气和 MCP 功能依赖用户配置的第三方服务及网络状态。
- 当前未配置自动更新服务器。

## License

Copyright © 2026 Lvji contributors.

本项目基于 [Apache License 2.0](./LICENSE) 发布。
