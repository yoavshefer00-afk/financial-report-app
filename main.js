// The desktop app: a window with the tool's page. The page does everything on this computer, and nothing
// the page asks of the network is allowed. On each start it looks for a newer page (a few seconds at most)
// and uses it; without a connection it uses the last one it had.
"use strict";
const {app, BrowserWindow, session, net, dialog, ipcMain, shell} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const {update, currentPage} = require("./update");

const TITLE = "מחולל דוחות כספיים";

const UPDATE_URL = "https://raw.githubusercontent.com/yoavshefer00-afk/financial-report-app/main/index.html";
const RECHECK_MS = 2 * 60 * 60 * 1000;
const smoke = process.argv.includes("--smoke-test");

const bundled = path.join(__dirname, "index.html");
let win = null;
const cacheFile = () => path.join(app.getPath("userData"), "page", "index.html");

// The network calls go through Electron's own (Chromium's), which uses the computer's proxy and certificates.
const check = () => update(UPDATE_URL, cacheFile(), bundled, {fetchImpl: (url, options) => net.fetch(url, options)});

/** What the title bar says about the last check, and a line in update.log for whoever looks into it. */
function describe(result) {
  const line = {updated: "נטענה גרסה חדשה", current: "הגרסה העדכנית",
                failed: "לא הצלחתי לבדוק עדכון: " + result.error}[result.state];
  try {
    fs.appendFileSync(path.join(app.getPath("userData"), "update.log"), `${new Date().toISOString()} ${line}\n`);
  } catch (e) { /* the log is only a help */ }
  return line;
}

if (!app.requestSingleInstanceLock()) app.quit();

async function start() {
  // The page's own session: only its own file, so nothing leaves this computer and nothing is fetched into
  // the page. (The update check uses the default session, which is open.)
  const pageSession = session.fromPartition("report-page");
  pageSession.webRequest.onBeforeRequest((details, callback) => {
    callback({cancel: !/^(file|devtools|data|blob):/.test(details.url)});
  });
  pageSession.setPermissionRequestHandler((wc, permission, callback) => callback(false));
  // A report saved from the page opens in Excel when the save is done.
  pageSession.on("will-download", (event, item) => {
    item.once("done", (e, state) => {
      const file = item.getSavePath();
      if (state === "completed" && /\.xlsx$/i.test(file)) shell.openPath(file);
    });
  });

  const first = smoke ? {state: "current"} : await check();

  win = new BrowserWindow({
    width: 1200, height: 900, title: TITLE, autoHideMenuBar: true,
    webPreferences: {contextIsolation: true, nodeIntegration: false, sandbox: true, session: pageSession,
      preload: path.join(__dirname, "preload.js")},
  });
  win.setMenu(null);
  const say = result => win.setTitle(`${TITLE} · ${describe(result)}`);
  // The page's "בדיקת עדכון" button: look now, and show the newer page if there is one.
  ipcMain.handle("check-update", async event => {
    if (!event.senderFrame || !event.senderFrame.url.startsWith("file:")) return null;
    const result = await check();
    say(result);
    if (result.state === "updated") setTimeout(() => win.loadFile(currentPage(cacheFile(), bundled)), 800);
    return result;
  });
  win.on("page-title-updated", event => event.preventDefault());  // the title says how the update went
  win.webContents.setWindowOpenHandler(() => ({action: "deny"}));
  win.webContents.on("will-navigate", (event, url) => { if (!url.startsWith("file:")) event.preventDefault(); });
  win.webContents.on("before-input-event", (event, input) => {  // reload, to take a newer page
    if (input.type === "keyDown" && (input.key === "F5" || (input.control && input.key.toLowerCase() === "r"))) {
      event.preventDefault();
      check().then(result => { say(result); return win.loadFile(currentPage(cacheFile(), bundled)); });
    }
  });
  say(first);
  await win.loadFile(currentPage(cacheFile(), bundled));

  if (smoke) return runSmokeTest(win);
  setInterval(async () => {  // a newer page found while the app stays open is used from the next start
    const result = await check();
    if (result.state === "updated") win.setTitle(`${TITLE} · יש גרסה חדשה: F5 לטעינה`);
  }, RECHECK_MS);
}

/** For the build: the page opens on its first screen, can write an Excel file, and can't reach the network. */
async function runSmokeTest(win) {
  try {
    const works = await win.webContents.executeJavaScript(`(async () => {
      if (document.getElementById("screen-setup").hidden || !document.getElementById("make")) return false;
      if (typeof appUpdate.check !== "function" || document.getElementById("update-box").hidden) return false;
      const book = new ExcelJS.Workbook();
      book.addWorksheet("a").addRow([1]);
      return (await book.xlsx.writeBuffer()).byteLength > 1000 && typeof Report.makeReport === "function";
    })()`);
    if (!works) { console.error("smoke test: the page did not come up"); return app.exit(1); }
    const leaked = await win.webContents.executeJavaScript(  // the page can't reach the network
      `fetch("https://example.com").then(() => true, () => false)`);
    if (leaked) { console.error("smoke test: the page reached the network"); return app.exit(1); }
    console.log("smoke test: ok");
    return app.exit(0);
  } catch (e) {
    console.error("smoke test:", e);
  }
  app.exit(1);
}

app.whenReady().then(start).catch(e => {
  dialog.showErrorBox("מחולל דוחות כספיים", String(e && e.message || e));
  app.exit(1);
});
app.on("window-all-closed", () => app.quit());
