const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { resolveStatic } = require("../src/static");
const { forwardHeaders, responseHeaders, createApiRelay } = require("../src/proxy");

const root = path.resolve("ui-test-root");

test("les routes de l'application reçoivent la page de l'application", () => {
  assert.equal(resolveStatic(root, "/app"), path.join(root, "desktop.html"));
  assert.equal(resolveStatic(root, "/connexion"), path.join(root, "desktop.html"));
  assert.equal(resolveStatic(root, "/assets/index.js"), path.join(root, "assets", "index.js"));
});

test("aucun fichier hors du dossier de l'interface", () => {
  for (const attempt of ["/../package.json", "/%2e%2e/%2e%2e/secret.txt", "/assets/../../x.js", "/%E0%A4%A"]) {
    const file = resolveStatic(root, attempt);
    assert.ok(file === null || file.startsWith(root + path.sep), attempt);
  }
});

test("le relais remplace l'origine et retire les en-têtes sensibles", () => {
  const headers = forwardHeaders(
    new Headers({ Origin: "app://henergyqueai", Cookie: "x=1", Host: "henergyqueai", "X-Requested-With": "HenergyqueAI" }),
    "https://henergyqueai.fr",
  );
  assert.equal(headers.get("origin"), "https://henergyqueai.fr");
  assert.equal(headers.get("cookie"), null);
  assert.equal(headers.get("host"), null);
  assert.equal(headers.get("x-requested-with"), "HenergyqueAI");
  const back = responseHeaders(new Headers({ "Set-Cookie": "s=1", "Content-Type": "text/event-stream" }));
  assert.equal(back.get("set-cookie"), null);
  assert.equal(back.get("content-type"), "text/event-stream");
});

test("le relais vise l'API avec le même chemin et répond 503 sans réseau", async () => {
  let seen;
  const relay = createApiRelay({
    apiOrigin: "https://henergyqueai.fr",
    fetch: async (url, init) => {
      seen = { url, init };
      return new Response("{}", { status: 201 });
    },
  });
  const response = await relay(new Request("https://placeholder/api/conversations?x=1", { method: "POST", body: "{}" }));
  assert.equal(response.status, 201);
  assert.equal(seen.url, "https://henergyqueai.fr/api/conversations?x=1");
  assert.equal(seen.init.credentials, "include");

  const offline = createApiRelay({ apiOrigin: "https://henergyqueai.fr", fetch: async () => { throw new TypeError("offline"); } });
  const failed = await offline(new Request("https://placeholder/api/auth/me"));
  assert.equal(failed.status, 503);
});
