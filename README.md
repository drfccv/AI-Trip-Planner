# AI Trip Planner（旅迹）

AI Trip Planner 是一个 Apache-2.0 许可的旅行规划应用。本分支 `drfccv/electron-local` 提供 Windows Electron 单机版；GitHub `main` 分支继续维护 Web/Cloudflare 版，两者不会合并运行时数据。

## 本地桌面架构

Renderer 复用现有 React UI，通过可替换的 Client/transport 接口调用最小权限 preload。Preload 仅暴露白名单方法；Electron Main 负责 Zod 输入校验、业务 Service、SQLite、AI/MCP 网络请求、系统文件选择器和 `safeStorage`。React 组件不接触 Electron、Node 文件 API、SQLite 连接或完整密钥。

桌面窗口启用 `contextIsolation`、`sandbox` 和 `webSecurity`，关闭 Node integration；生产版默认禁用 DevTools。外部链接仅允许 HTTPS 白名单域名。MCP URL 继续阻止回环、私网、链路本地和云元数据地址。

## 数据和密钥

Windows 数据库默认位于：

```text
%APPDATA%\AI Trip Planner\data\trip-planner.db
```

数据库启用外键、WAL 和 busy timeout，启动时在 transaction 中自动执行未应用 migration。应用使用单实例锁，退出时关闭连接。

API Key 由 Electron Main 使用 `safeStorage` 加密后写入 SQLite。Windows 下它使用当前系统账户的保护能力。Renderer 只读取“已配置”和掩码，不会收到完整密钥。`safeStorage` 适合个人本地应用，但不等同于服务器级的密钥隔离；能控制当前 Windows 账户及应用进程的主体仍可能访问数据。

普通 JSON 行程备份不包含 AI/MCP 密钥。导入前会验证格式并自动复制当前数据库作为安全备份，路径只由系统文件选择器决定。

## 从源码运行

要求 Node.js 22.13+ 与 pnpm：

```powershell
pnpm install
pnpm rebuild better-sqlite3
pnpm desktop:dev
```

桌面命令：

```powershell
pnpm desktop:test
pnpm desktop:build
pnpm desktop:package
```

`desktop:package` 使用 electron-builder 生成 Windows NSIS 安装包，并针对 Electron ABI rebuild `better-sqlite3`。安装后的应用自带运行时，不要求用户安装 Node.js、pnpm、Wrangler 或 Miniflare。

Web 版仍可使用原有 `pnpm dev`、`pnpm test` 和 `pnpm build` 命令；桌面正式运行时不启动 Web Worker、不读取 D1，也不使用托管身份 Header。

## 桌面功能

- 行程列表、创建、编辑、删除、时间轴和日历导出
- preview → apply、乐观并发、幂等重放、版本快照和锁定保护
- OpenAI-compatible Provider、模型及思考模式
- 本地 AI Job 状态、方案确认、结构化变更与取消
- MCP 配置、连接测试、工具发现和 SSRF 防护
- 窗口状态、单实例、应用菜单、数据目录入口和关于页
- JSON 行程备份导出与验证恢复

## Windows 安装

运行 `pnpm desktop:package` 后，在 `release` 目录找到 NSIS 安装程序。安装后从开始菜单或桌面快捷方式启动。卸载应用不会主动删除用户数据目录，便于重新安装后恢复。

## 已知限制

- 当前不包含自动更新服务。
- 普通行程备份不包含凭证；换机后需重新填写密钥。
- 自定义外部网页不会在应用内打开，只有明确白名单链接可交给系统浏览器。
- AI 与 MCP 在线能力仍要求用户自己的 Provider/服务可访问。

## License

Apache-2.0。详见 [LICENSE](./LICENSE)。
