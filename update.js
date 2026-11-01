// Keeps the newest copy of the page: fetched from the update address, kept next to the app's data, and
// used instead of the copy that came with the app. A bad download never replaces a good copy.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

/** The page at `url`, or null when it can't be had in time (no connection, an error, an odd answer). */
async function fetchLatest(url, {timeout = 4000, fetchImpl = fetch} = {}) {
  try {
    const response = await fetchImpl(url, {signal: AbortSignal.timeout(timeout), cache: "no-store"});
    if (!response.ok) return null;
    const text = await response.text();
    return looksLikePage(text) ? text : null;
  } catch (e) {
    return null;
  }
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

/** Looks for a newer page; saves it and returns true if there is one. */
async function update(url, cacheFile, bundledFile, options) {
  const latest = await fetchLatest(url, options);
  if (!latest) return false;
  if (latest === read(currentPage(cacheFile, bundledFile))) return false;
  save(cacheFile, latest);
  return true;
}

module.exports = {fetchLatest, looksLikePage, currentPage, save, update};
