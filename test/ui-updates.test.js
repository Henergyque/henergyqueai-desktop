const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createUiUpdates, verifyManifest, sha256 } = require("../src/ui-updates");

const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
const signed = (manifest) => {
  const raw = JSON.stringify(manifest);
  return { raw, signature: crypto.sign(null, Buffer.from(raw), privateKey).toString("base64") };
};

// Un faux site qui publie une interface.
function site(files, { version = 200, minShell = "1.0.0", tamper } = {}) {
  const hashes = Object.fromEntries(Object.entries(files).map(([name, body]) => [name, sha256(Buffer.from(body))]));
  const { raw, signature } = signed({ version, minShell, files: hashes });
  const byHash = Object.fromEntries(Object.entries(files).map(([name, body]) => [hashes[name], body]));
  const requests = [];
  const fetch = async (url) => {
    requests.push(url);
    const { pathname } = new URL(url);
    if (pathname === "/bureau/manifest.json") return new Response(raw);
    if (pathname === "/bureau/manifest.sig") return new Response(signature);
    const hash = pathname.split("/").pop();
    if (byHash[hash] === undefined) return new Response("", { status: 404 });
    return new Response(tamper === hash ? "altéré" : byHash[hash]);
  };
  return { fetch, requests, hashes };
}

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "henergyque-ui-"));
const files = { "desktop.html": "<html>nouvelle</html>", "assets/app.js": "console.log(1)" };

test("seul un manifeste signé par la bonne clé est accepté", () => {
  const { raw, signature } = signed({ version: 2, minShell: "1.0.0", files: { "desktop.html": "a".repeat(64) } });
  assert.ok(verifyManifest(raw, signature, pem));
  assert.equal(verifyManifest(raw.replace('"version":2', '"version":3'), signature, pem), null);
  const other = crypto.generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
  assert.equal(verifyManifest(raw, signature, other), null);
  const escape = signed({ version: 2, minShell: "1.0.0", files: { "desktop.html": "a".repeat(64), "../main.js": "b".repeat(64) } });
  assert.equal(verifyManifest(escape.raw, escape.signature, pem), null);
});

test("une interface plus récente est téléchargée puis servie au démarrage suivant", async () => {
  const dir = tempDir();
  const remote = site(files);
  const first = createUiUpdates({ dir, bundledVersion: 100, shellVersion: "1.0.2", origin: "https://site.test", fetch: remote.fetch, publicKey: pem });
  first.load();
  assert.equal(first.resolve("desktop.html"), null, "rien avant le téléchargement");
  assert.equal(await first.check(), 200);
  assert.equal(first.resolve("desktop.html"), null, "la session en cours garde son interface");

  const next = createUiUpdates({ dir, bundledVersion: 100, shellVersion: "1.0.2", origin: "https://site.test", fetch: remote.fetch, publicKey: pem });
  next.load();
  assert.equal(next.version, 200);
  assert.equal(fs.readFileSync(next.resolve("desktop.html"), "utf8"), "<html>nouvelle</html>");
  assert.equal(next.resolve("assets/inconnu.js"), null);

  // Déjà à jour : aucun fichier n'est retéléchargé.
  remote.requests.length = 0;
  assert.equal(await next.check(), null);
  assert.ok(remote.requests.every((url) => url.includes("/manifest.")));
});

test("rien n'est installé si un fichier ne correspond pas à son empreinte", async () => {
  const dir = tempDir();
  const clean = site(files);
  const remote = site(files, { tamper: clean.hashes["assets/app.js"] });
  const updates = createUiUpdates({ dir, bundledVersion: 100, shellVersion: "1.0.2", origin: "https://site.test", fetch: remote.fetch, publicKey: pem });
  updates.load();
  await assert.rejects(updates.check(), /altéré/);
  const next = createUiUpdates({ dir, bundledVersion: 100, shellVersion: "1.0.2", origin: "https://site.test", fetch: remote.fetch, publicKey: pem });
  assert.equal(next.load(), null);
});

test("une interface qui demande une application plus récente est ignorée", async () => {
  const dir = tempDir();
  const remote = site(files, { minShell: "2.0.0" });
  const updates = createUiUpdates({ dir, bundledVersion: 100, shellVersion: "1.0.2", origin: "https://site.test", fetch: remote.fetch, publicKey: pem });
  updates.load();
  assert.equal(await updates.check(), null);
  assert.equal(updates.load(), null);
});

test("une interface écartée laisse place à celle livrée avec l'application", async () => {
  const dir = tempDir();
  const remote = site(files);
  const updates = createUiUpdates({ dir, bundledVersion: 100, shellVersion: "1.0.2", origin: "https://site.test", fetch: remote.fetch, publicKey: pem });
  updates.load();
  await updates.check();
  updates.load();
  assert.ok(updates.hot);
  updates.reject();
  assert.equal(updates.hot, false);
  assert.equal(updates.resolve("desktop.html"), null);
  assert.equal(updates.load(), null, "elle ne revient pas au démarrage suivant");
  assert.equal(await updates.check(), null, "ni à la vérification suivante");
  const later = site({ ...files, "desktop.html": "<html>corrigée</html>" }, { version: 300 });
  const fixed = createUiUpdates({ dir, bundledVersion: 100, shellVersion: "1.0.2", origin: "https://site.test", fetch: later.fetch, publicKey: pem });
  fixed.load();
  assert.equal(await fixed.check(), 300, "la version suivante est acceptée");
});

test("une interface publiée identique à celle livrée n'est pas une mise à jour", async () => {
  const dir = tempDir();
  const remote = site(files, { version: 500 });
  const updates = createUiUpdates({
    dir,
    bundledVersion: 100,
    shellVersion: "1.0.2",
    origin: "https://site.test",
    fetch: remote.fetch,
    publicKey: pem,
    bundledFiles: () => remote.hashes,
  });
  updates.load();
  assert.equal(await updates.check(), null);
  assert.equal(updates.load(), null);
});

