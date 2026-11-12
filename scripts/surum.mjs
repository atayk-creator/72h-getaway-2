// Ana sayfanın ayrı dosyaları (css/site.css, js/site.js) değişince index.html'deki ?v= sürüm etiketini içerik özetine göre yeniler.
// Böylece tarayıcı ve önbellek eski dosyayı yeni sayfayla karıştırmaz. Kullanım: node scripts/surum.mjs  (--kontrol: sadece denetle)
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
export const DOSYALAR = ["css/site.css", "js/site.js"];
export const ozet = (rel) => createHash("sha1").update(readFileSync(join(root, rel))).digest("hex").slice(0, 10);

export function yenile(html) {
  let s = html;
  for (const rel of DOSYALAR) s = s.replace(new RegExp(`/${rel.replace(/[.]/g, "\\.")}\\?v=[0-9a-f]+`, "g"), `/${rel}?v=${ozet(rel)}`);
  return s;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const p = join(root, "index.html"), eski = readFileSync(p, "utf8"), yeni = yenile(eski);
  if (process.argv.includes("--kontrol")) {
    if (eski !== yeni) { console.error("index.html'deki ?v= sürümleri güncel değil: node scripts/surum.mjs"); process.exit(1); }
    console.log("Sürümler güncel.");
  } else if (eski !== yeni) { writeFileSync(p, yeni); console.log("index.html sürümleri yenilendi."); } else console.log("Değişiklik yok.");
}
