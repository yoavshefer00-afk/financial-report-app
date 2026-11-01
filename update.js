// Keeps the newest copy of the page: fetched from the update address, kept next to the app's data, and
// used instead of the copy that came with the app. A bad download never replaces a good copy.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

/** The page at `url`. Throws an Error saying why when it can't be had in time (no connection, an error
 * answer, an odd page). */
async function fetchLatest(url, {timeout = 8000, fetchImpl = fetch} = {}) {
  let response;
  try {
    response = await fetchImpl(url, {signal: AbortSignal.timeout(timeout)});
  } catch (e) {
    const cause = e && e.cause && e.cause.message ? ` (${e.cause.message})` : "";
    throw new Error(`אין חיבור לכתובת העדכון: ${e && e.message || e}${cause}`);
  }
  if (!response.ok) throw new Error(`כתובת העדכון ענתה ${response.status}`);
  const text = await response.text();
  if (!looksLikePage(text)) throw new Error("מה שהורד מכתובת העדכון אינו דף של הכלי");
  return text;
}

/** A whole page of the tool, not an error page or a cut-off download. */
const looksLikePage = text => text.length > 100000 && text.includes("</html>") && text.includes("Report");

const read = file => { try { return fs.readFileSync(file, "utf8"); } catch (e) { return null; } };

/** The page to show: the saved copy, else the one that came with the app. */
function currentPage(cacheFile, bundledFile) {
  const cached = read(cacheFile);
  return cached && looksLikePage(cached) ? cacheFile : bundledFile;
}

/** Saves `text` as the saved copy, whole or not at all. */
function save(cacheFile, text) {
  fs.mkdirSync(path.dirname(cacheFile), {recursive: true});
  const temp = cacheFile + ".tmp";
  fs.writeFileSync(temp, text);
  fs.renameSync(temp, cacheFile);
}

/** Looks for a newer page and saves it. Returns {state: "updated" | "current" | "failed", error?}. */
async function update(url, cacheFile, bundledFile, options) {
  try {
    const latest = await fetchLatest(url, options);
    if (latest === read(currentPage(cacheFile, bundledFile))) return {state: "current"};
    save(cacheFile, latest);
    return {state: "updated"};
  } catch (e) {
    return {state: "failed", error: e.message};
  }
}

module.exports = {fetchLatest, looksLikePage, currentPage, save, update};
