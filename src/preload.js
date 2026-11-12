// Ce que l'interface embarquée peut demander à l'application, et rien d'autre.
const { contextBridge, ipcRenderer } = require("electron");

if (location.origin === "app://henergyqueai") {
  const version = (process.argv.find((arg) => arg.startsWith("--henergyque-version=")) || "").split("=")[1] || "";

  // Une question rapide peut arriver avant que l'espace de chat soit affiché
  // (pendant la connexion, par exemple) : elle attend qu'on l'écoute.
  const waiting = { "desktop:quick-prompt": [], "desktop:new-chat": [] };
  const listeners = { "desktop:quick-prompt": new Set(), "desktop:new-chat": new Set() };
  for (const channel of Object.keys(listeners)) {
    ipcRenderer.on(channel, (event, payload) => {
      if (listeners[channel].size) listeners[channel].forEach((listener) => listener(payload));
      else waiting[channel].push(payload);
    });
  }
  const subscribe = (channel) => (listener) => {
    if (typeof listener !== "function") return () => {};
    listeners[channel].add(listener);
    waiting[channel].splice(0).forEach((payload) => listener(payload));
    return () => listeners[channel].delete(listener);
  };

  contextBridge.exposeInMainWorld("henergyqueDesktop", {
    version,
    platform: process.platform,
    transcribe: (samples, language) => ipcRenderer.invoke("desktop:transcribe", { samples, language }),
    notify: (title, body) => ipcRenderer.invoke("desktop:notify", { title, body }),
    openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url),
    setTheme: (theme) => ipcRenderer.send("desktop:theme", theme),
    // Mise à jour prête (ou à télécharger) : l'interface affiche un encart.
    onUpdate: (listener) => {
      if (typeof listener !== "function") return () => {};
      const relay = (event, state) => listener(state);
      ipcRenderer.on("desktop:update", relay);
      ipcRenderer.invoke("desktop:update-state").then((state) => state && listener(state));
      return () => ipcRenderer.removeListener("desktop:update", relay);
    },
    applyUpdate: () => ipcRenderer.send("desktop:update-apply"),
    onQuickPrompt: subscribe("desktop:quick-prompt"),
    onNewChat: subscribe("desktop:new-chat"),
  });
}
