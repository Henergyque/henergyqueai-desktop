// Sert l'interface compilée embarquée dans l'application.
const path = require("node:path");
const fs = require("node:fs");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

// Les routes de l'application (/app, /connexion…) n'ont pas d'extension :
// elles reçoivent la page de l'application, et React Router fait le reste.
function resolveStatic(root, pathname, entry = "desktop.html") {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const file = path.resolve(root, "." + path.posix.normalize("/" + decoded));
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  if (!path.extname(file)) return path.join(root, entry);
  return file;
}

function createStaticHandler(root, entry) {
  const base = path.resolve(root);
  return async function serve(request) {
    const { pathname } = new URL(request.url);
    const file = resolveStatic(base, pathname, entry);
    if (!file) return new Response("Introuvable", { status: 404 });
    try {
      const body = await fs.promises.readFile(file);
      const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
      return new Response(body, {
        headers: { "Content-Type": type, "Cache-Control": "no-cache" },
      });
    } catch {
      return new Response("Introuvable", { status: 404 });
    }
  };
}

module.exports = { createStaticHandler, resolveStatic };
