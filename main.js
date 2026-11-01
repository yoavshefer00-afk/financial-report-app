// The desktop app: a window with the tool's page. The page does everything on this computer, and nothing
// the page asks of the network is allowed. On each start it looks for a newer page (a few seconds at most)
// and uses it; without a connection it uses the last one it had.
"use strict";
const {app, BrowserWindow, session, shell, dialog} = require("electron");
const path = require("node:path");
const {update, currentPage} = require("./update");

const UPDATE_URL = "https://raw.githubusercontent.com/yoavshefer00-afk/financial-report-app/main/index.html";
const RECHECK_MS = 2 * 60 * 60 * 1000;
const smoke = process.argv.includes("--smoke-test");

const bundled = path.join(__dirname, "index.html");
const cacheFile = () => path.join(app.getPath("userData"), "page", "index.html");

if (!app.requestSingleInstanceLock()) app.quit();

async function start() {
  // Only the page's own file: nothing leaves this computer, and nothing is fetched into the page.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({cancel: !/^(file|devtools|data|blob):/.test(details.url)});
  });
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => callback(false));

  if (!smoke) await update(UPDATE_URL, cacheFile(), bundled);

  const win = new BrowserWindow({
    width: 1200, height: 900, title: "מחולל דוחות כספיים", autoHideMenuBar: true,
    webPreferences: {contextIsolation: true, nodeIntegration: false, sandbox: true},
  });
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({action: "deny"}));
  win.webContents.on("will-navigate", (event, url) => { if (!url.startsWith("file:")) event.preventDefault(); });
  win.webContents.on("before-input-event", (event, input) => {  // reload, to take a newer page
    if (input.type === "keyDown" && (input.key === "F5" || (input.control && input.key.toLowerCase() === "r"))) {
      event.preventDefault();
      update(UPDATE_URL, cacheFile(), bundled).finally(() => win.loadFile(currentPage(cacheFile(), bundled)));
    }
  });
  await win.loadFile(currentPage(cacheFile(), bundled));

  if (smoke) return runSmokeTest(win);
  setInterval(async () => {  // a newer page found while the app stays open is used from the next start
    await update(UPDATE_URL, cacheFile(), bundled);
  }, RECHECK_MS);
}

/** For the build: the page loads, makes its example report, and the report is there. */
async function runSmokeTest(win) {
  try {
    for (let i = 0; i < 40; i++) {
      const done = await win.webContents.executeJavaScript(
        `Boolean(document.querySelector("#result:not([hidden])")) && document.getElementById("summary").textContent.includes("הכנסות")`);
      if (done) {
        const leaked = await win.webContents.executeJavaScript(  // the page can't reach the network
          `fetch("https://example.com").then(() => true, () => false)`);
        if (leaked) { console.error("smoke test: the page reached the network"); return app.exit(1); }
        console.log("smoke test: ok");
        return app.exit(0);
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    console.error("smoke test: the page showed no report");
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
