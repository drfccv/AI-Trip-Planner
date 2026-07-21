import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("tripPlanner", {
  request: (input: unknown) => ipcRenderer.invoke("desktop:request", input),
  exportBackup: () => ipcRenderer.invoke("desktop:backup:export"),
  importBackup: () => ipcRenderer.invoke("desktop:backup:import"),
  openDataDirectory: () => ipcRenderer.invoke("desktop:data:open"),
  about: () => ipcRenderer.invoke("desktop:about"),
  windowControls: {
    minimize: () => ipcRenderer.invoke("desktop:window", "minimize"),
    toggleMaximize: () => ipcRenderer.invoke("desktop:window", "toggleMaximize"),
    close: () => ipcRenderer.invoke("desktop:window", "close"),
    isMaximized: () => ipcRenderer.invoke("desktop:window", "isMaximized"),
    onMaximizedChange: (callback: (maximized: boolean) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized);
      ipcRenderer.on("desktop:window:maximized", handler);
      return () => ipcRenderer.removeListener("desktop:window:maximized", handler);
    },
  },
});
