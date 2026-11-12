// Site duman testi: siteyi yerelde açar ve gerçek tarayıcıda (Playwright, Chromium) tüm sayfaları dolaşır.
// Kontroller: JavaScript hatası, sitenin kendi dosyalarında 4xx/5xx, kırık iç bağlantı, 320 px telefonda yatay taşma,
// başlık/açıklama/canonical, görünür metinde "ucuz" ve eski "28 başkent" ifadeleri, takım sayfalarında kulüp notu.
// Kullanım: node scripts/site-kontrol.mjs   (çıkış kodu 1 = sorun var; ayrıntılar GITHUB_STEP_SUMMARY'ye de yazılır)
import { createServer } from "node:http";
import { readFile, stat, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
// playwright depoya bağımlılık olarak eklenmez: CI geçici klasöre kurar (NODE_PATH), yerelde genel kurulum kullanılır
const { chromium, devices } = createRequire(import.meta.url)("playwright");

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const TUR = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".mp4": "video/mp4", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

function sunucu() {
  return createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      let f = join(root, p);
      if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
      if (existsSync(f) && (await stat(f)).isDirectory()) f = join(f, "index.html");
      const b = await readFile(f);
      res.writeHead(200, { "Content-Type": TUR[extname(f)] || "application/octet-stream" });
      res.end(b);
    } catch { res.writeHead(404); res.end("yok"); }
  });
}

const srv = sunucu();
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const sm = await readFile(join(root, "sitemap.xml"), "utf8");
const sayfalar = [...new Set([...sm.matchAll(/<loc>https?:\/\/[^/]+(\/[^<]*)<\/loc>/g)].map((m) => m[1])).add("/#sehirler").add("/#biletim").add("/#takvim").add("/#karsilastir")];

const sorun = [], bilgi = [];
{ // ana sayfa dosyalarının ?v= sürümü içerikle uyumlu mu
  const { yenile } = await import("./surum.mjs");
  const ih = await readFile(join(root, "index.html"), "utf8");
  if (yenile(ih) !== ih) sorun.push("index.html: css/site.css ya da js/site.js sürüm etiketi (?v=) güncel değil; node scripts/surum.mjs");
}
const b = await chromium.launch();
for (const u of sayfalar) {
  const ctx = await b.newContext({ ...devices["iPhone SE"], serviceWorkers: "block" });
  const p = await ctx.newPage();
  const hata = [], kotu = [];
  p.on("pageerror", (e) => hata.push(e.message.slice(0, 160)));
  p.on("response", (r) => { if (r.url().startsWith(BASE) && r.status() >= 400) kotu.push(`${r.status()} ${r.url().slice(BASE.length)}`); });
  // Dış adresler (yazı tipi, ölçüm, harita) testte açılmaz
  await p.route((url) => !url.href.startsWith(BASE), (r) => r.abort());
  try { await p.goto(BASE + u, { waitUntil: "load", timeout: 30000 }); } catch (e) { hata.push("açılmadı: " + e.message.slice(0, 80)); }
  await p.waitForTimeout(2500);
  const s = await p.evaluate(() => {
    const q = (x) => document.querySelector(x);
    const gor = document.body ? document.body.innerText : "";
    return {
      title: document.title, desc: (q('meta[name="description"]') || {}).content || "", canon: !!q('link[rel="canonical"]'),
      tasma: document.documentElement.scrollWidth - innerWidth,
      ucuz: /(^|[^a-zçğıöşü])ucuz/i.test(gor), baskent28: /\b28 (avrupa )?başkent/i.test(gor),
      kulup: /resmî (bir )?bağ/i.test(gor),
      linkler: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => h.startsWith("/") && !h.startsWith("//")),
    };
  });
  const ad = u;
  if (hata.length) sorun.push(`${ad}: JavaScript hatası: ${[...new Set(hata)].slice(0, 3).join(" | ")}`);
  if (kotu.length) sorun.push(`${ad}: sitenin dosyası açılamadı: ${[...new Set(kotu)].slice(0, 4).join(", ")}`);
  if (s.tasma > 1) sorun.push(`${ad}: 320 px telefonda ${s.tasma} px yatay taşma`);
  if (!u.includes("#")) {
    if (!s.title) sorun.push(`${ad}: <title> yok`);
    if (!s.desc) sorun.push(`${ad}: açıklama (meta description) yok`);
    if (!s.canon) sorun.push(`${ad}: canonical yok`);
  }
  if (s.ucuz) sorun.push(`${ad}: görünür metinde "ucuz" geçiyor (kural: "uygun")`);
  if (s.baskent28) sorun.push(`${ad}: eski "28 başkent" ifadesi`);
  if (/^\/(sehir\/(fenerbahce|galatasaray|besiktas)|deplasman)\/$/.test(u) && !s.kulup) sorun.push(`${ad}: "kulüplerle resmî bağımız yok" notu bulunamadı`);
  for (const l of s.linkler) {
    const yol = l.split("#")[0].split("?")[0];
    if (!yol || yol === "/") continue;
    let f = join(root, yol);
    if (yol.endsWith("/")) f = join(f, "index.html");
    if (!existsSync(f)) sorun.push(`${ad}: kırık iç bağlantı ${l}`);
  }
  await ctx.close();
}
await b.close();
srv.close();
bilgi.push(`${sayfalar.length} sayfa 320 px telefon görünümünde kontrol edildi.`);
const uniq = [...new Set(sorun)];
const md = `## Site duman testi\n\n${uniq.length ? uniq.map((x) => `- ${x}`).join("\n") : "Sorun yok."}\n\n${bilgi.join("\n")}\n`;
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md).catch(() => {});
process.exit(uniq.length ? 1 : 0);
