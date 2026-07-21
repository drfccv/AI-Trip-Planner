import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell } from "electron";
import { dirname, join } from "node:path";
import { openDatabase, closeDatabase, databasePath } from "../../storage/sqlite/database";
import { TripService } from "../../services/trip-service";
import { SettingsService } from "../../services/settings-service";
import { AiService } from "../../services/ai-service";
import { DesktopRouter, requestSchema } from "../../services/desktop-router";
import { BackupService } from "../../services/backup-service";
let window: BrowserWindow | null = null;
const allowedHosts = new Set(["github.com", "openai.com", "www.openai.com", "modelscope.cn", "www.modelscope.cn", "amap.com", "www.amap.com", "tavily.com", "www.tavily.com", "rollinggo.cn", "www.rollinggo.cn"]);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(() => {
    app.setName("AI Trip Planner"); const userData = app.getPath("userData"), db = openDatabase(userData);
    const vault = { encrypt: (value: string) => { if (!safeStorage.isEncryptionAvailable()) throw Error("SAFE_STORAGE_UNAVAILABLE"); return safeStorage.encryptString(value).toString("base64"); }, decrypt: (value: string | null) => value ? safeStorage.decryptString(Buffer.from(value, "base64")) : "" };
    const trips = new TripService(db), settings = new SettingsService(db, vault), router = new DesktopRouter(trips, settings, new AiService(db, vault, trips)), backup = new BackupService(db, databasePath(userData));
    const state: any = db.prepare("SELECT value_json FROM app_settings WHERE key='window-state'").get(), saved = state ? JSON.parse(state.value_json) : {};
    window = new BrowserWindow({ width: saved.width || 1280, height: saved.height || 820, x: saved.x, y: saved.y, minWidth: 980, minHeight: 680, show: false, webPreferences: { preload: join(__dirname, "../preload/index.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, devTools: !app.isPackaged } });
    window.once("ready-to-show", () => window?.show()); window.on("close", () => { if (window) db.prepare("INSERT INTO app_settings(key,value_json)VALUES('window-state',?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=CURRENT_TIMESTAMP").run(JSON.stringify(window.getBounds())); });
    window.webContents.setWindowOpenHandler(({ url }) => { try { const parsed = new URL(url); if (parsed.protocol === "https:" && allowedHosts.has(parsed.hostname.toLowerCase())) void shell.openExternal(parsed.toString()); } catch {} return { action: "deny" }; }); window.webContents.on("will-navigate", event => event.preventDefault());
    ipcMain.handle("desktop:request", (_event, input) => router.handle(requestSchema.parse(input)));
    ipcMain.handle("desktop:backup:export", async () => { const result = await dialog.showSaveDialog(window!, { title: "导出行程备份", defaultPath: `ai-trip-planner-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: "JSON backup", extensions: ["json"] }], properties: ["createDirectory", "showOverwriteConfirmation"] }); if (result.canceled || !result.filePath) return { cancelled: true }; backup.exportTo(result.filePath); return { cancelled: false, path: result.filePath }; });
    ipcMain.handle("desktop:backup:import", async () => { const result = await dialog.showOpenDialog(window!, { title: "导入行程备份", filters: [{ name: "JSON backup", extensions: ["json"] }], properties: ["openFile"] }); if (result.canceled || !result.filePaths[0]) return { cancelled: true }; backup.importFrom(result.filePaths[0]); return { cancelled: false, path: result.filePaths[0] }; });
    ipcMain.handle("desktop:data:open", () => shell.openPath(dirname(databasePath(userData)))); ipcMain.handle("desktop:about", () => ({ version: app.getVersion(), license: "Apache-2.0" }));
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: "文件", submenu: [{ label: "导出备份", click: () => window?.webContents.executeJavaScript("window.tripPlanner.exportBackup()") }, { label: "导入备份", click: () => window?.webContents.executeJavaScript("window.tripPlanner.importBackup()") }, { type: "separator" }, { role: "quit", label: "退出" }] }, { label: "数据", submenu: [{ label: "打开数据目录", click: () => shell.openPath(dirname(databasePath(userData))) }] }, { label: "帮助", submenu: [{ label: "关于 AI Trip Planner", click: () => dialog.showMessageBox(window!, { type: "info", title: "关于", message: `AI Trip Planner ${app.getVersion()}`, detail: "单人本地旅行规划应用\nApache-2.0" }) }] }]));
    if (process.env.DESKTOP_RENDERER_URL) void window.loadURL(process.env.DESKTOP_RENDERER_URL); else void window.loadFile(join(__dirname, "../../renderer/index.html"));
  });
  app.on("window-all-closed", () => app.quit()); app.on("before-quit", closeDatabase);
}
