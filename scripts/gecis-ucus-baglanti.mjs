// Tek seferlik geçiş: data/ucuslar.json'daki Google Flights bağlantılarını Türkçeye çevirir (hl=en-US -> hl=tr).
// Tekrar çalıştırmak güvenli. Kullanım: node scripts/gecis-ucus-baglanti.mjs
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { trLink } from "./ucak-fiyatlari.mjs";

export function migrateLinks(state) {
  let n = 0;
  const fix = (o) => { if (o && typeof o.link === "string") { const v = trLink(o.link); if (v !== o.link) { o.link = v; n++; } } };
  for (const w of Object.values(state.haftaSonlari || {})) for (const c of Object.values(w.sehirler || {})) { fix(c.son); fix(c.son && c.son.aktarmasiz); }
  return n;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = fileURLToPath(new URL("../data/ucuslar.json", import.meta.url));
  const state = JSON.parse(await readFile(path, "utf8"));
  const n = migrateLinks(state);
  if (n) await writeFile(path, JSON.stringify(state) + "\n");
  console.log(`Değişen bağlantı: ${n}`);
}
