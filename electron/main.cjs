// Electron main process for Stock Manager (Windows 7 x86/x64 compatible).
//
// The app is a 100% static, offline-first SPA. There is NO Nitro/node server
// and NO localhost. We simply load the pre-built frontend (dist/index.html)
// directly from the local filesystem, so the app works even with no internet.
//
// Electron Main Process
//        ↓  (loads local file: dist/index.html)
// Preload (contextIsolation: true, nodeIntegration: false)
//        ↓
// Existing React SPA (same code as Android via Capacitor)

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    // Must be a fully OPAQUE colour. A transparent alpha ("#ffffff00") makes
    // Windows composite the desktop/aero colour through the window, which is
    // what produced the yellow tint in the packaged setup build.
    backgroundColor: "#ffffff",
    show: false,

    // Remove the native Electron menu bar.
    autoHideMenuBar: true,

    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Completely remove the native menu.
  win.removeMenu();

  win.once("ready-to-show", () => win.show());

  if (!app.isPackaged) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    // Load the SPA directly from local files — no server, no localhost.
    const indexPath = path.join(__dirname, "..", "dist", "index.html");
    win.loadFile(indexPath);
  }

  return win;
}

ipcMain.handle("app:version", () => app.getVersion());
ipcMain.on("app:quit", () => app.quit());

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});