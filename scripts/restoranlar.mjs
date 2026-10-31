// Restoran robotu: her başkentin merkezinde Google Maps'te restoran arar (Apify: compass/crawler-google-places),
// kişi başı fiyat aralığını euroya çevirir ve kurallarla 2 uygun, 2 popüler, 2 lüks restoran seçer.
// Modlar:
//   kesif  : merkez çemberinde arama yapar, adayları data/restoran-adaylari.json'a, seçimi data/restoranlar.json'a yazar
//   yenile : seçilen restoranların puan/fiyat/açık-kapalı bilgisini tazeler, kapananı adaylardan yenisiyle değiştirir
//   sec    : Apify'a gitmeden mevcut adaylardan seçimi yeniden yapar (kurallar değişince)
// Bütçe: Apify'ın kendi sayacı ve data/hotels.json > aylik_butce_usd (otel ve uçak robotlarıyla ortak).
// Fiyat bulunamazsa tahmin yürütmez; fiyatsız restoran seçilmez.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runActor, apifyUsage, makeBudget, measureCost, istanbulToday, billingPeriod } from "./otel-fiyatlari.mjs";

export const MAPS_ACTOR = "compass~crawler-google-places";
export const COST_PER_PLACE = 0.0065; // ölçülen: detay sayfasıyla ~0,006 $
const num = (x) => typeof x === "number" && Number.isFinite(x);
const r2 = (x) => Math.round(x * 100) / 100;
const TIERS = ["uygun", "populer", "luks"];

// ---------- kur ----------
export async function fetchFx(cfg, fetchImpl = fetch) {
  const syms = ["HUF", "CZK", "PLN", "SEK", "DKK", "RON", "GBP", "USD"];
  for (const url of [`https://api.frankfurter.dev/v1/latest?base=EUR&symbols=${syms.join(",")}`, `https://api.frankfurter.app/latest?from=EUR&to=${syms.join(",")}`]) {
    try {
      const r = await fetchImpl(url, { headers: { accept: "application/json" } });
      if (!r.ok) continue;
      const j = await r.json();
      if (j && j.rates && num(j.rates.HUF)) return { kaynak: "ECB " + j.date, ...cfg.sabit_kur, ...j.rates, EUR: 1 };
    } catch {}
  }
  return { kaynak: "yedek kur (ayarlar)", ...cfg.yedek_kur, ...cfg.sabit_kur, EUR: 1 };
}

// ---------- fiyat yazısı ----------
const SYMBOLS = [[/Ft|HUF/i, "HUF"], [/Kč|CZK/i, "CZK"], [/zł|PLN/i, "PLN"], [/lei|RON/i, "RON"], [/лв|BGN/i, "BGN"], [/€|EUR/i, "EUR"], [/£|GBP/i, "GBP"], [/\$|USD/i, "USD"], [/SEK/i, "SEK"], [/DKK/i, "DKK"], [/kr/i, null]];
const toNumber = (t) => {
  const s = t.replace(/\s/g, "");
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, "")); // binlik ayırıcı
  return Number(s.replace(",", "."));
};
// "Ft 2,000–4,000" → { alt: 2000, ust: 4000, para: "HUF" }; "€100+" → { alt: 100, ust: null, arti: true }
export function parsePrice(text, cityCurrency) {
  if (!text || typeof text !== "string") return null;
  const nums = (text.match(/\d[\d.,\s]*\d|\d/g) || []).map(toNumber).filter(num);
  if (!nums.length) return null;
  let para = null;
  for (const [re, c] of SYMBOLS) if (re.test(text)) { para = c || (["SEK", "DKK"].includes(cityCurrency) ? cityCurrency : null); break; }
  para = para || cityCurrency || "EUR";
  return { alt: nums[0], ust: nums.length > 1 ? nums[1] : null, arti: /\+/.test(text), para };
}
// Kişi başı euro: aralığın ortası; "X+" için X'in 1,3 katı
export function perPersonEur(p, fx) {
  if (!p) return null;
  const rate = fx[p.para];
  if (!num(rate) || rate <= 0) return null;
  const v = p.ust != null ? (p.alt + p.ust) / 2 : p.arti ? p.alt * 1.3 : p.alt;
  return Math.round((v / rate) * 10) / 10;
}

// ---------- mutfak adı (Türkçe) ----------
// Google Maps'in İngilizce kategori adı -> sitede gösterilen Türkçe ad. Listede yoksa milliyet sözlüğü,
// o da yoksa sondaki " restaurant" atılır.
export const MUTFAK_TR = {
  "Restaurant": "Restoran", "Fine dining restaurant": "Gurme", "Haute French restaurant": "Fransız (üst düzey)",
  "Modern European restaurant": "Modern Avrupa", "Modern French restaurant": "Modern Fransız", "European restaurant": "Avrupa mutfağı",
  "Hungarian restaurant": "Macar mutfağı", "Breakfast restaurant": "Kahvaltı", "Brunch restaurant": "Brunch",
  "Doner kebab restaurant": "Döner", "Kebab shop": "Kebap", "Tapas restaurant": "Tapas", "Tapas bar": "Tapas",
  "Sandwich shop": "Sandviç", "Steak house": "Steakhouse", "Hamburger restaurant": "Hamburger", "Pizza restaurant": "Pizza",
  "Seafood restaurant": "Deniz ürünleri", "Fish restaurant": "Balık", "Vegan restaurant": "Vegan", "Vegetarian restaurant": "Vejetaryen",
  "Barbecue restaurant": "Mangal / barbekü", "Fast food restaurant": "Fast food", "Cafe": "Kafe", "Coffee shop": "Kahve dükkânı",
  "Bistro": "Bistro", "Brasserie": "Brasserie", "Brewpub": "Bira evi", "Gastropub": "Gastropub", "Pub": "Pub", "Wine bar": "Şarap barı",
  "Bakery": "Fırın", "Patisserie": "Pastane", "Dessert shop": "Tatlıcı", "Ice cream shop": "Dondurmacı", "Deli": "Şarküteri",
  "Asian fusion restaurant": "Asya füzyon", "Fusion restaurant": "Füzyon", "Eclectic restaurant": "Karma mutfak",
  "Chinese noodle restaurant": "Çin eriştesi", "Ramen restaurant": "Ramen", "Sushi restaurant": "Suşi", "Noodle shop": "Erişte",
  "Dumpling restaurant": "Mantı (dumpling)", "Falafel restaurant": "Falafel", "Middle Eastern restaurant": "Orta Doğu",
  "Eastern European restaurant": "Doğu Avrupa", "Mediterranean restaurant": "Akdeniz", "Roman restaurant": "Roma mutfağı",
  "Tuscan restaurant": "Toskana mutfağı", "Neapolitan restaurant": "Napoli mutfağı", "Basque restaurant": "Bask mutfağı",
  "Bavarian restaurant": "Bavyera mutfağı", "Organic restaurant": "Organik", "Family restaurant": "Aile restoranı",
  "Buffet restaurant": "Açık büfe", "Grill": "Izgara", "Chicken restaurant": "Tavuk", "Meat dish restaurant": "Et yemekleri",
  "Soup restaurant": "Çorba", "Salad shop": "Salata", "Food court": "Yemek alanı", "Market": "Pazar",
};
const MILLIYET = {
  Italian: "İtalyan", French: "Fransız", Spanish: "İspanyol", Portuguese: "Portekiz", Greek: "Yunan", Turkish: "Türk",
  German: "Alman", Austrian: "Avusturya", Belgian: "Belçika", Dutch: "Hollanda", Irish: "İrlanda", British: "İngiliz", English: "İngiliz",
  Scandinavian: "İskandinav", Danish: "Danimarka", Swedish: "İsveç", Finnish: "Fin", Norwegian: "Norveç", Nordic: "Kuzey",
  Polish: "Polonya", Czech: "Çek", Slovak: "Slovak", Hungarian: "Macar", Romanian: "Romen", Bulgarian: "Bulgar", Croatian: "Hırvat",
  Slovenian: "Sloven", Serbian: "Sırp", Balkan: "Balkan", Lithuanian: "Litvanya", Latvian: "Letonya", Estonian: "Estonya", Ukrainian: "Ukrayna",
  Russian: "Rus", Georgian: "Gürcü", Armenian: "Ermeni", Maltese: "Malta", Luxembourgish: "Lüksemburg",
  Asian: "Asya", Chinese: "Çin", Japanese: "Japon", Korean: "Kore", Thai: "Tay", Vietnamese: "Vietnam", Indian: "Hint",
  Nepalese: "Nepal", Pakistani: "Pakistan", Indonesian: "Endonezya", Malaysian: "Malezya", Filipino: "Filipin",
  Lebanese: "Lübnan", Israeli: "İsrail", Persian: "İran", Moroccan: "Fas", Ethiopian: "Etiyopya", African: "Afrika",
  American: "Amerikan", Mexican: "Meksika", Peruvian: "Peru", Venezuelan: "Venezuela", Argentinian: "Arjantin", Brazilian: "Brezilya", Cuban: "Küba",
};
// Kilitli (tablodan düzenlenmiş) restoranda kullanıcının yazdığı Türkçe ad korunur
export const withMutfakTr = (x) => ({ ...x, mutfakTr: x.kilit && x.mutfakTr ? x.mutfakTr : mutfakTr(x.mutfak) });
export function mutfakTr(en) {
  if (!en || typeof en !== "string") return null;
  const s = en.trim();
  if (MUTFAK_TR[s]) return MUTFAK_TR[s];
  const m = s.match(/^(.+?) (restaurant|cuisine|food)$/i);
  if (m && MILLIYET[m[1]]) return MILLIYET[m[1]];
  return s.replace(/ restaurant$/i, "");
}

// ---------- aday ----------
export function toCandidate(r, city, fx) {
  if (!r || !r.title || !r.placeId) return null;
  const fp = parsePrice(r.price, city.para);
  return {
    id: r.placeId, ad: r.title, mutfak: r.categoryName || null, mutfakTr: mutfakTr(r.categoryName), kategoriler: r.categories || [],
    puan: num(r.totalScore) ? r.totalScore : null, yorum: num(r.reviewsCount) ? r.reviewsCount : 0,
    fiyatYazi: r.price || null, kisiBasiEur: perPersonEur(fp, fx), artiFiyat: !!(fp && fp.arti),
    semt: r.neighborhood || null, konum: r.location && num(r.location.lat) ? [Math.round(r.location.lat * 1e5) / 1e5, Math.round(r.location.lng * 1e5) / 1e5] : null,
    url: r.url || null, web: r.website || null, rezervasyon: r.reserveTableUrl || null,
    kapali: !!(r.permanentlyClosed || r.temporarilyClosed), arama: r.searchString || null,
  };
}

const lower = (s) => String(s || "").toLowerCase();
export function eligible(c, cfg) {
  if (!c || c.kapali || !num(c.kisiBasiEur) || !num(c.puan)) return false;
  if (cfg.haric.some((w) => lower(c.ad).includes(lower(w)))) return false;
  if (cfg.haric_kategori.some((k) => lower(c.mutfak) === lower(k))) return false;
  return true;
}
const bayes = (c, m = 200, C = 4.3) => (c.yorum * c.puan + m * C) / (c.yorum + m);
const isFine = (c) => /fine dining/i.test(c.mutfak || "") || (c.kategoriler || []).some((k) => /fine dining/i.test(k));

// Seçim: şehrin fiyatlı adaylarını kişi başı fiyata göre üçe ayırır. Uygun: en ucuz %35.
// Lüks: şehrin ortanca fiyatının en az 1,8 katı (ve üst %25). "Fine dining" etiketi tek başına yetmez, sadece öncelik verir.
export function selectRestaurants(cands, cfg) {
  const R = cfg.secim;
  const pool = cands.filter((c) => eligible(c, cfg));
  const byPrice = pool.slice().sort((a, b) => a.kisiBasiEur - b.kisiBasiEur);
  const q = (f) => byPrice.length ? byPrice[Math.min(byPrice.length - 1, Math.floor(f * byPrice.length))].kisiBasiEur : 0;
  const lo = q(0.35), med = q(0.5), hi = Math.max(q(0.75), Math.round(med * 1.8 * 10) / 10);
  const isLux = (c) => c.kisiBasiEur >= hi || (isFine(c) && c.kisiBasiEur >= hi * 0.8) || (c.artiFiyat && c.kisiBasiEur >= med * 1.5);
  const tierOf = (c) => (isLux(c) ? "luks" : c.kisiBasiEur <= lo ? "uygun" : "populer");
  const used = new Set(), out = [];
  const pick = (tier, list, n) => {
    const got = [];
    for (const c of list) {
      if (got.length >= n) break;
      if (used.has(c.id)) continue;
      if (got.some((g) => g.mutfak && g.mutfak === c.mutfak && c.mutfak !== "Restaurant")) continue; // aynı mutfaktan ikinci olmasın
      used.add(c.id); got.push({ ...c, seviye: tier });
    }
    return got;
  };
  const minY = R.min_yorum, okP = (c) => c.puan >= R.min_puan;
  const luks = pool.filter((c) => tierOf(c) === "luks" && okP(c) && c.yorum >= R.luks_min_yorum).sort((a, b) => (isFine(b) - isFine(a)) || bayes(b) - bayes(a));
  const uygun = pool.filter((c) => tierOf(c) === "uygun" && okP(c) && c.yorum >= minY).sort((a, b) => bayes(b) - bayes(a));
  const populer = pool.filter((c) => tierOf(c) === "populer" && c.puan >= R.populer_min_puan && c.yorum >= minY).sort((a, b) => b.yorum - a.yorum);
  out.push(...pick("uygun", uygun, R.uygun), ...pick("populer", populer, R.populer), ...pick("luks", luks, R.luks));
  // eksik kalan seviyeyi komşu seviyeden doldur (puan şartı korunur)
  for (const t of TIERS) {
    const need = R[t] - out.filter((x) => x.seviye === t).length;
    if (need <= 0) continue;
    const backup = pool.filter((c) => okP(c) && c.yorum >= Math.min(minY, R.luks_min_yorum) && !used.has(c.id) && (t !== "luks" || isLux(c)) && (t !== "uygun" || c.kisiBasiEur <= med))
      .sort((a, b) => (t === "uygun" ? a.kisiBasiEur - b.kisiBasiEur : t === "luks" ? b.kisiBasiEur - a.kisiBasiEur : b.yorum - a.yorum));
    out.push(...pick(t, backup, need).map((x) => ({ ...x, yedek: true })));
  }
  return { secilen: TIERS.flatMap((t) => out.filter((x) => x.seviye === t).sort((a, b) => a.kisiBasiEur - b.kisiBasiEur)), esik: { uygun: lo, luks: hi }, aday: pool.length };
}

// ---------- Apify girdileri ----------
export function searchInput(cfg, city) {
  const [lat, lng] = city.merkez;
  return {
    searchStringsArray: cfg.aramalar.map((a) => a.metin),
    customGeolocation: { type: "Point", coordinates: [lng, lat], radiusKm: city.yaricap_km },
    maxCrawledPlacesPerSearch: Math.max(...cfg.aramalar.map((a) => a.sayi)),
    language: "en", skipClosedPlaces: true, scrapePlaceDetailPage: true, maxReviews: 0, maxImages: 0, maxQuestions: 0,
  };
}
export function refreshInput(items) {
  return { startUrls: items.filter((x) => x.url).map((x) => ({ url: x.url })), language: "en", scrapePlaceDetailPage: true, maxReviews: 0, maxImages: 0, maxQuestions: 0 };
}

// ---------- ana akış ----------
export function emptyRestaurants() { return { guncellendi: null, kaynak: "Google Maps (Apify: compass/crawler-google-places)", aciklama: "Kişi başı fiyat: Google'daki kullanıcıların bildirdiği aralığın ortası, euroya çevrilmiş", kur: null, harcama: { donem: null, usd: 0 }, apifyKullanim: null, olcumler: [], sehirler: {} }; }

async function pool(items, size, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k]); } })); }

export async function run({ token, cfg, state = emptyRestaurants(), cands = { sehirler: {} }, hotelSettings = {}, mode = "kesif", only = null, now = new Date(), fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), concurrency = 3 }) {
  state = { ...emptyRestaurants(), ...structuredClone(state) }; cands = structuredClone(cands); cands.sehirler ||= {};
  const t = now.toISOString(), cities = cfg.sehirler.filter((c) => !only || only.includes(c.sehir));
  const report = { mod: mode, sehir: 0, aday: 0, secilen: 0, eksik: [], degisen: [], hatalar: [], tahminiMaliyetUsd: 0 };
  const fx = await fetchFx(cfg, fetchImpl); state.kur = { kaynak: fx.kaynak, tarih: t.slice(0, 10) };
  let usage = null, B = null;
  if (mode !== "sec") {
    if (!token) throw new Error("APIFY_TOKEN tanımlı değil (GitHub > Settings > Secrets and variables > Actions bölümüne eklenmeli)");
    const donem = billingPeriod(istanbulToday(now), hotelSettings.fatura_gunu || 1);
    if (!state.harcama || state.harcama.donem !== donem) state.harcama = { donem, usd: 0 };
    usage = await apifyUsage({ token, fetchImpl });
    if (usage) state.apifyKullanim = { ...usage, kontrol: t };
    B = makeBudget(state, hotelSettings.aylik_butce_usd, usage);
  }
  let fatal = null, places = 0;
  await pool(cities, mode === "sec" ? 1 : concurrency, async (city) => {
    if (fatal) return;
    let list = (cands.sehirler[city.sehir] || {}).adaylar || [];
    if (mode !== "sec") {
      const cur = (state.sehirler[city.sehir] || {}).restoranlar || [];
      const input = mode === "kesif" ? searchInput(cfg, city) : refreshInput(cur);
      const n = mode === "kesif" ? cfg.aramalar.reduce((a, s) => a + s.sayi, 0) : input.startUrls.length;
      if (!n) return;
      const est = n * COST_PER_PLACE;
      if (!B.reserve(est)) { report.hatalar.push(`${city.sehir}: bütçe sınırı, atlandı`); return; }
      let rows = [];
      try { rows = await runActor(input, { token, fetchImpl, sleep, actor: MAPS_ACTOR, maxPolls: 80 }); }
      catch (e) {
        const msg = String(e.message).split(token).join("***");
        B.release(est); if (e.fatal) { fatal = msg; return; }
        report.hatalar.push(`${city.sehir}: ${msg}`); return;
      }
      B.release(est); B.spend(rows.length * COST_PER_PLACE); report.tahminiMaliyetUsd += rows.length * COST_PER_PLACE; places += rows.length;
      const fresh = rows.map((r) => toCandidate(r, city, fx)).filter(Boolean);
      const byId = new Map(list.map((c) => [c.id, c]));
      for (const c of fresh) byId.set(c.id, { ...(byId.get(c.id) || {}), ...c, kontrol: t });
      list = [...byId.values()];
      cands.sehirler[city.sehir] = { guncellendi: t, adaylar: list };
    }
    // Tablodan elle düzenlenen (kilit) restoranlar olduğu gibi kalır; Aktif=HAYIR yapılanlar (haric) bir daha seçilmez.
    const prevCity = state.sehirler[city.sehir] || {};
    const haric = new Set(prevCity.haric || []);
    const locked = (prevCity.restoranlar || []).filter((x) => x.kilit).map((x) => {
      const c = list.find((c) => c.id === x.id);
      return c ? { ...x, puan: c.puan ?? x.puan, yorum: c.yorum ?? x.yorum, konum: x.konum || c.konum || null, semt: x.semt || c.semt || null } : x;
    });
    const lockedIds = new Set(locked.map((x) => x.id));
    list = list.filter((c) => !haric.has(c.id) && !lockedIds.has(c.id));
    if (!list.length && !locked.length) return;
    const prev = (prevCity.restoranlar || []).map((x) => x.id);
    let sel;
    if (mode === "yenile" && prev.length) {
      // yenilemede seçim korunur; sadece kapanan ya da şartı kaybedenler değiştirilir
      const keep = prev.map((id) => list.find((c) => c.id === id)).filter((c) => c && eligible(c, cfg) && c.puan >= cfg.secim.min_puan - 0.2);
      const full = selectRestaurants(list, cfg);
      const keepIds = new Set(keep.map((c) => c.id));
      const old = (state.sehirler[city.sehir].restoranlar || []);
      const kept = old.filter((x) => keepIds.has(x.id)).map((x) => ({ ...list.find((c) => c.id === x.id), seviye: x.seviye }));
      const filled = [...kept];
      for (const tier of TIERS) {
        const need = cfg.secim[tier] - filled.filter((x) => x.seviye === tier).length;
        filled.push(...full.secilen.filter((x) => x.seviye === tier && !keepIds.has(x.id) && !filled.some((f) => f.id === x.id)).slice(0, Math.max(0, need)));
      }
      sel = { ...full, secilen: TIERS.flatMap((tier) => filled.filter((x) => x.seviye === tier).sort((a, b) => a.kisiBasiEur - b.kisiBasiEur)) };
    } else sel = selectRestaurants(list, cfg);
    sel = { ...sel, secilen: TIERS.flatMap((tier) => {
      const L = locked.filter((x) => x.seviye === tier);
      return [...L, ...sel.secilen.filter((x) => x.seviye === tier).slice(0, Math.max(0, cfg.secim[tier] - L.length))].sort((a, b) => a.kisiBasiEur - b.kisiBasiEur);
    }) };
    const nowIds = sel.secilen.map((x) => x.id);
    if (prev.length) for (const id of prev) if (!nowIds.includes(id)) report.degisen.push(`${city.sehir}: ${(state.sehirler[city.sehir].restoranlar.find((x) => x.id === id) || {}).ad} çıkarıldı`);
    const total = TIERS.reduce((a, k) => a + cfg.secim[k], 0);
    if (sel.secilen.length < total) report.eksik.push(`${city.sehir}: ${sel.secilen.length}/${total}`);
    state.sehirler[city.sehir] = { guncellendi: t, esik: sel.esik, aday: sel.aday, restoranlar: sel.secilen.map(({ kategoriler, arama, kapali, ...x }) => withMutfakTr(x)), ...(haric.size ? { haric: [...haric] } : {}) };
    report.sehir++; report.aday += sel.aday; report.secilen += sel.secilen.length;
  });
  if (mode !== "sec") {
    state.harcama.usd = r2(state.harcama.usd); report.tahminiMaliyetUsd = r2(report.tahminiMaliyetUsd);
    report.gercekMaliyet = await measureCost({ token, fetchImpl, sleep, before: usage, holder: state, robot: "restoran-" + mode, queries: places, t });
  }
  if (report.sehir) state.guncellendi = t;
  if (!report.sehir && (fatal || report.hatalar.length)) throw new Error("Hiçbir şehir işlenemedi: " + (fatal || report.hatalar[0]));
  return { state, cands, report, fatal };
}

export function toMarkdown({ report, state, cfg }) {
  const L = { uygun: "Uygun", populer: "Popüler", luks: "Lüks" };
  const p = ["# Restoran robotu", "", `Mod: ${report.mod}. Şehir: ${report.sehir}, uygun aday: ${report.aday}, seçilen: ${report.secilen}. Tahmini maliyet: ~${report.tahminiMaliyetUsd} $${report.gercekMaliyet != null ? `, Apify sayacına göre ${report.gercekMaliyet} $` : ""}. Kur: ${state.kur ? state.kur.kaynak : "?"}.`, ""];
  if (report.eksik.length) p.push("Eksik kalan şehirler: " + report.eksik.join(", "), "");
  if (report.degisen.length) p.push("Değişenler:", ...report.degisen.map((x) => "- " + x), "");
  for (const c of cfg.sehirler) {
    const s = state.sehirler[c.sehir]; if (!s) continue;
    p.push(`## ${c.sehir} (eşik: uygun ≤ ${s.esik.uygun} €, lüks ≥ ${s.esik.luks} €)`, "", "| Seviye | Restoran | Mutfak | Puan | Yorum | Fiyat | Kişi başı |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const r of s.restoranlar) p.push(`| ${L[r.seviye]}${r.yedek ? "*" : ""} | ${r.ad} | ${r.mutfakTr || r.mutfak || ""} | ${r.puan} | ${r.yorum} | ${r.fiyatYazi} | ${r.kisiBasiEur} € |`);
    p.push("");
  }
  if (report.hatalar.length) p.push("Hatalar:", ...report.hatalar.map((x) => "- " + x));
  return p.join("\n");
}

async function readJson(path, fallback) { try { return JSON.parse(await readFile(path, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; } }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const P = { cfg: root + "data/restoran-ayarlari.json", state: root + "data/restoranlar.json", cands: root + "data/restoran-adaylari.json", hotels: root + "data/hotels.json" };
  (async () => {
    const cfg = await readJson(P.cfg), hotels = await readJson(P.hotels, { ayarlar: {} });
    const only = (process.env.SEHIR || "").split(",").map((s) => s.trim()).filter(Boolean);
    const out = await run({ token: process.env.APIFY_TOKEN, cfg, state: await readJson(P.state, emptyRestaurants()), cands: await readJson(P.cands, { sehirler: {} }), hotelSettings: hotels.ayarlar, mode: (process.env.MOD || "yenile").trim(), only: only.length ? only : null });
    const md = toMarkdown({ ...out, cfg }); console.log(md);
    if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, md + "\n", { flag: "a" });
    await writeFile(P.state, JSON.stringify(out.state, null, 1) + "\n");
    await writeFile(P.cands, JSON.stringify(out.cands) + "\n");
    if (out.fatal) { console.error("HATA:", out.fatal); process.exit(1); }
  })().catch((e) => { console.error("HATA:", String(e.message).split(process.env.APIFY_TOKEN || "§").join("***")); process.exit(1); });
}
