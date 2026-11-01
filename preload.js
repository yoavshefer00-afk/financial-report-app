// The one thing the page may ask of the app: to look for a newer page.
"use strict";
const {contextBridge, ipcRenderer} = require("electron");

contextBridge.exposeInMainWorld("appUpdate", {
  check: () => ipcRenderer.invoke("check-update"),
});
