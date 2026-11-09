// Deplasman fiyat robotu: data/fenerbahce.json'daki yaklaşan maçlar için uçak (eiv~google-flights-scraper) ve
// otel (eiv~google-hotels-scraper) fiyatlarını günceller. Oynanmış maça bakmaz. robot.her_kac_gun günde bir arar
// (ZORLA=1 ile hemen). Kişi başı bütçede uçak ve otel kalemleri buradan; transfer, bilet, yemek, gezi elle kalır.
// Bütçe: Apify aylık sayacı sınıra robot.butce_payi_usd kadar yaklaştıysa aramaz.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runActor, apifyUsage, istanbulToday } from "./otel-fiyatlari.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const FILE = root + "data/fenerbahce.json";
const TRUSTED = /booking|expedia|hotels\.com|agoda|trip\.com|priceline/i;
const AD = { IST: "İstanbul", SAW: "Sabiha Gökçen" };
const HAV = { LHR: "Heathrow", LGW: "Gatwick", STN: "Stansted", LTN: "Luton", LCY: "London City", VIE: "Viyana", MAD: "Madrid" };
const r0 = (n) => Math.round(n);
const num = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;
const GUN = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const gun = (s) => GUN[new Date(s + "T00:00:00Z").getUTCDay()];

export const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5);
export function due(team, today, force = false) {
  if (force) return true;
  const r = team.robot || {};
  return !r.son_arama || daysBetween(r.son_arama, today) >= (r.her_kac_gun || 2);
}
export const upcoming = (team, today) => (team.maclar || []).filter((m) => m.tarih >= today);

/** Otel satırından vergili toplam: tanınmış site ya da otelin kendi sitesi; yoksa Google'ın gösterdiği toplam. */
export function hotelTotal(r) {
  if (!r || !num(r.totalPrice)) return null;
  const k = num(r.totalPriceBeforeTaxes) ? r.totalPrice / r.totalPriceBeforeTaxes : 1;
  const ok = (r.bookingOptions || []).filter((b) => num(b.totalStayPrice) && (b.isOfficialSite || TRUSTED.test(b.provider || "")));
  if (!ok.length) return r0(r.totalPrice);
  const b = ok.sort((x, y) => x.totalStayPrice - y.totalStayPrice)[0];
  return r0(b.totalStayPrice * k);
}

/** Uçuş satırlarından seçenek listesi: havayolu + havalimanı başına en ucuz aktarmasız gidiş-dönüş, dönüş saatiyle. */
export function flightOptions(rows) {
  const fl = rows.filter((r) => r && r.recordType === "flight" && num(r.price));
  const dep = fl.filter((r) => r.section !== "returning" && r.stops === 0);
  const ret = fl.filter((r) => r.section === "returning" && r.stops === 0);
  const best = {};
  const tr = (a) => (a === "Turkish Airlines" ? "THY" : a);
  const add = (r, back) => {
    const price = back ? back.price : r.price, ayni = !back || back.airline === r.airline;
    const key = (ayni ? r.airline : r.airline + "+" + back.airline) + "|" + r.destination;
    if (best[key] && best[key].fiyat <= price) return;
    best[key] = {
      fiyat: r0(price), havayolu: ayni ? tr(r.airline) : `${tr(r.airline)} gidiş + ${tr(back.airline)} dönüş`,
      havalimani: HAV[r.destination] || r.destination, kod: r.destination, ayni,
      not: `${gun(r.departureDate)} ${r.origin} ${r.departureTime} → ${r.destination} ${r.arrivalTime}` + (back ? `, ${gun(back.departureDate)} ${back.departureTime} dönüş` : ""),
      gidis: `${gun(r.departureDate)} ${r.origin} ${r.departureTime} → ${r.destination} ${r.arrivalTime}${r.flightNumbers ? " (" + r.flightNumbers.join(", ") + ")" : ""}`,
      donus: back ? `${gun(back.departureDate)} ${back.origin} ${back.departureTime} → ${back.destination} ${back.arrivalTime}` : null,
    };
  };
  for (const r of dep) {
    const backs = ret.filter((x) => Array.isArray(x.outboundFlightNumbers) && String(x.outboundFlightNumbers) === String(r.flightNumbers)).sort((a, b) => a.price - b.price);
    if (!backs.length) { add(r, null); continue; }
    add(r, backs[0]);
    const same = backs.find((x) => x.airline === r.airline);
    if (same && same !== backs[0]) add(r, same);
  }
  return Object.values(best).sort((a, b) => a.fiyat - b.fiyat);
}

/** Maçı yeni fiyatlarla günceller; bulunamayan fiyat eskisini korur. Değişen kalemleri döndürür. */
export function applyMatch(m, flightRows, hotelRows) {
  const log = [];
  const opts = flightOptions(flightRows || []);
  if (opts.length) {
    const top = opts.slice(0, 8).map(({ fiyat, havayolu, havalimani, not }) => ({ fiyat, havayolu, havalimani, not }));
    m.ucus.secenekler = top;
    const tekHavayolu = opts.find((o) => o.ayni) || opts[0];
    m.ucus.oneri = { fiyat: tekHavayolu.fiyat, havayolu: tekHavayolu.havayolu, aktarma: 0, havalimani: `${tekHavayolu.havalimani} (${tekHavayolu.kod})`, gidis: tekHavayolu.gidis, donus: tekHavayolu.donus || m.ucus.oneri.donus };
    const sum = (flightRows || []).filter((r) => r && r.recordType === "search-summary");
    const lv = sum.map((s) => s.priceLevel).find(Boolean);
    if (lv) m.ucus.seviye = lv === "high" ? "yuksek" : lv === "low" ? "dusuk" : "normal";
    const lo = Math.min(...sum.map((s) => s.typicalPriceLow).filter(num)), hi = Math.max(...sum.map((s) => s.typicalPriceHigh).filter(num));
    if (Number.isFinite(lo) && Number.isFinite(hi)) m.ucus.normal_aralik = `${lo}–${hi} €`;
    m.butce.ucuz.ucus = opts[0].fiyat; m.butce.konforlu.ucus = tekHavayolu.fiyat;
    log.push(`uçak ${opts[0].fiyat}–${tekHavayolu.fiyat} €`);
  } else log.push("uçak bulunamadı, eski fiyat kaldı");
  let n = 0;
  for (const h of m.oteller) {
    const r = (hotelRows || []).find((x) => x && x.input === h.arama);
    const t = hotelTotal(r);
    if (t) { h.toplam = t; n++; delete h.eski; } else h.eski = true;
  }
  const min = (k) => { const l = m.oteller.filter((h) => h.kategori === k && !h.eski).map((h) => h.toplam); return l.length ? Math.min(...l) : null; };
  const k = min("konforlu"), u = min("ucuz");
  if (k) m.butce.konforlu.otel = r0(k / 2);
  if (u) m.butce.ucuz.otel = r0(u / 2);
  log.push(`otel ${n}/${m.oteller.length}`);
  return log;
}

async function main() {
  const token = process.env.APIFY_TOKEN;
  const team = JSON.parse(await readFile(FILE, "utf8"));
  const today = process.env.BUGUN || istanbulToday();
  const list = upcoming(team, today);
  if (!list.length) return console.log("Yaklaşan maç yok.");
  if (!due(team, today, process.env.ZORLA === "1")) return console.log(`Son arama ${team.robot.son_arama}; ${team.robot.her_kac_gun} günde bir aranıyor, bugün atlandı.`);
  if (!token) throw new Error("APIFY_TOKEN yok");
  const use = await apifyUsage({ token });
  if (use && use.sinir && use.usd > use.sinir - (team.robot.butce_payi_usd || 5)) return console.log(`Apify kullanımı ${use.usd}/${use.sinir} $: bütçe payı korunuyor, arama yapılmadı.`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const lines = list.flatMap((m) => m.arama_ucus || []);
  const flights = await runActor({ searches: lines, adults: 1, cabinClass: "economy", currency: "EUR", market: "TR", language: "en", sortBy: "price",
    maxResultsPerSearch: 30, maxItems: lines.length * 30 + 20, includePriceInsights: true, includeSearchSummary: true, returnFlightsTop: 4, maxConcurrency: 3 },
    { token, actor: "eiv~google-flights-scraper", sleep, maxPolls: 80 }).catch((e) => { console.log("uçak hatası:", e.message); return []; });
  for (const m of list) {
    const hotels = await runActor({ hotels: m.oteller.map((h) => h.arama), checkInDate: m.gidis, checkOutDate: m.donus, adults: 2, currency: "EUR", country: "tr", language: "en", maxConcurrency: 8 },
      { token, sleep, maxPolls: 60 }).catch((e) => { console.log(m.sehir, "otel hatası:", e.message); return []; });
    const fr = flights.filter((r) => (m.arama_ucus || []).includes(r.input));
    console.log(m.sehir + ":", applyMatch(m, fr, hotels).join(", "));
  }
  const after = await apifyUsage({ token }).catch(() => null);
  team.robot.son_arama = today;
  team.guncellendi = today;
  if (use && after) team.robot.son_maliyet_usd = Math.round((after.usd - use.usd) * 100) / 100;
  await writeFile(FILE, JSON.stringify(team, null, 1) + "\n");
  console.log("maliyet:", team.robot.son_maliyet_usd ?? "?", "$");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch((e) => { console.error("HATA:", String(e.message).split(process.env.APIFY_TOKEN || "§").join("***")); process.exit(1); });
