const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const {fetchLatest, looksLikePage, currentPage, save, update} = require("../update");

const page = version => `<!doctype html><html><body>Report ${version}${"x".repeat(100000)}</body></html>`;
const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), "app-"));

async function serve(handler, run) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try { return await run(`http://127.0.0.1:${server.address().port}/index.html`); }
  finally { server.close(); }
}

test("only a whole page of the tool counts", () => {
  assert.equal(looksLikePage(page(1)), true);
  assert.equal(looksLikePage("<html>404: Not Found</html>"), false);
  assert.equal(looksLikePage(page(1).slice(0, 50000)), false);  // cut off
});

test("a newer page is saved and then used; the same page is not 'new' again", async () => {
  const d = dir(), bundled = path.join(d, "bundled.html"), cache = path.join(d, "data", "page", "index.html");
  fs.writeFileSync(bundled, page(1));
  assert.equal(currentPage(cache, bundled), bundled);
  await serve((req, res) => res.end(page(2)), async url => {
    assert.equal(await update(url, cache, bundled), true);
    assert.equal(currentPage(cache, bundled), cache);
    assert.match(fs.readFileSync(cache, "utf8"), /Report 2/);
    assert.equal(await update(url, cache, bundled), false);
  });
});

test("no connection, an error page or a slow server: the page it had stays", async () => {
  const d = dir(), bundled = path.join(d, "bundled.html"), cache = path.join(d, "page", "index.html");
  fs.writeFileSync(bundled, page(1));
  save(cache, page(2));
  assert.equal(await update("http://127.0.0.1:1/index.html", cache, bundled, {timeout: 500}), false);
  await serve((req, res) => { res.statusCode = 404; res.end("Not Found"); }, async url => {
    assert.equal(await update(url, cache, bundled), false);
  });
  await serve((req, res) => setTimeout(() => res.end(page(3)), 2000), async url => {
    assert.equal(await fetchLatest(url, {timeout: 300}), null);
  });
  assert.match(fs.readFileSync(currentPage(cache, bundled), "utf8"), /Report 2/);
});

test("a damaged saved copy is not used", () => {
  const d = dir(), bundled = path.join(d, "bundled.html"), cache = path.join(d, "index.html");
  fs.writeFileSync(bundled, page(1));
  fs.writeFileSync(cache, "<html>half");
  assert.equal(currentPage(cache, bundled), bundled);
});
