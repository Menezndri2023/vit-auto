// Génère public/sitemap.xml à partir des annonces réellement publiées
// (véhicules approuvés, annonces import/export approuvées, showrooms publiés)
// en interrogeant les endpoints publics de l'API — pas d'accès direct à Mongo
// depuis le build frontend. Si l'API est injoignable (backend down, pas de
// réseau en CI), on n'écrase pas le sitemap existant : le build ne doit
// jamais échouer à cause de ce script.

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_URL = "https://vit-auto.com";
const API_BASE = process.env.SITEMAP_API_URL || process.env.VITE_API_URL || "https://vit-auto-api.onrender.com/api";
const OUTPUT_PATH = path.join(__dirname, "..", "public", "sitemap.xml");

const STATIC_URLS = [
  { loc: "/",                       changefreq: "daily",   priority: "1.0" },
  { loc: "/catalogue",              changefreq: "hourly",  priority: "0.9" },
  { loc: "/import-export",          changefreq: "daily",   priority: "0.8" },
  { loc: "/import-export/listings", changefreq: "hourly",  priority: "0.8" },
  { loc: "/services",               changefreq: "monthly", priority: "0.6" },
  { loc: "/partenaires",            changefreq: "weekly",  priority: "0.7" },
  { loc: "/pourquoi",               changefreq: "monthly", priority: "0.5" },
  { loc: "/plans",                  changefreq: "monthly", priority: "0.5" },
  { loc: "/faq",                    changefreq: "monthly", priority: "0.4" },
  { loc: "/help",                   changefreq: "monthly", priority: "0.4" },
  { loc: "/register",               changefreq: "yearly",  priority: "0.5" },
  { loc: "/login",                  changefreq: "yearly",  priority: "0.3" },
  { loc: "/privacy",                changefreq: "yearly",  priority: "0.2" },
  { loc: "/cgu",                    changefreq: "yearly",  priority: "0.2" },
  { loc: "/mentions-legales",       changefreq: "yearly",  priority: "0.2" },
];

async function fetchAllPages(endpoint, itemsKey, limit) {
  const items = [];
  let page = 1;
  for (;;) {
    const res = await fetch(`${API_BASE}${endpoint}?page=${page}&limit=${limit}`);
    if (!res.ok) throw new Error(`${endpoint} → HTTP ${res.status}`);
    const data = await res.json();
    const batch = data[itemsKey] || [];
    items.push(...batch);
    if (page >= (data.pages || 1) || batch.length === 0) break;
    page += 1;
  }
  return items;
}

function xmlEscape(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

function urlEntry({ loc, changefreq, priority, lastmod }) {
  const lines = [`  <url><loc>${xmlEscape(SITE_URL + loc)}</loc>`];
  if (lastmod) lines.push(`<lastmod>${lastmod}</lastmod>`);
  lines.push(`<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`);
  return lines.join("");
}

async function main() {
  const urls = [...STATIC_URLS.map(urlEntry)];

  let vehicles, listings, showrooms;
  try {
    [vehicles, listings, showrooms] = await Promise.all([
      fetchAllPages("/vehicles", "vehicles", 100),
      fetchAllPages("/import-export/listings", "listings", 50),
      fetchAllPages("/pms/showrooms", "showrooms", 50),
    ]);
  } catch (err) {
    console.warn(`⚠️  sitemap: API injoignable (${err.message}) — sitemap.xml existant conservé tel quel.`);
    return;
  }

  for (const v of vehicles) {
    urls.push(urlEntry({
      loc: `/vehicle/${v._id}`,
      changefreq: "daily",
      priority: "0.7",
      lastmod: v.updatedAt ? new Date(v.updatedAt).toISOString().slice(0, 10) : undefined,
    }));
  }
  for (const l of listings) {
    urls.push(urlEntry({
      loc: `/import-export/listings/${l._id}`,
      changefreq: "daily",
      priority: "0.7",
      lastmod: l.updatedAt ? new Date(l.updatedAt).toISOString().slice(0, 10) : undefined,
    }));
  }
  for (const s of showrooms) {
    urls.push(urlEntry({
      loc: `/showroom/${s.slug || s.partnerId}`,
      changefreq: "weekly",
      priority: "0.6",
    }));
  }

  console.log(`sitemap: ${vehicles.length} véhicules, ${listings.length} annonces IE, ${showrooms.length} showrooms`);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;

  try {
    await writeFile(OUTPUT_PATH, xml, "utf8");
    console.log(`✅ sitemap.xml écrit (${urls.length} URLs) → ${OUTPUT_PATH}`);
  } catch (err) {
    console.warn(`⚠️  sitemap: échec d'écriture (${err.message}) — sitemap.xml existant conservé.`);
  }
}

main();
