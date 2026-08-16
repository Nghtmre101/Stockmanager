// Electron preload — runs in an isolated context between the renderer and the
// main process. We deliberately do NOT expose Node.js (no `require`, no
// `process`, no `fs`) to the renderer. Only a tiny, explicit, read-only API is
// bridged via contextBridge.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  getAppVersion: () => ipcRenderer.invoke("app:version"),
  quit: () => ipcRenderer.send("app:quit"),
});