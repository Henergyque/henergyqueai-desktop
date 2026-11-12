// Relais entre l'interface embarquée et l'API du site.
//
// L'interface est servie depuis app://henergyqueai/ et appelle l'API avec des
// adresses relatives (/api/...). Ces requêtes arrivent ici et repartent vers
// le serveur avec les cookies de la session Electron : pour le serveur,
// l'application se comporte comme le site ouvert dans un navigateur.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "host",
  "origin",
  "referer",
  "cookie",
  "content-length",
]);

function forwardHeaders(source, apiOrigin) {
  const headers = new Headers();
  for (const [name, value] of source) {
    if (!HOP_BY_HOP.has(name.toLowerCase())) headers.set(name, value);
  }
  headers.set("Origin", apiOrigin);
  return headers;
}

function responseHeaders(source) {
  const headers = new Headers();
  for (const [name, value] of source) {
    const lower = name.toLowerCase();
    // Le cookie reste dans la session Electron, l'interface n'en a pas besoin.
    // La longueur et l'encodage ne correspondent plus une fois le corps décodé.
    if (lower === "set-cookie" || lower === "content-encoding" || lower === "content-length") continue;
    headers.set(name, value);
  }
  return headers;
}

function createApiRelay({ apiOrigin, fetch }) {
  return async function relay(request) {
    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, apiOrigin);
    const init = {
      method: request.method,
      headers: forwardHeaders(request.headers, apiOrigin),
      redirect: "manual",
      credentials: "include",
    };
    if (!["GET", "HEAD"].includes(request.method)) {
      init.body = request.body;
      init.duplex = "half";
    }
    try {
      const upstream = await fetch(target.toString(), init);
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders(upstream.headers),
      });
    } catch {
      return new Response(
        JSON.stringify({ error: "Connexion au serveur indisponible." }),
        { status: 503, headers: { "Content-Type": "application/json; charset=utf-8" } },
      );
    }
  };
}

module.exports = { createApiRelay, forwardHeaders, responseHeaders };
