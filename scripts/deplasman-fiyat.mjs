// Deplasman fiyat robotu: data/fenerbahce.json'daki yaklaşan maçlar için uçak (eiv~google-flights-scraper) ve
// otel (eiv~google-hotels-scraper) fiyatlarını günceller. Oynanmış maça bakmaz. robot.her_kac_gun günde bir arar
// (ZORLA=1 ile hemen). Kişi başı bütçede uçak ve otel kalemleri buradan; transfer, bilet, yemek, gezi elle kalır.
// Bütçe: Apify aylık sayacı sınıra robot.butce_payi_usd kadar yaklaştıysa aramaz.
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runActor, apifyUsage, istanbulToday } from "./otel-fiyatlari.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
// Takımlar: data/takimlar.json → data/<slug>.json (fenerbahce, galatasaray, besiktas …)
const TEAMS_FILE = root + "data/takimlar.json";
const TRUSTED = /booking|expedia|hotels\.com|agoda|trip\.com|priceline/i;
const AD = { IST: "İstanbul", SAW: "Sabiha Gökçen" };
const HAV = { BER: "Berlin", LHR: "Heathrow", LGW: "Gatwick", STN: "Stansted", LTN: "Luton", LCY: "London City", VIE: "Viyana", MAD: "Madrid", ATH: "Atina", CDG: "Charles de Gaulle", ORY: "Orly", CGN: "Köln/Bonn", DUS: "Düsseldorf", LCA: "Larnaka", MUC: "Münih", NUE: "Nürnberg", KRK: "Krakov", BSL: "Basel-Mulhouse", SXB: "Strazburg", RVN: "Rovaniemi", HEL: "Helsinki", FRA: "Frankfurt", DRS: "Dresden", SZG: "Salzburg", GDN: "Gdańsk", BRU: "Brüksel", CRL: "Charleroi", EDI: "Edinburgh" };
const r0 = (n) => Math.round(n);
const num = (x) => typeof x === "number" && Number.isFinite(x) && x > 0;
const GUN = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const gun = (s) => GUN[new Date(s + "T00:00:00Z").getUTCDay()];

export const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5);
export function due(team, today, force = false) {
  if (force) return true;
  const r = team.robot || {};
  if (r.zorla) return true;
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

/** Uçuş satırlarından tüm aktarmasız gidiş-dönüş adayları (gidiş × o gidişin dönüşleri), ucuzdan pahalıya.
 *  Dönüşü bilinmeyen gidiş de aday olur (dönüş bilgisi boş). */
export function flightOptions(rows, { aktarmaOk = false } = {}) {
  const fl = rows.filter((r) => r && r.recordType === "flight" && num(r.price));
  // Aktarmasız uçuş yoksa (ör. İstanbul–Larnaka) aktarmalılar da aday olur
  const direkt = fl.some((r) => r.section !== "returning" && r.stops === 0);
  // aktarmaOk: direkt sefer olsa da aktarmalılar da aday (ör. Krakov Pazartesi dönüşü yalnız Varşova aktarmalı)
  const ok = (r) => (direkt && !aktarmaOk ? r.stops === 0 : true);
  const dep = fl.filter((r) => r.section !== "returning" && ok(r));
  const ret = fl.filter((r) => r.section === "returning" && ok(r));
  const tr = (a) => (a === "Turkish Airlines" ? "THY" : a);
  const make = (r, back) => {
    const ayni = !back || back.airline === r.airline;
    return {
      fiyat: r0(back ? back.price : r.price), havayolu: ayni ? tr(r.airline) : `${tr(r.airline)} gidiş + ${tr(back.airline)} dönüş`,
      havalimani: HAV[r.destination] || r.destination, kod: r.destination, ayni, aktarma: Math.max(r.stops || 0, back ? back.stops || 0 : 0),
      not: `${gun(r.departureDate)} ${r.origin} ${r.departureTime} → ${r.destination} ${r.arrivalTime}` + (back ? `, ${gun(back.departureDate)} ${back.departureTime} dönüş` : "") + (r.stops ? ` · ${r.stops} aktarma` : ""),
      gidis: `${gun(r.departureDate)} ${r.origin} ${r.departureTime} → ${r.destination} ${r.arrivalTime}${r.flightNumbers ? " (" + r.flightNumbers.join(", ") + ")" : ""}`,
      donus: back ? `${gun(back.departureDate)} ${back.origin} ${back.departureTime} → ${back.destination} ${back.arrivalTime}` : null,
      donusSaat: back ? back.departureTime : null,
    };
  };
  const all = [];
  for (const r of dep) {
    const backs = ret.filter((x) => Array.isArray(x.outboundFlightNumbers) && String(x.outboundFlightNumbers) === String(r.flightNumbers));
    if (!backs.length) all.push(make(r, null)); else for (const b of backs) all.push(make(r, b));
  }
  return all.sort((x, y) => x.fiyat - y.fiyat);
}

/** Maçı yeni fiyatlarla günceller; bulunamayan fiyat eskisini korur. Değişen kalemleri döndürür. */
export function applyMatch(m, flightRows, hotelRows) {
  const log = [];
  let opts = flightOptions(flightRows || [], { aktarmaOk: !!m.aktarma_ok });
  // Havalimanı tercihi (ör. CGN): o havalimanına uygun dönüşlü seçenek varsa yalnız onlar kullanılır (tren planı buna göre)
  if (m.havalimani_tercih) { const t = opts.filter((o) => o.kod === m.havalimani_tercih && (!m.donus_min || (o.donusSaat && o.donusSaat >= m.donus_min))); if (t.length) opts = t; }
  if (opts.length) {
    const uniq = []; for (const o of opts) if (!uniq.some((u) => u.havayolu === o.havayolu && u.havalimani === o.havalimani)) uniq.push(o);
    const top = uniq.slice(0, 8).map(({ fiyat, havayolu, havalimani, not }) => ({ fiyat, havayolu, havalimani, not }));
    m.ucus.secenekler = top;
    // Öneri: aynı havayolu + dönüş saati uygun > aynı havayolu + dönüşü bilinen > dönüşü bilinen herhangi > ilk
    const uygunDonus = (o) => o.donusSaat && (!m.donus_min || o.donusSaat >= m.donus_min);
    const tekHavayolu = opts.find((o) => o.ayni && uygunDonus(o)) || opts.find((o) => o.ayni && o.donus) || opts.find((o) => uygunDonus(o)) || opts.find((o) => o.donus) || opts[0];
    if (!tekHavayolu.donus) log.push("UYARI: dönüş seferi bulunamadı");
    m.ucus.oneri = { fiyat: tekHavayolu.fiyat, havayolu: tekHavayolu.havayolu, aktarma: tekHavayolu.aktarma || 0, havalimani: `${tekHavayolu.havalimani} (${tekHavayolu.kod})`, gidis: tekHavayolu.gidis, donus: tekHavayolu.donus || (m.ucus.oneri && m.ucus.oneri.donus) || null };
    const sum = (flightRows || []).filter((r) => r && r.recordType === "search-summary");
    const lv = sum.map((s) => s.priceLevel).find(Boolean);
    if (lv) m.ucus.seviye = lv === "high" ? "yuksek" : lv === "low" ? "dusuk" : "normal";
    const lo = Math.min(...sum.map((s) => s.typicalPriceLow).filter(num)), hi = Math.max(...sum.map((s) => s.typicalPriceHigh).filter(num));
    if (Number.isFinite(lo) && Number.isFinite(hi)) m.ucus.normal_aralik = `${lo}–${hi} €`;
    m.butce.ucuz.ucus = opts[0].fiyat; m.butce.konforlu.ucus = tekHavayolu.fiyat;
    log.push(`uçak ${opts[0].fiyat}–${tekHavayolu.fiyat} €`);
  } else log.push("uçak bulunamadı, eski fiyat kaldı");
  // Konaklama: tek şehir (m.oteller, tüm geceler) ya da gece gece farklı şehir (m.konaklama[i].oteller, 1'er gece)
  const segs = m.konaklama ? m.konaklama.map((k, i) => ({ seg: k, rows: (hotelRows && hotelRows[i]) || [] })) : [{ seg: m, rows: hotelRows || [] }];
  let n = 0, all = 0;
  for (const { seg, rows } of segs) {
    const yeni = seg.oteller.map((h) => hotelTotal(rows.find((x) => x && x.input === h.arama)));
    seg.oteller.forEach((h, i) => {
      all++;
      const t = yeni[i];
      // Aşırı fiyat (ör. süit fiyatı): aynı aramadaki diğer otellerin ortancasının 3 katından fazlaysa gösterilmez
      const diger = yeni.filter((x, j) => j !== i && num(x)).sort((a, b) => a - b);
      const med = diger.length >= 2 ? diger[Math.floor((diger.length - 1) / 2)] : null;
      if (t && med && t > 3 * med) { h.toplam = null; h.eski = true; h.kontrol = `${t} € bulundu, diğer otellerin ortancasının ${(t / med).toFixed(1)} katı: süit/özel oda olabilir, gösterilmiyor`; log.push(`UYARI: ${h.ad} ${t} € aşırı, gizlendi`); return; }
      if (t) { h.toplam = t; n++; delete h.eski; delete h.kontrol; } else h.eski = true;
    });
  }
  // Bütçe oteli: secim'de adı verilen otel (yoksa kategorinin en ucuzu); konaklamada gecelerin toplamı
  // secim yoksa ilk fiyatlı aramada kendiliğinden seçilir: kategorinin en uygunu (konforlu yoksa lüks)
  for (const { seg } of segs) {
    const cheapest = (k) => seg.oteller.filter((h) => h.kategori === k && num(h.toplam)).sort((a, b) => a.toplam - b.toplam)[0];
    seg.secim = seg.secim || {};
    const fiyatli = (ad) => seg.oteller.some((h) => h.ad === ad && num(h.toplam));
    if (seg.secim.sabit) continue; // elle seçilmiş (ör. Londra: iki planda da Premier Inn)
    if (!seg.secim.konforlu || !fiyatli(seg.secim.konforlu)) { const h = cheapest("konforlu") || cheapest("pahali"); if (h) seg.secim.konforlu = h.ad; }
    // Uygun plan: konforludan ayrı, fiyatı gerçek, "uygun" sınıfında bir otel; yoksa uygun plan yok
    if (!seg.secim.ucuz || !fiyatli(seg.secim.ucuz) || seg.secim.ucuz === seg.secim.konforlu) {
      const h = cheapest("ucuz"); if (h && h.ad !== seg.secim.konforlu) seg.secim.ucuz = h.ad; else delete seg.secim.ucuz;
    }
  }
  const pick = (seg, k) => { const s = seg.secim && seg.secim[k] && seg.oteller.find((h) => h.ad === seg.secim[k]); if (s) return s.toplam;
    const l = seg.oteller.filter((h) => h.kategori === k && !h.eski).map((h) => h.toplam); return l.length ? Math.min(...l) : null; };
  for (const kat of ["konforlu", "ucuz"]) {
    const v = segs.map(({ seg }) => pick(seg, kat));
    if (v.every((x) => x)) m.butce[kat].otel = r0(v.reduce((a, b) => a + b, 0) / 2);
  }
  // Uygun plan ancak her gecenin ayrı, fiyatlı uygun oteli varsa (ya da seçim elle sabitlenmişse) gösterilir
  m.uygun_plan = segs.every(({ seg }) => seg.secim && (seg.secim.sabit || (seg.secim.ucuz && seg.secim.ucuz !== seg.secim.konforlu)));
  if (!m.uygun_plan) log.push("uygun plan yok (ayrı fiyatlı uygun otel bulunamadı)");
  log.push(`otel ${n}/${all}`);
  // Sınıf–fiyat çelişkisi: alt sınıftaki otel üst sınıftakinden pahalıysa uyarı (kontrol için)
  m.uyarilar = sinifUyarilari(segs.map(({ seg }) => seg));
  for (const u of m.uyarilar) log.push("UYARI: " + u);
  return log;
}

const SINIF = ["ucuz", "konforlu", "pahali", "ikonik"], SINIF_AD = { ucuz: "Uygun", konforlu: "Konforlu", pahali: "Lüks", ikonik: "İkonik" };
/** Bir otel, kendinden üst sınıftaki bir otelden pahalıysa uyarı metni döndürür. */
export function sinifUyarilari(segs) {
  const out = [];
  for (const seg of segs) for (const a of seg.oteller) for (const b of seg.oteller) {
    if (!num(a.toplam) || !num(b.toplam)) continue;
    if (SINIF.indexOf(a.kategori) < SINIF.indexOf(b.kategori) && a.toplam > b.toplam)
      out.push(`${a.ad} (${SINIF_AD[a.kategori]}, ${a.toplam} €) üst sınıftaki ${b.ad} (${SINIF_AD[b.kategori]}, ${b.toplam} €) otelinden pahalı`);
  }
  return out;
}

/** Tren: ÖBB bağlantılarından istenen saate en yakın aktarmasız bağlantıyı (yoksa en yakını) seçer, fiyatı günceller. */
export function applyTrain(t, rows) {
  const ok = (rows || []).filter((c) => c && c.departure && num(c.priceAmount) && c.priceCoversFullJourney !== false);
  if (!ok.length) return false;
  const min = (x) => { const [h, mm] = x.slice(11, 16).split(":").map(Number); return h * 60 + mm; };
  const want = (() => { const [h, mm] = t.saat.split(":").map(Number); return h * 60 + mm; })();
  const near = ok.filter((c) => Math.abs(min(c.departure) - want) <= 180);
  if (!near.length) return false;
  const pool = near.filter((c) => !c.transfers).length ? near.filter((c) => !c.transfers) : near;
  const sec = pool.slice().sort((a, b) => Math.abs(min(a.departure) - want) - Math.abs(min(b.departure) - want) || a.priceAmount - b.priceAmount)[0];
  t.secenekler = ok.slice(0, 6).map((c) => ({ kalkis: c.departure.slice(11, 16), varis: c.arrival.slice(11, 16), sure_dk: c.durationMinutes, aktarma: c.transfers || 0,
    tren: (c.legs || []).map((l) => [l.line, l.number].filter(Boolean).join(" ")).filter(Boolean).join(" + "), fiyat: c.priceAmount }));
  t.secili = { kalkis: sec.departure.slice(11, 16), varis: sec.arrival.slice(11, 16), sure_dk: sec.durationMinutes, aktarma: sec.transfers || 0,
    tren: (sec.legs || []).map((l) => [l.line, l.number].filter(Boolean).join(" ")).filter(Boolean).join(" + "), fiyat: sec.priceAmount };
  t.fiyat = sec.priceAmount;
  return true;
}

async function main() {
  const token = process.env.APIFY_TOKEN;
  const slugs = JSON.parse(await readFile(TEAMS_FILE, "utf8")).takimlar || [];
  for (const slug of slugs) { console.log("== " + slug); await runTeam(slug, token); }
}

async function runTeam(slug, token) {
  const FILE = root + `data/${slug}.json`;
  const team = JSON.parse(await readFile(FILE, "utf8"));
  const today = process.env.BUGUN || istanbulToday();
  const list = upcoming(team, today);
  if (!list.length) return console.log("Yaklaşan maç yok.");
  team.robot = team.robot || {};
  if (!due(team, today, process.env.ZORLA === "1")) return console.log(`Son arama ${team.robot.son_arama}; ${team.robot.her_kac_gun} günde bir aranıyor, bugün atlandı.`);
  if (!token) throw new Error("APIFY_TOKEN yok");
  const use = await apifyUsage({ token });
  if (use && use.sinir && use.usd > use.sinir - (team.robot.butce_payi_usd || 5)) return console.log(`Apify kullanımı ${use.usd}/${use.sinir} $: bütçe payı korunuyor, arama yapılmadı.`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Maç başına ayrı uçuş araması: her maçın kendi kalkış saati aralığı olabilir (ucus_saat, ör. "0-11")
  const flightsOf = {};
  for (const m of list) {
    const lines = m.arama_ucus || []; if (!lines.length) continue;
    // Apify uçuş aracı art arda aramalarda ara sıra FAILED veriyor: 2 kez bekleyip yeniden dene
    for (let deneme = 1; deneme <= 3; deneme++) {
    flightsOf[m.id] = await runActor({ searches: lines, adults: 1, cabinClass: "economy", currency: "EUR", market: "TR", language: "en", sortBy: "price",
      maxResultsPerSearch: 30, maxItems: lines.length * 30 + 20, includePriceInsights: true, includeSearchSummary: true, returnFlightsTop: 4, maxConcurrency: 3,
      ...(m.ucus_saat ? { departureTimeRange: m.ucus_saat } : {}) },
      { token, actor: "eiv~google-flights-scraper", sleep, maxPolls: 80 }).catch((e) => { console.log(m.sehir, "uçak hatası:", e.message); return []; });
    if (flightsOf[m.id].some((r) => r && r.recordType === "flight") || deneme === 3) break;
    console.log(m.sehir, `uçuş yok, ${deneme + 1}. deneme`); await sleep(20000);
    }
  }
  const H = (names, g, c, who) => runActor({ hotels: names, checkInDate: g, checkOutDate: c, adults: 2, currency: "EUR", country: "tr", language: "en", maxConcurrency: 8 },
    { token, sleep, maxPolls: 60 }).catch((e) => { console.log(who, "otel hatası:", e.message); return []; });
  const ertesi = (s) => new Date(Date.parse(s + "T00:00:00Z") + 864e5).toISOString().slice(0, 10);
  for (const m of list) {
    const hotels = m.konaklama
      ? await Promise.all(m.konaklama.map((k) => H(k.oteller.map((h) => h.arama), k.gece, ertesi(k.gece), m.sehir + "/" + k.sehir)))
      : await H(m.oteller.map((h) => h.arama), m.gidis, m.donus, m.sehir);
    const fr = flightsOf[m.id] || [];
    const log = applyMatch(m, fr, hotels);
    // Trenler (ÖBB, Apify jindrich.bar~oebb-ticket-scraper, ~0,0004 $/bağlantı)
    if (Array.isArray(m.trenler) && m.trenler.length) {
      let ok = 0;
      for (const t of m.trenler.filter((x) => !x.sabit)) {
        const rows = await runActor(t.aktor === "db" ? { from: t.nereden, to: t.nereye, date: t.tarih, time: t.arama_saat || t.saat, maxResults: 8 } : { from: t.nereden, to: t.nereye, date: t.tarih, time: t.arama_saat || t.saat, adults: 1, sortBy: "DEPARTURE", maxResults: 8 },
          { token, actor: t.aktor === "db" ? "jindrich.bar~deutsche-bahn-ticket-scraper" : "jindrich.bar~oebb-ticket-scraper", sleep, maxPolls: 60 }).catch((e) => { console.log("tren hatası:", e.message); return []; });
        if (applyTrain(t, rows)) ok++;
      }
      const tr = m.trenler.reduce((a, t) => a + (num(t.fiyat) ? t.fiyat : 0), 0);
      m.butce.konforlu.transfer = r0(tr); m.butce.ucuz.transfer = r0(tr);
      log.push(`tren ${ok}/${m.trenler.filter((x) => !x.sabit).length}`);
    }
    console.log(m.sehir + ":", log.join(", "));
    const uy = log.filter((x) => x.startsWith("UYARI"));
    if (uy.length && process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `### ${team.takim} · ${m.sehir}\n${uy.map((x) => "- " + x).join("\n")}\n`).catch(() => {});
  }
  const after = await apifyUsage({ token }).catch(() => null);
  team.robot.son_arama = today; delete team.robot.zorla;
  team.guncellendi = today;
  if (use && after) team.robot.son_maliyet_usd = Math.round((after.usd - use.usd) * 100) / 100;
  await writeFile(FILE, JSON.stringify(team, null, 1) + "\n");
  console.log("maliyet:", team.robot.son_maliyet_usd ?? "?", "$");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch((e) => { console.error("HATA:", String(e.message).split(process.env.APIFY_TOKEN || "§").join("***")); process.exit(1); });
