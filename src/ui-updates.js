// Mises à jour de l'interface sans réinstaller l'application.
//
// Le site publie l'interface compilée sous /bureau/ : un manifeste signé
// (version, version minimale de l'application, empreinte SHA-256 de chaque
// fichier) et les fichiers eux-mêmes, rangés par empreinte. L'application
// vérifie la signature avec la clé publique ci-dessous, télécharge les
// fichiers qui lui manquent, contrôle chaque empreinte, et utilise la
// nouvelle interface au démarrage suivant. En cas de problème, elle revient
// à l'interface livrée avec elle.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// Clé publique de signature de l'interface (Ed25519). La clé privée reste
// hors des dépôts, sur l'ordinateur qui publie.
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAOE7/JDckamanH8DUJRaU1dXNUbyVt0LOuMwv2dHalNg=
-----END PUBLIC KEY-----`;

const HASH = /^[0-9a-f]{64}$/;

function verifyManifest(raw, signature, publicKey = PUBLIC_KEY) {
  try {
    const ok = crypto.verify(null, Buffer.from(raw), publicKey, Buffer.from(String(signature).trim(), "base64"));
    if (!ok) return null;
    const manifest = JSON.parse(raw);
    if (!Number.isInteger(manifest.version) || typeof manifest.minShell !== "string") return null;
    if (!manifest.files || typeof manifest.files !== "object") return null;
    for (const [file, hash] of Object.entries(manifest.files)) {
      if (!HASH.test(hash) || file.includes("..") || file.startsWith("/") || file.includes("\\")) return null;
    }
    if (!manifest.files["desktop.html"]) return null;
    return manifest;
  } catch {
    return null;
  }
}

function newerVersion(a, b) {
  const parse = (value) => String(value).replace(/^v/, "").split(".").map((part) => parseInt(part, 10) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

// `bundledFiles()` donne les empreintes de l'interface livrée avec
// l'application : une interface publiée identique n'est pas une mise à jour.
function createUiUpdates({ dir, bundledVersion, shellVersion, origin, fetch, publicKey = PUBLIC_KEY, log = () => {}, bundledFiles = () => ({}) }) {
  const objects = path.join(dir, "objects");
  const activeFile = path.join(dir, "active.json");
  const rejectedFile = path.join(dir, "ecartees.json");
  let active = null;
  const rejected = () => {
    try {
      return new Set(JSON.parse(fs.readFileSync(rejectedFile, "utf8")));
    } catch {
      return new Set();
    }
  };
  let checking = null;

  function readActive() {
    try {
      const { raw, signature } = JSON.parse(fs.readFileSync(activeFile, "utf8"));
      const manifest = verifyManifest(raw, signature, publicKey);
      if (!manifest || manifest.version <= bundledVersion || newerVersion(manifest.minShell, shellVersion)) return null;
      const complete = Object.values(manifest.files).every((hash) => fs.existsSync(path.join(objects, hash)));
      return complete ? manifest : null;
    } catch {
      return null;
    }
  }

  // Les fichiers d'anciennes versions ne servent plus.
  function prune(keep) {
    try {
      const wanted = new Set(Object.values(keep?.files || {}));
      for (const name of fs.readdirSync(objects)) if (!wanted.has(name)) fs.rmSync(path.join(objects, name), { force: true });
    } catch {}
  }

  function load() {
    active = readActive();
    if (!active) {
      try {
        fs.rmSync(activeFile, { force: true });
      } catch {}
    }
    prune(active);
    return active;
  }

  // Le fichier à servir pour un chemin de l'interface, ou null pour laisser
  // l'interface livrée avec l'application répondre.
  function resolve(file) {
    if (!active) return null;
    const hash = active.files[file];
    return hash ? path.join(objects, hash) : null;
  }

  async function check() {
    if (checking) return checking;
    checking = (async () => {
      const get = async (url) => {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`${response.status} ${url}`);
        return response;
      };
      const raw = await (await get(`${origin}/bureau/manifest.json`)).text();
      const signature = await (await get(`${origin}/bureau/manifest.sig`)).text();
      const manifest = verifyManifest(raw, signature, publicKey);
      if (!manifest) throw new Error("Signature de l'interface invalide.");
      const current = active?.version || bundledVersion;
      if (manifest.version <= current || rejected().has(manifest.version)) return null;
      if (newerVersion(manifest.minShell, shellVersion)) {
        log(`Interface ${manifest.version} : demande l'application ${manifest.minShell}.`);
        return null;
      }
      const same = (a, b) => {
        const keys = Object.keys(a);
        return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
      };
      if (same(manifest.files, active?.files || bundledFiles())) return null;
      fs.mkdirSync(objects, { recursive: true });
      const missing = [...new Set(Object.values(manifest.files))].filter((hash) => !fs.existsSync(path.join(objects, hash)));
      for (const hash of missing) {
        const body = Buffer.from(await (await get(`${origin}/bureau/files/${hash}`)).arrayBuffer());
        if (sha256(body) !== hash) throw new Error(`Fichier altéré : ${hash}`);
        const temporary = path.join(objects, `${hash}.part`);
        fs.writeFileSync(temporary, body);
        fs.renameSync(temporary, path.join(objects, hash));
      }
      fs.writeFileSync(`${activeFile}.part`, JSON.stringify({ raw, signature }));
      fs.renameSync(`${activeFile}.part`, activeFile);
      log(`Interface ${manifest.version} prête pour le prochain démarrage.`);
      return manifest.version;
    })().finally(() => {
      checking = null;
    });
    return checking;
  }

  // L'interface téléchargée ne se charge pas : on l'écarte pour de bon.
  // Elle ne sera plus jamais reprise ; la suivante, oui.
  function reject() {
    const version = active?.version;
    active = null;
    try {
      fs.rmSync(activeFile, { force: true });
      if (version) fs.writeFileSync(rejectedFile, JSON.stringify([...rejected(), version].slice(-20)));
    } catch {}
  }

  return {
    load,
    resolve,
    check,
    reject,
    get version() {
      return active?.version || bundledVersion;
    },
    get hot() {
      return !!active;
    },
  };
}

module.exports = { createUiUpdates, verifyManifest, newerVersion, sha256, PUBLIC_KEY };
