// Siteyi telefon uygulaması için paketler: sayfaları ve son veriyi app/www klasörüne kopyalar, uygulama kabuğunu
// (app/shell/app.css + app.js) her sayfanın <head>'ine ekler ve servis çalışanını (sw.js) kapatır.
// Kullanım: node scripts/build-app.mjs   (sonra: cd app && npx cap sync)
import { cp, mkdir, readFile, rm, writeFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { execSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "app", "www");
export const PAGES = ["index.html", "oteller.html", "hakkinda.html"];
const COPY = ["img", "js", "video", "fonts", "sehir/fenerbahce", "sehir/galatasaray", "sehir/besiktas", "favicon.ico", "data.json", "prices.json", "price-status.json"];
const DATA = ["hotels.json", "otel-fiyatlari.json", "ucuslar.json", "restoranlar.json", "gezi.json", "fiyatlar", "vitrin.json", "oneriler.json", "hikaye-video.json", "takimlar.json", "fenerbahce.json", "galatasaray.json", "besiktas.json"];

export function transform(html, build) {
  if (!/<head>/i.test(html)) throw new Error("head yok");
  let s = html.replace(/<script>if \("serviceWorker" in navigator\)[^<]*<\/script>/g, "");
  s = s.replace(/<link rel="manifest"[^>]*>\s*/g, "");
  const inject = `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<script>window.APP_BUILD = ${JSON.stringify(build)};</script>\n<link rel="stylesheet" href="/app/app.css">\n<script src="/app/app.js"></script>\n`;
  s = s.replace(/<meta name="viewport"[^>]*>\s*/i, "");
  s = s.replace(/(<meta charset="[^"]*">\s*)/i, `$1${inject}`);
  if (!s.includes("/app/app.js")) throw new Error("kabuk eklenemedi");
  return s;
}

async function size(dir) { let n = 0; for (const f of await readdir(dir, { withFileTypes: true })) n += f.isDirectory() ? await size(join(dir, f.name)) : (await stat(join(dir, f.name))).size; return n; }

export async function build() {
  await rm(out, { recursive: true, force: true });
  await mkdir(join(out, "data"), { recursive: true });
  const d = JSON.parse(await readFile(join(root, "data.json"), "utf8"));
  let commit = null; try { commit = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim(); } catch {}
  const build = { tarih: new Date().toISOString().slice(0, 10), veri: d.updated || null, commit };
  for (const p of PAGES) await writeFile(join(out, p), transform(await readFile(join(root, p), "utf8"), build));
  for (const c of COPY) if (existsSync(join(root, c))) await cp(join(root, c), join(out, c), { recursive: true });
  for (const c of DATA) await cp(join(root, "data", c), join(out, "data", c), { recursive: true });
  await cp(join(root, "app", "shell"), join(out, "app"), { recursive: true });
  return { out, build, bytes: await size(out) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  build().then((r) => console.log(`app/www hazır (${(r.bytes / 1e6).toFixed(1)} MB, veri ${r.build.veri}, commit ${r.build.commit})`)).catch((e) => { console.error("HATA:", e.message); process.exit(1); });
}
