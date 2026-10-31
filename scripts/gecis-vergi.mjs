// Tek seferlik geçiş: eski otel fiyat kayıtlarını vergili fiyata çevirir (data/fiyatlar/*.json ve data/arsiv/*.json).
// Robotun yeni kurallarıyla aynı mantık (scripts/otel-fiyatlari.mjs > taxInclusive), ama elimizdeki veriyle:
//   a) bağlantıdaki vergili toplam ve vergi (Priceline pdt/pdtax, Booking ext_price_total/ext_price_tax, Expedia mpf/mpj ...)
//   c) kayıtlı Google toplamı (googleFiyat) fiyatın %3-45 üstündeyse o
//   d) yoksa olduğu gibi ("dahil" ya da "bilinmiyor")
// Ayrıca: tanınmış sitede bulunmayan fiyat "dogrulanamadi", olağan fiyatın 1,5 katından pahalı gecelik "supheli: true".
// Geçmiş (gecmis) kayıtlarına aynı hafta sonunun son kaydındaki vergi oranı uygulanır.
// Tekrar çalıştırmak güvenli: "vergi" alanı olan kayıtlar atlanır, ikinci çalıştırma hiçbir şeyi değiştirmez.
// Kullanım: node scripts/gecis-vergi.mjs
import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { taxInclusive, taxLike, isSuspicious, usable } from "./otel-fiyatlari.mjs";

const num = (x) => typeof x === "number" && Number.isFinite(x);
const r2 = (x) => Math.round(x * 100) / 100;
const PRICED = new Set(["fiyat", "dogrulanamadi"]);

// Tek otel-hafta sonu kaydını ({ son, gecmis }) yerinde çevirir. Değiştiyse true döner.
export function migrateHotel(o, nights = 2) {
  const s = o && o.son;
  if (!s || s.vergi || !PRICED.has(s.durum) || !num(s.fiyat)) return false;
  const old = s.fiyat;
  if (s.durum === "fiyat" && s.guvenilir === false) {
    s.durum = "dogrulanamadi";
    s.not = "Fiyat sadece az bilinen sitelerde bulundu, tanınmış bir sitede doğrulanamadı";
  }
  const H = taxInclusive(old, { link: s.link || null, google: num(s.googleFiyat) ? s.googleFiyat : null });
  const out = { durum: s.durum, fiyat: r2(H.fiyat), gecelik: r2(H.fiyat / nights) };
  if (out.fiyat !== r2(old)) out.fiyatVergisiz = r2(old);
  out.vergi = H.vergi;
  if (isSuspicious(out.gecelik, s.tipikGecelik)) out.supheli = true;
  // alan sırası: robotun yazdığı sırayla aynı kalsın
  const { durum, fiyat, gecelik, fiyatVergisiz, vergi, supheli, ...rest } = s;
  const rebuilt = { ...out, ...rest };
  if (rebuilt.enUcuz && num(rebuilt.enUcuz.fiyat)) {
    const E = taxLike(rebuilt.enUcuz.fiyat, rebuilt.enUcuz.link || null, H);
    rebuilt.enUcuz = E.fiyat < out.fiyat - 0.5
      ? { ...rebuilt.enUcuz, fiyat: r2(E.fiyat), vergi: E.vergi, ...(r2(E.fiyat) !== r2(rebuilt.enUcuz.fiyat) ? { fiyatVergisiz: r2(rebuilt.enUcuz.fiyat) } : {}) }
      : null;
  }
  if (num(rebuilt.resmiSiteFiyat)) rebuilt.resmiSiteFiyat = r2(taxLike(rebuilt.resmiSiteFiyat, null, H).fiyat);
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, rebuilt);
  for (const g of o.gecmis || []) {
    if (!g || g.vergi || !PRICED.has(g.durum) || !num(g.fiyat)) continue;
    const f = g.fiyat;
    if (s.kontrol && g.t === s.kontrol) g.durum = s.durum; // son kontrolün geçmiş satırı son kayıtla aynı durumda olsun
    g.fiyat = H.carpan > 1.0005 ? r2(f * H.carpan) : f;
    if (g.fiyat !== f) g.fiyatVergisiz = f;
    g.vergi = H.vergi;
    if (isSuspicious(g.fiyat / nights, s.tipikGecelik)) g.supheli = true;
  }
  return true;
}

export function migrateDoc(doc) {
  const changed = [];
  for (const [giris, w] of Object.entries((doc && doc.haftaSonlari) || {})) {
    for (const [id, o] of Object.entries(w.oteller || {})) if (migrateHotel(o)) changed.push({ giris, id, son: o.son });
  }
  return changed;
}

// Son çalışmanın özetini (data/otel-fiyatlari.json > sonCalisma) yeni sayımlarla günceller
export function recount(meta, docs) {
  const sc = meta && meta.sonCalisma;
  if (!sc || !sc.tarih) return false;
  const c = { fiyatli: 0, dogrulanamadi: 0, supheli: 0, vergi: { dahil: 0, eklendi: 0, bilinmiyor: 0 } };
  for (const d of docs) for (const w of Object.values(d.haftaSonlari || {})) for (const o of Object.values(w.oteller || {})) {
    const s = o.son;
    if (!s || s.kontrol !== sc.tarih) continue;
    if (usable(s)) c.fiyatli++;
    if (s.durum === "dogrulanamadi") c.dogrulanamadi++;
    if (s.supheli) c.supheli++;
    if (s.vergi) c.vergi[s.vergi] = (c.vergi[s.vergi] || 0) + 1;
  }
  const before = JSON.stringify(sc);
  Object.assign(sc, c);
  return JSON.stringify(sc) !== before;
}

const median = (a) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const list = async (dir) => { try { return (await readdir(root + dir)).filter((f) => f.endsWith(".json")).map((f) => dir + f); } catch (e) { if (e.code === "ENOENT") return []; throw e; } };
  (async () => {
    const files = [...(await list("data/fiyatlar/")), ...(await list("data/arsiv/"))];
    const docs = [], stats = [];
    let total = 0;
    for (const f of files) {
      const text = await readFile(root + f, "utf8"), doc = JSON.parse(text);
      const ch = migrateDoc(doc);
      docs.push(doc);
      if (!ch.length) continue;
      total += ch.length;
      const up = ch.filter((x) => x.son.fiyatVergisiz).map((x) => x.son.fiyat / x.son.fiyatVergisiz - 1);
      const all = ch.map((x) => (x.son.fiyatVergisiz ? x.son.fiyat / x.son.fiyatVergisiz - 1 : 0));
      stats.push({ dosya: f, kayit: ch.length, artan: up.length, ortancaArtis: median(all), artanlardaOrtanca: median(up), dogrulanamadi: ch.filter((x) => x.son.durum === "dogrulanamadi").length, supheli: ch.filter((x) => x.son.supheli).length });
      await writeFile(root + f, (text.startsWith("{\n") ? JSON.stringify(doc, null, 1) : JSON.stringify(doc)) + "\n");
    }
    const metaPath = root + "data/otel-fiyatlari.json";
    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    if (recount(meta, docs.filter((d, i) => files[i].startsWith("data/fiyatlar/")))) await writeFile(metaPath, JSON.stringify(meta, null, 1) + "\n");
    const pct = (x) => (x == null ? "-" : (x * 100).toFixed(1) + "%");
    console.log(`Değişen kayıt: ${total}`);
    for (const s of stats) console.log(`${s.dosya}: ${s.kayit} kayıt, ${s.artan} fiyat arttı, ortanca artış ${pct(s.ortancaArtis)} (artanlarda ${pct(s.artanlardaOrtanca)}), doğrulanamadı ${s.dogrulanamadi}, şüpheli ${s.supheli}`);
  })().catch((e) => { console.error("HATA:", e.message); process.exit(1); });
}
