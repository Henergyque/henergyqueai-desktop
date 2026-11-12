const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("quick", {
  submit: (text) => ipcRenderer.send("quick:submit", text),
  hide: () => ipcRenderer.send("quick:hide"),
  onOpen: (listener) => ipcRenderer.on("quick:open", () => listener()),
});
