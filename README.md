# 旅迹

本仓库 `main` 分支维护 Web/Cloudflare 版；`drfccv/electron-local` 分支维护可安装的 Windows Electron 单机版。项目采用 Apache-2.0 License。

## Electron 本地版

桌面版复用现有 React UI 和全部 API Route 业务能力。Renderer 通过最小 preload 白名单 IPC 调用可信 Main 进程；Main 中的 Route dispatcher 复用 Trips、AI Jobs、MCP、天气、版本和用户数据 API。桌面构建通过专用入口把数据库依赖切换为 `better-sqlite3` + Drizzle，Web 构建仍使用 D1。

安全配置包括 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、CSP、IPC Zod 校验、外部 HTTPS 域名白名单和既有 MCP SSRF 防护。生产版默认关闭 DevTools。

## 数据与凭证

数据库位于：

```text
%APPDATA%\Lvji\data\trip-planner.db
```

启动时自动执行 Drizzle migrations，并启用外键、WAL 和 busy timeout。应用使用单实例锁，退出时关闭连接。

AI 与 MCP 凭证由 Electron `safeStorage` 使用当前 Windows 账户能力加密，SQLite 仅保存密文。Renderer 只能读取已配置状态与掩码，不能读取完整密钥。`safeStorage` 适合个人本地应用，但不等同于服务器级密钥隔离。

普通 JSON 行程备份不包含 AI/MCP 凭证。导入前会验证格式并在数据目录自动保留当前数据库副本。导入和导出路径只通过系统文件选择器选择。

## 开发

需要 Node.js 22.13+ 与 pnpm：

```powershell
pnpm install
pnpm desktop:dev
```

常用命令：

```powershell
pnpm test
pnpm lint
pnpm desktop:test
pnpm desktop:build
pnpm desktop:package
```

`desktop:dev` 会针对 Electron ABI rebuild SQLite 原生模块。`desktop:test` 会针对本机 Node ABI rebuild。`desktop:package` 使用 electron-builder 再次针对 Electron ABI rebuild，并生成 Windows NSIS 安装程序。

安装后的程序包含 Electron 与 SQLite 运行时，不要求用户安装 Node.js、pnpm、Wrangler 或 Miniflare。

## 桌面功能

- 行程列表、创建、编辑、删除和每日时间轴
- preview → apply、revision 冲突、idempotencyKey、锁定保护和版本恢复
- OpenAI-compatible Provider、思考模式、AI Job、确认/修订/取消/重试
- MCP 配置、连接测试、工具发现、调用轨迹和自定义公开 HTTPS Server
- 天气、日历导出、应用菜单、窗口状态、单实例和数据目录入口
- 系统文件选择器驱动的 JSON 备份导出与安全恢复

## Windows 安装

执行 `pnpm desktop:package` 后，NSIS 安装程序位于 `release` 目录。当前没有配置自动更新服务器。

## 已知限制

- 普通备份不迁移凭证，换机后需要重新配置密钥。
- AI、地图、天气和 MCP 在线功能取决于用户配置服务的网络可用性。
- 当前安装包使用 Electron 默认图标，尚未配置代码签名证书。

## License

Apache-2.0，详见 [LICENSE](./LICENSE)。
