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
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  let f = path.join(RACINE, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(RACINE, "index.html");
  for (const [k, v] of Object.entries(entetes)) res.setHeader(k, v);
  res.setHeader("Content-Type", TYPES[path.extname(f)] || "application/octet-stream");
  res.end(fs.readFileSync(f));
}).listen(4180, () => console.log("prêt sur 4180 avec la CSP de production"));
