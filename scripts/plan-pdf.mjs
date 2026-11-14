// Plan sayfalarının hazır paket PDF'lerini üretir (Uygun, Konforlu, Lüks): sayfanın baskı görünümünü (?pdf=<paket>)
// gerçek tarayıcıda açıp A4 PDF'e çevirir. Çıktı: pdf-cikti/<slug>-<paket>.pdf (iş akışı bunları "rehberler" sürümüne yükler).
// Kullanım: node scripts/plan-pdf.mjs   (playwright NODE_PATH'ten gelir, site-kontrol.mjs ile aynı)
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const TUR = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const srv = createServer(async (req, res) => {
  try {
    let f = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
    if (existsSync(f) && (await stat(f)).isDirectory()) f = join(f, "index.html");
    res.writeHead(200, { "Content-Type": TUR[extname(f)] || "application/octet-stream" }); res.end(await readFile(f));
  } catch { res.writeHead(404); res.end("yok"); }
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${srv.address().port}`;
const sm = readFileSync(join(root, "sitemap.xml"), "utf8");
const yollar = [...sm.matchAll(/<loc>https?:\/\/[^/]+(\/[^<]*)<\/loc>/g)].map((m) => m[1]).filter((y) => y.endsWith("/") && existsSync(join(root, y, "index.html")) && readFileSync(join(root, y, "index.html"), "utf8").includes('id="plan-veri"'));
const cikti = join(root, "pdf-cikti");
await mkdir(cikti, { recursive: true });
const b = await chromium.launch();
let n = 0; const hata = [];
for (const y of yollar) {
  const V = JSON.parse(/<script type="application\/json" id="plan-veri">([\s\S]*?)<\/script>/.exec(readFileSync(join(root, y, "index.html"), "utf8"))[1]);
  for (const h of V.haftalar) for (const paket of ["uygun", "konforlu", "luks"]) {
    const ctx = await b.newContext({ viewport: { width: 794, height: 1123 }, serviceWorkers: "block" });
    const p = await ctx.newPage();
    await p.route((u) => !u.href.startsWith(BASE), (r) => r.abort());
    try {
      await p.goto(`${BASE}${y}?pdf=${paket}${V.haftalar.length > 1 ? `&h=${h.id}` : ""}`, { waitUntil: "load", timeout: 30000 });
      await p.waitForSelector("html[data-pdf=hazir]", { state: "attached", timeout: 15000 });
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(400);
      await p.pdf({ path: join(cikti, `${V.slug}-${paket}${V.haftalar.length > 1 ? `-${h.id}` : ""}.pdf`), format: "A4", printBackground: true, preferCSSPageSize: true });
      n++;
    } catch (e) { hata.push(`${y} ${paket}: ${e.message.slice(0, 120)}`); }
    await ctx.close();
  }
}
await b.close(); srv.close();
console.log(`${n} PDF üretildi (${yollar.length} sayfa).` + (hata.length ? `\nHata:\n${hata.join("\n")}` : ""));
process.exit(hata.length ? 1 : 0);
