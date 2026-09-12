// Sert dist/ avec EXACTEMENT les en-têtes de vercel.json.
//
// POURQUOI CE SCRIPT EXISTE
// Ni `vite dev` ni `vite preview` ne posent d'en-tête Content-Security-Policy.
// Tout ce que la CSP bloque en production fonctionne donc parfaitement en
// local — et le défaut ne se voit qu'une fois en ligne.
// Cas réel : index.html chargeait Poppins avec `media="print"` +
// `onload="this.media='all'"`. La CSP interdisant les gestionnaires en ligne,
// ce `onload` ne s'exécutait jamais en production : la feuille restait en
// `media="print"` et tout le site s'affichait dans la police de secours du
// système. Impossible à voir avec `vite preview`.
//
//   npm run build && npm run preview:csp    puis http://localhost:4180
import http from "http";
import fs from "fs";
import path from "path";
const RACINE = path.join(process.cwd(), "dist");
const vercel = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));
const entetes = {};
for (const bloc of vercel.headers || []) for (const h of bloc.headers || []) entetes[h.key] = h.value;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
// `/api` est relayé vers l'API de production, comme le fait `vite preview` :
// sans cela, impossible de se connecter, donc impossible de tester sous CSP
// les pages réservées (KYC, espace partenaire, administration).
// API_CIBLE=http://localhost:5001 relaie vers une API locale (vérification
// bout en bout d'une fonctionnalité serveur sans toucher à la production).
const API = process.env.API_CIBLE || "https://vit-auto-api.onrender.com";
import https from "https";
import net from "net";
const API_EN_CLAIR = new URL(API).protocol === "http:";
function relayerApi(req, res) {
  const cible = new URL(req.url, API);
  // L'API refuse (403) toute origine inconnue — c'est sa protection CORS.
  // Le relais se présente donc avec l'origine du site : c'est le site, servi
  // en local, qui parle à sa propre API.
  const ORIGINE = process.env.ORIGINE_SITE || "https://vit-auto.com";
  const entetes = { ...req.headers, host: cible.host, origin: ORIGINE, referer: ORIGINE + "/" };
  delete entetes["accept-encoding"];
  const r = (API_EN_CLAIR ? http : https).request(cible, { method: req.method, headers: entetes }, (rep) => {
    res.writeHead(rep.statusCode, rep.headers);
    rep.pipe(res);
  });
  r.on("error", () => { res.writeHead(502); res.end("relais API indisponible"); });
  req.pipe(r);
}

// /socket.io est relayé lui aussi (Vercel le réécrit vers l'API en
// production), y compris l'upgrade WebSocket : on ouvre un tunnel TLS vers
// l'API et on relie les deux sockets. Sans cela, chaque page connectée
// journalisait un échec de WebSocket qui n'existe pas en production.
import tls from "tls";
function relayerUpgrade(req, socket, head) {
  const cible = new URL(API);
  const ouvrir = (cb) => API_EN_CLAIR
    ? net.connect({ host: cible.hostname, port: Number(cible.port) || 80 }, cb)
    : tls.connect({ host: cible.hostname, port: 443, servername: cible.hostname }, cb);
  const distant = ouvrir(() => {
    const lignes = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const k = req.rawHeaders[i], v = req.rawHeaders[i + 1];
      const kl = k.toLowerCase();
      if (kl === "host") lignes.push(`Host: ${cible.host}`);
      else if (kl === "origin") lignes.push(`Origin: ${process.env.ORIGINE_SITE || "https://vit-auto.com"}`);
      else lignes.push(`${k}: ${v}`);
    }
    distant.write(lignes.join("\r\n") + "\r\n\r\n");
    if (head?.length) distant.write(head);
    socket.pipe(distant).pipe(socket);
  });
  distant.on("error", () => socket.destroy());
  socket.on("error", () => distant.destroy());
}

const serveur = http.createServer((req, res) => {
  if (req.url.startsWith("/api/") || req.url.startsWith("/socket.io/")) return relayerApi(req, res);
  let p = decodeURIComponent(req.url.split("?")[0]);
  let f = path.join(RACINE, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(RACINE, "index.html");
  for (const [k, v] of Object.entries(entetes)) res.setHeader(k, v);
  res.setHeader("Content-Type", TYPES[path.extname(f)] || "application/octet-stream");
  res.end(fs.readFileSync(f));
});
serveur.on("upgrade", (req, socket, head) => {
  if (req.url.startsWith("/socket.io/")) relayerUpgrade(req, socket, head); else socket.destroy();
});
// PORT_CSP : deux vérifications peuvent coexister sur la même machine (deux
// sessions, ou une garde pendant qu'un développeur regarde le site).
const PORT_CSP = Number(process.env.PORT_CSP || 4180);
serveur.listen(PORT_CSP, () => console.log(`prêt sur ${PORT_CSP} avec la CSP de production — API relayée : ${API}`));
