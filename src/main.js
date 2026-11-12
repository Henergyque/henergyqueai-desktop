// Processus principal de l'application de bureau HenergyqueAI.
//
// L'interface (connexion et espace de chat) est embarquée dans l'application
// et servie depuis app://henergyqueai/. Seules les données passent par l'API
// du site, via le relais de proxy.js.
const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  net,
  protocol,
  screen,
  session,
  shell,
  utilityProcess,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { createApiRelay } = require("./proxy");
const { createStaticHandler } = require("./static");

const SCHEME = "app";
const APP_ORIGIN = `${SCHEME}://henergyqueai`;
const API_ORIGIN = (process.env.HENERGYQUE_API_URL || "https://henergyqueai.fr").replace(/\/$/, "");
const REPOSITORY = "Henergyque/henergyqueai-desktop";
const QUICK_SHORTCUT = "Alt+Space";
const isMac = process.platform === "darwin";

// Les tests lancent l'application dans un profil jetable.
if (process.env.HENERGYQUE_USER_DATA) app.setPath("userData", process.env.HENERGYQUE_USER_DATA);

const UI_DIR = path.join(__dirname, "..", "ui");
const MODELS_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "models")
  : path.join(__dirname, "..", "models");
const ICON = path.join(__dirname, "..", "build", "icon.png");

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  },
]);

let mainWindow = null;
let quickWindow = null;
let tray = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showMain());
  app.whenReady().then(start);
}

// ---------------------------------------------------------------- réglages

const settingsFile = () => path.join(app.getPath("userData"), "reglages.json");

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
  } catch {
    return {};
  }
}

function writeSettings(patch) {
  const next = { ...readSettings(), ...patch };
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2));
  } catch {}
  return next;
}

// La fenêtre retrouve sa place, à condition que cet écran existe encore.
function savedBounds() {
  const bounds = readSettings().window;
  if (!bounds) return { width: 1180, height: 800 };
  const visible = screen.getAllDisplays().some(({ workArea: a }) =>
    bounds.x < a.x + a.width && bounds.x + bounds.width > a.x &&
    bounds.y < a.y + a.height && bounds.y + bounds.height > a.y,
  );
  return visible ? bounds : { width: bounds.width, height: bounds.height };
}

// ---------------------------------------------------------------- démarrage

async function start() {
  const relay = createApiRelay({ apiOrigin: API_ORIGIN, fetch: (url, init) => net.fetch(url, init) });
  const serve = createStaticHandler(UI_DIR);
  protocol.handle(SCHEME, (request) => {
    const { pathname } = new URL(request.url);
    return pathname === "/api" || pathname.startsWith("/api/") ? relay(request) : serve(request);
  });

  secureSession(session.defaultSession);
  secureContents();
  registerIpc();
  Menu.setApplicationMenu(buildMenu());
  createMainWindow();
  createTray();
  globalShortcut.register(QUICK_SHORTCUT, toggleQuick);
  checkForUpdates();

  app.on("activate", () => showMain());
}

app.on("before-quit", () => {
  quitting = true;
});
app.on("will-quit", () => globalShortcut.unregisterAll());
// L'application reste dans la zone de notification quand la fenêtre est fermée.
app.on("window-all-closed", () => {
  if (!tray) app.quit();
});

// ---------------------------------------------------------------- sécurité

function fromApp(url) {
  return typeof url === "string" && (url === APP_ORIGIN || url.startsWith(APP_ORIGIN + "/"));
}

function secureSession(ses) {
  const allowed = new Set(["media", "clipboard-sanitized-write", "fullscreen"]);
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    if (!fromApp(details.requestingUrl) || !allowed.has(permission)) return callback(false);
    // Le micro, oui ; la caméra, non.
    if (permission === "media") return callback((details.mediaTypes || []).every((type) => type === "audio"));
    callback(true);
  });
  ses.setPermissionCheckHandler((contents, permission, origin) => fromApp(origin) && allowed.has(permission));
}

function openExternal(url) {
  try {
    const { protocol: scheme } = new URL(url);
    if (["https:", "http:", "mailto:"].includes(scheme)) shell.openExternal(url);
  } catch {}
}

// Une page hors de l'application s'ouvre dans le navigateur par défaut.
function secureContents() {
  app.on("web-contents-created", (event, contents) => {
    contents.on("will-navigate", (navigation) => {
      if (fromApp(navigation.url) || navigation.url.startsWith("file:")) return;
      navigation.preventDefault();
      openExternal(navigation.url);
    });
    contents.setWindowOpenHandler(({ url }) => {
      openExternal(fromApp(url) ? API_ORIGIN + new URL(url).pathname : url);
      return { action: "deny" };
    });
  });
}

// ---------------------------------------------------------------- fenêtres

// Couleurs de la fenêtre, alignées sur le thème pixel de l'interface.
const THEMES = {
  light: { background: "#f4ead6", symbol: "#2b1d18" },
  dark: { background: "#171a18", symbol: "#ecebe3" },
};
const TITLE_BAR_HEIGHT = 44;
const overlayFor = (theme) => ({
  color: THEMES[theme].background,
  symbolColor: THEMES[theme].symbol,
  height: TITLE_BAR_HEIGHT,
});

function applyTheme(theme) {
  if (!THEMES[theme] || !mainWindow) return;
  writeSettings({ theme });
  mainWindow.setBackgroundColor(THEMES[theme].background);
  if (!isMac) mainWindow.setTitleBarOverlay(overlayFor(theme));
}

function createMainWindow() {
  const bounds = savedBounds();
  const theme = THEMES[readSettings().theme] ? readSettings().theme : "light";
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 720,
    minHeight: 520,
    show: false,
    title: "HenergyqueAI",
    backgroundColor: THEMES[theme].background,
    icon: isMac ? undefined : ICON,
    autoHideMenuBar: true,
    // La barre de titre fait partie de l'interface : sur Mac, les pastilles
    // se posent en haut de la barre latérale ; sous Windows, les boutons
    // natifs se dessinent sur l'en-tête, aux couleurs du thème.
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    ...(isMac ? { trafficLightPosition: { x: 16, y: 15 } } : { titleBarOverlay: overlayFor(theme) }),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
      additionalArguments: [`--henergyque-version=${app.getVersion()}`],
    },
  });
  if (readSettings().maximized) mainWindow.maximize();
  mainWindow.loadURL(`${APP_ORIGIN}/app`);

  const hidden = process.argv.includes("--hidden") || app.getLoginItemSettings().wasOpenedAsHidden;
  mainWindow.once("ready-to-show", () => {
    if (!hidden) mainWindow.show();
  });

  const remember = () => {
    if (!mainWindow || mainWindow.isMinimized()) return;
    writeSettings({
      maximized: mainWindow.isMaximized(),
      ...(mainWindow.isMaximized() ? {} : { window: mainWindow.getBounds() }),
    });
  };
  mainWindow.on("resized", remember);
  mainWindow.on("moved", remember);
  mainWindow.on("maximize", remember);
  mainWindow.on("unmaximize", remember);
  mainWindow.on("close", (event) => {
    remember();
    if (quitting || !tray) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function showMain() {
  if (!mainWindow) createMainWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function sendToMain(channel, payload) {
  showMain();
  const deliver = () => mainWindow.webContents.send(channel, payload);
  if (mainWindow.webContents.isLoading()) mainWindow.webContents.once("did-finish-load", deliver);
  else deliver();
}

// La question rapide : une petite fenêtre au centre de l'écran, appelée par
// le raccourci global, comme une barre de recherche.
function createQuickWindow() {
  quickWindow = new BrowserWindow({
    width: 640,
    height: 76,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#fbf5e9",
    title: "Question rapide",
    webPreferences: {
      preload: path.join(__dirname, "quick-preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  quickWindow.loadFile(path.join(__dirname, "quick.html"));
  quickWindow.on("blur", () => quickWindow?.hide());
  quickWindow.on("closed", () => {
    quickWindow = null;
  });
}

function toggleQuick() {
  if (!quickWindow) createQuickWindow();
  if (quickWindow.isVisible()) return quickWindow.hide();
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const [width, height] = quickWindow.getSize();
  quickWindow.setPosition(
    Math.round(workArea.x + (workArea.width - width) / 2),
    Math.round(workArea.y + workArea.height * 0.28),
  );
  const reveal = () => {
    quickWindow.show();
    quickWindow.focus();
    quickWindow.webContents.send("quick:open");
  };
  if (quickWindow.webContents.isLoading()) quickWindow.webContents.once("did-finish-load", reveal);
  else reveal();
}

// ---------------------------------------------------------------- menus

function buildMenu() {
  const edit = {
    label: "Édition",
    submenu: [
      { role: "undo", label: "Annuler" },
      { role: "redo", label: "Rétablir" },
      { type: "separator" },
      { role: "cut", label: "Couper" },
      { role: "copy", label: "Copier" },
      { role: "paste", label: "Coller" },
      { role: "selectAll", label: "Tout sélectionner" },
    ],
  };
  const view = {
    label: "Affichage",
    submenu: [
      { role: "reload", label: "Actualiser" },
      { type: "separator" },
      { role: "resetZoom", label: "Taille réelle" },
      { role: "zoomIn", label: "Agrandir" },
      { role: "zoomOut", label: "Réduire" },
      { type: "separator" },
      { role: "togglefullscreen", label: "Plein écran" },
      ...(app.isPackaged ? [] : [{ role: "toggleDevTools", label: "Outils de développement" }]),
    ],
  };
  const conversation = {
    label: "Conversation",
    submenu: [
      { label: "Nouvelle conversation", accelerator: "CmdOrCtrl+N", click: () => sendToMain("desktop:new-chat") },
      { label: "Question rapide", accelerator: QUICK_SHORTCUT, registerAccelerator: false, click: toggleQuick },
    ],
  };
  const help = {
    label: "Aide",
    submenu: [
      { label: "Centre d'aide", click: () => openExternal(`${API_ORIGIN}/documentation`) },
      { label: "Nouveautés", click: () => openExternal(`${API_ORIGIN}/notes`) },
      { label: "Confidentialité", click: () => openExternal(`${API_ORIGIN}/confidentialite`) },
    ],
  };
  const template = isMac
    ? [
        {
          label: app.name,
          submenu: [
            { role: "about", label: "À propos de HenergyqueAI" },
            { type: "separator" },
            { role: "hide", label: "Masquer HenergyqueAI" },
            { role: "hideOthers", label: "Masquer les autres" },
            { role: "unhide", label: "Tout afficher" },
            { type: "separator" },
            { role: "quit", label: "Quitter HenergyqueAI" },
          ],
        },
        conversation,
        edit,
        view,
        { role: "windowMenu", label: "Fenêtre" },
        help,
      ]
    : [
        { label: "Fichier", submenu: [...conversation.submenu, { type: "separator" }, { label: "Quitter", accelerator: "Ctrl+Q", click: quit }] },
        edit,
        view,
        help,
      ];
  return Menu.buildFromTemplate(template);
}

function quit() {
  quitting = true;
  app.quit();
}

// Le papillon seul ; tray@2x.png sert automatiquement sur les écrans haute densité.
function trayIcon() {
  return nativeImage.createFromPath(path.join(__dirname, "..", "build", "tray.png"));
}

function createTray() {
  try {
    tray = new Tray(trayIcon());
  } catch {
    tray = null;
    return;
  }
  tray.setToolTip("HenergyqueAI");
  const refresh = () =>
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Ouvrir HenergyqueAI", click: showMain },
        { label: "Nouvelle conversation", click: () => sendToMain("desktop:new-chat") },
        { label: "Question rapide", accelerator: QUICK_SHORTCUT, registerAccelerator: false, click: toggleQuick },
        { type: "separator" },
        {
          label: "Lancer au démarrage",
          type: "checkbox",
          checked: app.getLoginItemSettings().openAtLogin,
          click: (item) => {
            app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true, args: ["--hidden"] });
            refresh();
          },
        },
        { type: "separator" },
        { label: "Quitter", click: quit },
      ]),
    );
  refresh();
  if (!isMac) tray.on("click", showMain);
}

// ---------------------------------------------------------------- échanges avec l'interface

function trusted(event) {
  return fromApp(event.senderFrame?.url);
}

function registerIpc() {
  ipcMain.handle("desktop:notify", (event, { title, body } = {}) => {
    if (!trusted(event) || !Notification.isSupported()) return false;
    const notice = new Notification({
      title: String(title || "HenergyqueAI").slice(0, 120),
      body: String(body || "").slice(0, 300),
      icon: isMac ? undefined : ICON,
    });
    notice.on("click", showMain);
    notice.show();
    return true;
  });

  ipcMain.on("desktop:theme", (event, theme) => {
    if (trusted(event)) applyTheme(theme === "dark" ? "dark" : "light");
  });

  ipcMain.handle("desktop:open-external", (event, url) => {
    if (!trusted(event)) return false;
    openExternal(String(url).startsWith("/") ? API_ORIGIN + url : String(url));
    return true;
  });

  ipcMain.handle("desktop:transcribe", (event, { samples, language } = {}) => {
    if (!trusted(event)) throw new Error("Origine refusée.");
    if (!(samples instanceof Float32Array) || samples.length < 1600) return "";
    // 30 secondes au plus par morceau, la limite du modèle.
    return transcriber.run(samples.subarray(0, 16000 * 30), language === "english" ? "english" : "french");
  });

  ipcMain.on("quick:submit", (event, text) => {
    if (!event.senderFrame?.url.startsWith("file:")) return;
    const prompt = String(text || "").trim().slice(0, 12000);
    quickWindow?.hide();
    if (prompt) sendToMain("desktop:quick-prompt", prompt);
  });
  ipcMain.on("quick:hide", () => quickWindow?.hide());
}

// ---------------------------------------------------------------- transcription locale

const transcriber = {
  child: null,
  next: 0,
  pending: new Map(),
  spawn() {
    this.child = utilityProcess.fork(path.join(__dirname, "transcriber.js"), [], {
      serviceName: "Transcription HenergyqueAI",
      env: { ...process.env, HENERGYQUE_MODELS: MODELS_DIR },
    });
    this.child.on("message", ({ id, text, error }) => {
      const job = this.pending.get(id);
      if (!job) return;
      this.pending.delete(id);
      error ? job.reject(new Error(error)) : job.resolve(text);
    });
    this.child.on("exit", () => {
      this.child = null;
      for (const job of this.pending.values()) job.reject(new Error("La transcription s'est arrêtée."));
      this.pending.clear();
    });
  },
  run(samples, language) {
    if (!this.child) this.spawn();
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.postMessage({ id, samples, language });
    });
  },
};

// ---------------------------------------------------------------- mises à jour

function newer(latest, current) {
  const parse = (value) => String(value).replace(/^v/, "").split(".").map((part) => parseInt(part, 10) || 0);
  const [a, b] = [parse(latest), parse(current)];
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return false;
}

async function checkForUpdates() {
  if (!app.isPackaged || process.env.HENERGYQUE_NO_UPDATES) return;
  // Windows se met à jour tout seul ; sur Mac, sans signature Apple, on
  // propose simplement le téléchargement de la nouvelle version.
  if (process.platform === "win32") {
    try {
      const { autoUpdater } = require("electron-updater");
      autoUpdater.on("update-downloaded", async () => {
        const { response } = await dialog.showMessageBox({
          type: "info",
          buttons: ["Redémarrer", "Plus tard"],
          defaultId: 0,
          cancelId: 1,
          title: "Mise à jour prête",
          message: "Une nouvelle version de HenergyqueAI est prête.",
          detail: "Elle sera installée au prochain redémarrage de l'application.",
        });
        if (response === 0) {
          quitting = true;
          autoUpdater.quitAndInstall();
        }
      });
      await autoUpdater.checkForUpdates();
    } catch {}
    return;
  }
  try {
    const response = await net.fetch(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return;
    const { tag_name: tag } = await response.json();
    if (!newer(tag, app.getVersion()) || readSettings().skippedVersion === tag) return;
    const { response: choice } = await dialog.showMessageBox({
      type: "info",
      buttons: ["Télécharger", "Plus tard", "Ignorer cette version"],
      defaultId: 0,
      cancelId: 1,
      title: "Nouvelle version",
      message: `HenergyqueAI ${tag.replace(/^v/, "")} est disponible.`,
      detail: "Téléchargez-la puis remplacez l'application dans le dossier Applications.",
    });
    if (choice === 0) openExternal(`${API_ORIGIN}/telecharger`);
    if (choice === 2) writeSettings({ skippedVersion: tag });
  } catch {}
}

module.exports = { newer };
