import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell } from "electron";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { z } from "zod";
import { openDesktopDatabase, closeDesktopDatabase, databasePath, getSqlite } from "../runtime/database";
import { dispatch } from "../runtime/routes";
import { exportTrips, importTrips } from "../runtime/backup";
import { hydrateIntegrations } from "../runtime/integrations-route";
let mainWindow: BrowserWindow | null = null;
const token = randomBytes(32).toString("hex"); let origin = "";
const inputSchema = z.object({ path: z.string().regex(/^\/api\/[A-Za-z0-9_/?=&.%\-]+$/).max(500), method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]), body: z.unknown().optional() });
const windowActionSchema = z.enum(["minimize", "toggleMaximize", "close", "isMaximized"]);
const requestFor = (value: z.infer<typeof inputSchema>) => new Request(origin + value.path, { method: value.method, headers: { "content-type": "application/json", "x-desktop-runtime": "1", "x-desktop-token": token }, body: value.method === "GET" ? undefined : JSON.stringify(value.body ?? {}) });
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { mainWindow?.restore(); mainWindow?.focus(); });
  app.whenReady().then(async () => {
    app.setName("旅迹");
    app.setPath("userData", join(app.getPath("appData"), "Lvji"));
    openDesktopDatabase(app.getPath("userData"), join(app.getAppPath(), "drizzle"));
    const sqlite = getSqlite(); sqlite.exec("CREATE TABLE IF NOT EXISTS desktop_preferences(key TEXT PRIMARY KEY,value_json TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"); const saved = sqlite.prepare("SELECT value_json FROM desktop_preferences WHERE key='window'").get() as { value_json?: string } | undefined; const bounds = saved?.value_json ? JSON.parse(saved.value_json) : {};
    (globalThis as typeof globalThis & { __desktopSecretStore?: unknown }).__desktopSecretStore = { encrypt(value: string) { if (!safeStorage.isEncryptionAvailable()) throw Error("SAFE_STORAGE_UNAVAILABLE"); return "safe:" + safeStorage.encryptString(value).toString("base64"); }, decrypt(value: string) { return safeStorage.decryptString(Buffer.from(value.replace(/^safe:/, ""), "base64")); } }; hydrateIntegrations();
    const server = createServer(async (incoming, outgoing) => { if (incoming.headers["x-desktop-token"] !== token) { outgoing.writeHead(403).end(); return; } const chunks: Buffer[] = []; for await (const chunk of incoming) chunks.push(chunk as Buffer); const request = new Request(origin + (incoming.url || "/"), { method: incoming.method, headers: incoming.headers as HeadersInit, body: incoming.method === "GET" ? undefined : Buffer.concat(chunks) }); const response = await dispatch(request); outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer())); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); if (!address || typeof address === "string") throw Error("DESKTOP_SERVER_FAILED"); origin = `http://127.0.0.1:${address.port}`;
    ipcMain.handle("desktop:request", async (_event, raw) => { const response = await dispatch(requestFor(inputSchema.parse(raw))); return { status: response.status, data: await response.json().catch(() => ({})) }; });
    const exportBackup = async () => { const result = await dialog.showSaveDialog({ title: "导出行程备份", defaultPath: `ai-trip-planner-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: "JSON", extensions: ["json"] }], properties: ["createDirectory", "showOverwriteConfirmation"] }); if (!result.canceled && result.filePath) exportTrips(sqlite, result.filePath); return { cancelled: result.canceled, path: result.filePath }; };
    const importBackup = async () => { const result = await dialog.showOpenDialog({ title: "导入行程备份", filters: [{ name: "JSON", extensions: ["json"] }], properties: ["openFile"] }); if (!result.canceled && result.filePaths[0]) importTrips(sqlite, databasePath(app.getPath("userData")), result.filePaths[0]); return { cancelled: result.canceled, path: result.filePaths[0] }; };
    ipcMain.handle("desktop:backup:export", exportBackup); ipcMain.handle("desktop:backup:import", importBackup); ipcMain.handle("desktop:data:open", () => shell.openPath(dirname(databasePath(app.getPath("userData"))))); ipcMain.handle("desktop:about", () => ({ version: app.getVersion(), license: "Apache-2.0" }));
    ipcMain.handle("desktop:window", (event, raw) => {
      const action = windowActionSchema.parse(raw);
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window || window !== mainWindow) throw new Error("WINDOW_NOT_ALLOWED");
      if (action === "minimize") window.minimize();
      if (action === "toggleMaximize") {
        if (window.isMaximized()) window.unmaximize();
        else window.maximize();
      }
      if (action === "close") window.close();
      return window.isMaximized();
    });
    mainWindow = new BrowserWindow({ width: bounds.width || 1280, height: bounds.height || 820, x: bounds.x, y: bounds.y, minWidth: 980, minHeight: 680, frame: false, autoHideMenuBar: true, backgroundColor: "#f5f5f7", icon: join(app.getAppPath(), "desktop/assets/icon.png"), show: false, webPreferences: { preload: join(__dirname, "../preload/index.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, devTools: !app.isPackaged } });
    const publishWindowState = () => mainWindow?.webContents.send("desktop:window:maximized", mainWindow.isMaximized());
    mainWindow.on("maximize", publishWindowState); mainWindow.on("unmaximize", publishWindowState);
    if (bounds.maximized) mainWindow.maximize();
    mainWindow.once("ready-to-show", () => mainWindow?.show());
    mainWindow.on("close", () => { if (mainWindow) sqlite.prepare("INSERT INTO desktop_preferences(key,value_json)VALUES('window',?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=CURRENT_TIMESTAMP").run(JSON.stringify({ ...mainWindow.getNormalBounds(), maximized: mainWindow.isMaximized() })); });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => { try { const target = new URL(url); if (target.protocol === "https:" && ["github.com", "openai.com", "modelscope.cn", "amap.com", "tavily.com", "rollinggo.cn"].some(host => target.hostname === host || target.hostname.endsWith("." + host))) void shell.openExternal(target.toString()); } catch {} return { action: "deny" }; });
    mainWindow.webContents.on("will-navigate", (event, url) => { try { if (new URL(url).protocol !== "file:") event.preventDefault(); } catch { event.preventDefault(); } });
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html")); mainWindow.show();
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: "文件", submenu: [{ label: "导出备份", click: () => void exportBackup() }, { label: "导入备份", click: () => void importBackup() }, { type: "separator" }, { role: "quit", label: "退出" }] }, { label: "数据", submenu: [{ label: "打开数据目录", click: () => void shell.openPath(dirname(databasePath(app.getPath("userData")))) }] }, { label: "帮助", submenu: [{ label: "关于旅迹", click: () => void dialog.showMessageBox({ type: "info", title: "关于旅迹", message: `旅迹 ${app.getVersion()}`, detail: "Apache-2.0" }) }] }]));
    app.on("before-quit", () => { server.close(); closeDesktopDatabase(); });
  }).catch(error => { console.error("Desktop startup failed:", error instanceof Error ? error.message : "UNKNOWN"); app.quit(); });
  app.on("window-all-closed", () => app.quit());
}
