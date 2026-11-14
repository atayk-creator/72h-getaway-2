// Yeni şehir / deplasman sayfası (yönetim kurulu iş emri, 14 Kasım 2026): 3 hazır paket (Uygun, Konforlu, Lüks),
// her kalemde tarihli derin link, "kendin oluştur", linkte yaşayan plan ve PDF rehber.
// Kalıp: css/plan.css + js/plan.js. Veri: takım dosyasındaki maç (data/<takim>.json) + elle bilgiler (data/plan/<slug>.json).
// Bütün şehirler, deplasman maçları ve Noel şehirleri bu kalıpla üretilir; data/plan/<slug>.json isteğe bağlı elle bilgidir.
// scripts/sehir-sayfalari.mjs çağırır.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const AY = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const AYU = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GUNK = ["PAZ", "PZT", "SAL", "ÇAR", "PER", "CUM", "CMT"];
const D = (s) => new Date(s + "T12:00:00Z");
const gunAy = (s, uzun) => `${D(s).getUTCDate()} ${(uzun ? AYU : AY)[D(s).getUTCMonth()]}`;
const gece = (a, b) => Math.round((D(b) - D(a)) / 864e5);
const kisaAralik = (a, b) => (a.slice(5, 7) === b.slice(5, 7) ? `${D(a).getUTCDate()}–${D(b).getUTCDate()} ${AY[D(b).getUTCMonth()]}` : `${gunAy(a)} – ${gunAy(b)}`);
export const RELEASE = "https://github.com/atayk-creator/72h-getaway-2/releases/download/rehberler";
// Bagaj ve ikram ücretli olan havayolları: Lüks paket bunların dışındaki en uygun uçuşu seçer
const EKONOMIK = /pegasus|ajet|sunexpress|ryanair|easyjet|wizz|transavia|vueling|eurowings|norwegian|volotea|jet2|flynas|corendon/i;
const IATA = { "stansted": "STN", "heathrow": "LHR", "gatwick": "LGW", "luton": "LTN", "orly": "ORY", "charles de gaulle": "CDG", "schiphol": "AMS" };
const KAT = { ucuz: "uygun", konforlu: "konforlu", pahali: "luks", ikonik: "luks" };
const KAT_AD = { uygun: "Uygun", konforlu: "Konforlu", luks: "Lüks" };

const HY_AD = { "Turkish Airlines": "THY", "Pegasus Airlines": "Pegasus", "AJet Airlines": "AJet" };
const hyAd = (h) => String(h || "").split(", ").map((x) => HY_AD[x] || x).join(" + ");
const KULUP = { fenerbahce: "https://www.fenerbahce.org", galatasaray: "https://www.galatasaray.org", besiktas: "https://www.bjk.com.tr" };
const SCHENGEN = new Set(["Fransa", "Belçika", "Hollanda", "Lüksemburg", "Almanya", "Avusturya", "İspanya", "Portekiz", "İtalya", "Malta", "Yunanistan", "İsveç", "Danimarka", "Finlandiya", "Estonya", "Letonya", "Litvanya", "Polonya", "Çekya", "Slovakya", "Macaristan", "Slovenya", "Hırvatistan", "Romanya", "Bulgaristan", "İsviçre", "Norveç", "İzlanda"]);
const VIZESIZ = new Set(["Sırbistan", "Bosna-Hersek", "Karadağ", "Kuzey Makedonya", "Arnavutluk", "Kosova", "Moldova"]);
/** Ülkeye göre vize notu (umuma mahsus pasaport). Resmî kaynaktan teyit edilmesi yazılır. */
export function vizeNotu(ulke) {
  if (SCHENGEN.has(ulke)) return { baslik: "Schengen vizesi gerekir.", yazi: "Randevu ve sonuç haftalar sürebilir; tarihini seçmeden önce vizeni kontrol et.", haric: "vize hariç" };
  if (ulke === "Birleşik Krallık") return { baslik: "İngiltere vizesi gerekir,", yazi: "Schengen geçmez. Vizen yoksa önce resmî siteye bak:", link: "https://www.gov.uk/standard-visitor", linkAd: "gov.uk", haric: "vize hariç" };
  if (ulke === "İrlanda") return { baslik: "İrlanda vizesi gerekir,", yazi: "Schengen ve İngiltere vizesi geçmez. Başvuru:", link: "https://www.irishimmigration.ie/coming-to-visit-ireland/", linkAd: "irishimmigration.ie", haric: "vize hariç" };
  if (VIZESIZ.has(ulke)) return { baslik: "Vize gerekmez:", yazi: `Türkiye Cumhuriyeti pasaportuyla ${ulke} için kısa süreli gezilerde vize istenmiyor. Gitmeden önce Dışişleri Bakanlığı'nın sayfasından teyit et.`, link: "https://www.mfa.gov.tr/turk-vatandaslarinin-tabi-oldugu-vize-uygulamalari.tr.mfa", linkAd: "mfa.gov.tr", haric: "" };
  return null;
}
/** Şehir için örnek 72 saat akışı: gezi.json'daki yerler (popülerlik sırası) ve restoranlardan. */
function ornekPlan(sehir, yerler, rest) {
  const y = (i) => yerler[i], d = (saat, x) => (x ? [saat, x.ad, kes(x.fiyat_yazi || x.tur || "", 50)] : null);
  const r = (sev) => (rest || []).find((x) => x.seviye === sev) || (rest || [])[0];
  const yemek = (saat, ad, x) => [saat, ad, x ? `${x.ad}${x.mutfak ? " · " + x.mutfak : ""}` : ""];
  if (yerler.length < 3) return [];
  return [
    { gun: "Cuma · varış", duraklar: [["Sabah", `İstanbul → ${sehir}`, "Saatler seçtiğin uçuşa göre"], ["Öğlen", "Otele yerleş", "Eşyaları bırak, kısa mola"], d("15:00", y(3)), d("17:00", y(4)), yemek("20:00", "Akşam yemeği", r("Konforlu"))].filter(Boolean) },
    { gun: "Cumartesi · şehir günü", duraklar: [d("09:30", y(0)), yemek("12:30", "Öğle yemeği", r("Uygun")), d("14:00", y(1)), d("16:30", y(2)), yemek("20:00", "Akşam yemeği", r("Pahalı") || r("Konforlu"))].filter(Boolean) },
    { gun: "Pazar · dönüş", duraklar: [d("10:00", y(5)), d("12:00", y(6)), ["Akşam", `${sehir} → İstanbul`, "Havalimanında 2 saat önce ol"]].filter(Boolean) },
  ];
}

// Havayolunun kendi tarihli arama sayfası. 14 Kasım 2026'da denendi: Pegasus tarihleri kabul ediyor; AJet ve THY'nin
// adresleri tarih almıyor (ana sayfaya ya da hata sayfasına düşüyor), o yüzden onlarda yalnızca Google Flights var.
export function havayoluLink(u, gidis, donus) {
  if (/^pegasus$/i.test(String(u.hy0 || "").trim()) && /^[A-Z]{3}$/.test(u.kalkis || "") && /^[A-Z]{3}$/.test(u.ap || ""))
    return { hy: `https://web.flypgs.com/booking?language=tr&adultCount=2&arrivalPort=${u.ap}&departurePort=${u.kalkis}&currency=EUR&dateOption=1&departureDate=${gidis}&returnDate=${donus}`, hyAd: "Pegasus sitesi" };
  return {};
}
const readJson = (p, fb) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fb; } };
const ozet = (root, rel) => { try { return createHash("sha1").update(readFileSync(join(root, rel))).digest("hex").slice(0, 10); } catch { return "0"; } };
const kes = (s, n = 90) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/[\s,;:·]+\S*$/, "") + "…" : s; };

/** Maç dosyasındaki uçuş seçeneği → sayfadaki uçuş satırı. */
function ucusSatiri(s, m, kay, slugify) {
  const not = s.not || s.gidis || "";
  const y = /\b(IST|SAW)\b[^→]*→\s*([A-Z]{3})\b/.exec(not) || [];
  const hvAd = String(s.havalimani || "").replace(/\s*\([A-Z]{3}\)\s*$/, "");
  const ap = y[2] || (/\(([A-Z]{3})\)/.exec(s.havalimani || "") || [])[1] || IATA[hvAd.toLowerCase()] || "";
  const kalkis = y[1] || "IST";
  return {
    id: slugify(`${s.havayolu}-${kalkis}-${ap || hvAd}`), ad: `${s.havayolu} · ${kalkis} → ${hvAd || m.sehir}`,
    dt: not + (s.aktarma === 0 ? " · aktarmasız" : ""), pp: typeof s.fiyat === "number" ? s.fiyat : null, ap, kalkis, k: "live", kay, tam: EKONOMIK.test(s.havayolu) ? 0 : 1,
  };
}

/** Bir maç (ya da Noel şehri) için sayfa verisi. ek = data/plan/<slug>.json */
export function macPlan(team, m, ek, { eurTry, today, SITE, slugify }) {
  const tema = team.tur === "tema";
  const slug = `${team.slug}-${m.id}`;
  const yol = tema ? `/${team.slug}/${m.id}/` : `/deplasman/${slug}/`;
  const olcum = m.robot_son_arama || team.guncellendi || today;
  const kayU = `Google Flights · ${gunAy(olcum)}`, kayO = `Google Hotels · ${gunAy(olcum)}`;
  const sec = (m.ucus && m.ucus.secenekler) || [];
  const on = m.ucus && m.ucus.oneri;
  let ucus = sec.map((s) => ucusSatiri(s, m, kayU, slugify));
  if (on && on.fiyat) {
    const o = ucusSatiri({ ...on, not: on.gidis + (on.donus ? ` · dönüş ${on.donus}` : "") }, m, kayU, slugify);
    const i = ucus.findIndex((u) => u.id === o.id);
    if (i > -1) { if (on.aktarma === 0 && !/aktarmasız/.test(ucus[i].dt)) ucus[i].dt += " · aktarmasız"; } else ucus.unshift(o);
  }
  ucus = ucus.filter((u, i) => ucus.findIndex((x) => x.id === u.id) === i).sort((a, b) => (a.pp ?? 1e9) - (b.pp ?? 1e9));
  ucus = ucus.map((u) => ({ ...u, ...havayoluLink({ ...u, hy0: u.ad.split(" · ")[0] }, m.gidis, m.donus) }));
  if (!ucus.length) ucus = [{ id: "ara", ad: `İstanbul → ${m.sehir}`, dt: "Fiyatı Google Flights'ta gör", pp: null, ap: "", kalkis: "", k: "est", kay: "Google Flights", tam: 1, url: null }];
  const otelNot = ek.otel_not || {};
  let otel = (m.oteller || []).map((o) => ({
    id: slugify(o.ad), ad: o.ad, kat: KAT[o.kategori] || "konforlu", tot: typeof o.toplam === "number" ? o.toplam : null, q: o.arama || `${o.ad} ${m.sehir}`, kay: kayO,
    dt: KAT_AD[KAT[o.kategori] || "konforlu"] + (otelNot[o.ad] ? ` · ${otelNot[o.ad]}` : ""),
  }));
  // Gece gece farklı şehir (ör. Viyana + Linz): her seviye için iki otelin toplamı tek seçenek olur
  if (!otel.length && Array.isArray(m.konaklama) && m.konaklama.length) {
    const sec = (g, kats, ad) => (g.oteller || []).find((o) => o.ad === ad && typeof o.toplam === "number") || (g.oteller || []).filter((o) => kats.includes(o.kategori) && typeof o.toplam === "number").sort((a, b) => a.toplam - b.toplam)[0];
    otel = [["uygun", ["ucuz"], "ucuz"], ["konforlu", ["konforlu"], "konforlu"], ["luks", ["pahali", "ikonik"], null]].map(([kat, kats, sk]) => {
      const l = m.konaklama.map((g) => sec(g, kats, sk && (g.secim || {})[sk]));
      if (l.some((x) => !x)) return null;
      return { id: kat, ad: l.map((x) => x.ad).join(" + "), kat, tot: l.reduce((a, x) => a + x.toplam, 0), q: l[0].arama || l[0].ad, kay: kayO, dt: `${KAT_AD[kat]} · ` + m.konaklama.map((g, i) => `${i + 1}. gece ${g.sehir}`).join(", ") + " · link ilk otelin sayfasını açar" };
    }).filter(Boolean);
  }
  otel.sort((a, b) => (a.tot ?? 1e9) - (b.tot ?? 1e9));
  const B = m.butce || {}, bk = B.konforlu || {}, bu = B.ucuz || bk;
  const transfer = ek.transfer ? [...ek.transfer] : (m.havalimani_ulasim && m.havalimani_ulasim.fiyat ? [{ id: "hv", ad: "Havalimanı ↔ merkez", dt: kes(m.havalimani_ulasim.yazi), pp: m.havalimani_ulasim.fiyat, k: "est", url: m.havalimani_ulasim.kaynak || `https://www.google.com/maps/dir/${encodeURIComponent(m.sehir + " airport")}/${encodeURIComponent(m.sehir + " city centre")}` }] : []);
  if (!transfer.length && bk.transfer > 0) {
    const tr = (m.trenler || [])[0];
    transfer.push(tr ? { id: "tren", ad: `Tren · ${tr.nereden} ↔ ${tr.nereye}`, dt: `${m.trenler.length > 1 ? "Gidiş-dönüş" : "Tek yön"} · Deutsche Bahn fiyatı, erken alınca düşer`, pp: bk.transfer, k: "live", url: "https://www.bahn.de/" }
      : { id: "hv", ad: m.araba ? "Kiralık araç payı" : "Havalimanı ↔ şehir", dt: kes((m.araba && m.araba.yazi) || (m.otobus && m.otobus.yazi) || "", 80), pp: bk.transfer, k: "est", url: `https://www.google.com/maps/search/${encodeURIComponent(m.sehir)}` });
  }
  const sehirIci = ek.sehir_ici || (m.sehir_ulasim && m.sehir_ulasim.fiyat ? { ad: "Şehir içi ulaşım · 3 gün", kisa: "şehir içi", dt: kes(m.sehir_ulasim.yazi), pp: m.sehir_ulasim.fiyat, k: "est", url: `https://www.google.com/maps/search/${encodeURIComponent(m.sehir + " public transport tickets")}` } : null);
  const ym = ek.yemek || {};
  const yk = ym.konforlu || bk.yemek || 120, yu = ym.uygun || bu.yemek || Math.round(yk * 0.75);
  const yemek = [
    { id: "uygun", ad: "Uygun", dt: ym.uygun_dt || "Fırın, sokak lezzetleri, pazar", pp: yu },
    { id: "konforlu", ad: "Konforlu", dt: ym.konforlu_dt || "Günde bir restoran", pp: yk },
    { id: "keyif", ad: "Keyif", dt: ym.keyif_dt || "Her akşam restoran", pp: ym.keyif || Math.round((yk * 1.65) / 5) * 5 },
  ];
  const gu = ek.gezi_url || {};
  const gezi = ek.gezi || (m.gezi || []).map((g) => {
    const y = /^(.*?)\s*\((.*)\)\s*$/.exec(g) || [g, g, ""], ad = y[1].trim(), acik = y[2];
    const ucretli = /ücretli/i.test(acik) && !/^ücretsiz/i.test(acik);
    return { id: slugify(ad).slice(0, 24), ad, dt: acik ? acik.charAt(0).toLocaleUpperCase("tr") + acik.slice(1) : "", pp: ucretli ? null : 0, url: gu[ad] || `https://www.google.com/maps/search/${encodeURIComponent(ad + " " + m.sehir)}` };
  });
  const bilet = tema ? null : {
    ad: "Maç bileti · deplasman tribünü", kisa: "Maç bileti", grup: "Maç ve şehir içi", dt: "kulüp üzerinden satılır · garanti değil", pp: bk.bilet || (team.bilet && team.bilet.fiyat) || 50, k: "est",
    kay: "geçen sezon UEFA tavanı", btn: "Kulüp sitesi", url: KULUP[team.slug] || "", ...(ek.bilet || {}),
  };
  const ucretsiz = gezi.filter((g) => g.pp === 0).map((g) => g.id), tum = gezi.map((g) => g.id);
  const P = ek.paketler || {};
  const paket = {
    uygun: { ad: "Uygun", kat: "uygun", ucus: "enuygun", otel: (m.secim || {}).ucuz, transfer: (transfer[0] || {}).id, yemek: "uygun", gezi: ucretsiz, ...(P.uygun || {}) },
    konforlu: { ad: "Konforlu", kat: "konforlu", ucus: "enuygun", otel: (m.secim || {}).konforlu, transfer: (transfer[1] || transfer[0] || {}).id, yemek: "konforlu", gezi: tum.slice(0, 4), ...(P.konforlu || {}) },
    luks: { ad: "Lüks", kat: "luks", ucus: "tam", otel: null, transfer: (transfer[1] || transfer[0] || {}).id, yemek: "keyif", gezi: tum.slice(0, 5), ...(P.luks || {}) },
  };
  for (const [k, p] of Object.entries(paket)) p.otel = m.konaklama && !(m.oteller || []).length ? k : p.otel ? slugify(p.otel) : "";
  const vize = (m.vize || "").replace(/\s*Maça \d+ gün var;?[^.]*\./, "").trim(); // veride kalan eski "gün var" sayısı gösterilmez
  const uyari = ek.uyari || (vize ? { baslik: vize.split(/[.(]/)[0].trim() + ".", yazi: vize.slice(vize.split(/[.(]/)[0].length).replace(/^[.\s]+/, ""), link: "" } : null);
  const bilgiler = ek.bilgiler || (tema
    ? [["Pazar", m.pazar_yazi || ""], ["Saatler", m.pazar_saat || ""], ["Yer", (m.yer || "").toLocaleUpperCase("tr")], ["Kaçamak", `${kisaAralik(m.gidis, m.donus).toLocaleUpperCase("tr")} · ${gece(m.gidis, m.donus)} GECE`]]
    : [["Maç", `${GUNK[D(m.tarih).getUTCDay()]} ${gunAy(m.tarih).toLocaleUpperCase("tr")} · ${m.saat_tsi} TSİ`], [`${m.sehir} saati`, m.saat_yerel || ""], ["Stat", (m.stat || "").toLocaleUpperCase("tr")], ["Kaçamak", `${kisaAralik(m.gidis, m.donus).toLocaleUpperCase("tr")} · ${gece(m.gidis, m.donus)} GECE`]]).filter((b) => b[1]);
  const baslik = ek.baslik || (tema ? `${m.sehir} Noel pazarı, 72 saatte` : `Maç + ${m.sehir}, 72 saatte`);
  const giris = ek.giris || (tema ? `${m.ozet || ""} Hazır paketlerden birini seç ya da kendi kaçamağını kur; her kalemin yanında onu alabileceğin site var.` : `${m.rakip} – ${team.takim}, ${team.turnuva}. ${m.stat_not || ""} Hazır paketlerden birini seç ya da kendi kaçamağını kur; her kalemin yanında onu alabileceğin site var.`);
  const fiyatNot = `Uçuş ve otel fiyatları ${gunAy(olcum, 1)} ${olcum.slice(0, 4)}'da Google Flights ve Google Hotels'te ölçüldü; 1 € = ${String(Math.round(eurTry * 100) / 100).replace(".", ",")} TL.`;
  const yasal = (tema ? "Bağımsız seyahat planlayıcısıyız. " : "Bağımsız seyahat planlayıcısıyız; kulüplerle resmî bağımız yoktur. Maç bileti garanti değildir; biletler kulüp üzerinden satılır, kesin fiyatı kulüp duyurur. ") + "Rezervasyon yapmıyor, komisyon almıyoruz; seni doğrudan sağlayıcının sitesine yönlendiriyoruz.";
  const kontrol = ek.kontrol || [
    "Pasaport: dönüş tarihinden sonra en az 6 ay geçerli olsun",
    vize ? kes(vize, 120) : "Vize durumunu kontrol et",
    "Uçuş: bagaj hakkına bak, online check-in yap",
    "Otel: rezervasyon onayını ve iptal koşulunu kaydet",
    ...(bilet ? ["Maç bileti: yalnızca kulübün duyurduğu kanaldan al; kimlik/pasaportla giriş olabilir"] : []),
    "Seyahat sağlık sigortası",
    "Yurt dışı çıkış harcı",
    "Telefon: yurt dışı paketi ya da eSIM",
    "Temassız banka kartı ve biraz nakit",
    "Priz adaptörü ve şarj aleti",
  ];
  return {
    yol, slug, url: SITE + yol, tur: tema ? "noel" : "deplasman", ad: tema ? `${m.sehir} Noel pazarı` : `${team.takim} · ${m.sehir}`, ust: tema ? `Noel pazarı · ${m.sehir}` : `${team.takim} · ${m.sehir} deplasmanı`,
    sehir: m.sehir, kisi: 2, kur: Math.round(eurTry * 100) / 100, gun: gece(m.gidis, m.donus) + 1, baslik, giris, foto: m.foto || "", fotoAlt: m.foto_alt || m.sehir, fotoKaynak: m.foto_kaynak || "",
    haftalar: [{ id: m.gidis, gidis: m.gidis, donus: m.donus, gece: gece(m.gidis, m.donus), ucus, otel }],
    transfer, sehirIci, bilet, yemek, yemekLink: ek.yemek_link || {}, gezi, paket, uyari, bilgiler,
    plan: (m.akis || []).map((g) => ({ gun: g.gun, duraklar: g.adimlar })), planNot: ek.plan_not || (tema ? "" : `Saatler ${m.sehir} saati.`),
    haric: /vizesi gerekir/i.test(vize) ? "vize hariç" : "", not: ek.not || `Uçuş ve otel fiyatları robotun ${gunAy(olcum, 1)} ölçümü; yemek, ulaşım${bilet ? " ve maç bileti" : ""} tahmini. Fiyatı gördüğün gün o sitede yeniden kontrol et.`,
    fiyatNot, yasal, kontrol, pdf: ek.pdf === false ? "" : `${RELEASE}/${slug}-{paket}{hafta}.pdf`,
    ustLink: tema ? { ad: "Noel", yol: `/sehir/${team.slug}/` } : { ad: "Deplasman", yol: "/deplasman/" }, takimYol: `/sehir/${team.slug}/`, takim: team.takim,
    title: ek.title || (tema ? `${m.sehir} Noel pazarı: 72 saatlik plan ve bütçe | 72h Getaway` : `${team.takim} ${m.sehir} deplasmanı: uçak, otel, maç bileti | 72h Getaway`),
    description: ek.description || (tema ? `${m.sehir} Noel pazarı için 3 hazır paket: uçuş, otel, yemek ve gezi; her kalemde tarihli link. ${kisaAralik(m.gidis, m.donus)}, 2 kişi.` : `${m.rakip} – ${team.takim} (${gunAy(m.tarih, 1)}, ${m.stat}) için 3 hazır paket: uçuş, otel, maç bileti, yemek; her kalemde tarihli link. Planını kur, PDF al.`),
  };
}

/** Bir şehir (hafta sonu kaçamağı) için sayfa verisi: önümüzdeki 4 hafta sonu, her biri kendi uçuş ve otel fiyatıyla. */
export function sehirPlan(d, model, ek, { eurTry, today, SITE, slugify, usableHotel, usableFlight, toEur }) {
  const sehir = model.sehir, slug = model.slug, yol = `/sehir/${slug}/`;
  const city = (d.hotels.sehirler || []).find((c) => c.sehir === sehir) || { oteller: [] };
  const F = d.fiyatlar[sehir] || {}, G = ((d.gezi || {}).sehirler || {})[sehir] || {};
  const otelNot = ek.otel_not || {};
  const haftalar = (model.zaman.haftalar || []).filter((h) => h.g > today).slice(0, ek.hafta_sayisi || 4).map((h) => {
    const w = ((F.haftaSonlari || {})[h.g] || {}).oteller || {};
    const otel = (city.oteller || []).map((o) => {
      const s = (w[o.id] || {}).son, ok = usableHotel(s);
      const tot = ok ? (F.paraBirimi && F.paraBirimi !== "EUR" ? toEur(s.fiyat, F.paraBirimi, d.kur) : s.fiyat) : null;
      const kat = KAT[o.kategori] || "konforlu";
      return { id: o.id, ad: o.ad, kat, tot: tot != null ? Math.round(tot) : null, q: o.arama || `${o.ad} ${sehir}`, kay: `Google Hotels · ${model.otelGuncel || ""}`.replace(/ \d{4}$/, ""), dt: KAT_AD[kat] + (otelNot[o.ad] || o.not ? ` · ${kes(otelNot[o.ad] || o.not, 70)}` : "") + (s && s.durum === "dolu" ? " · bu tarihte dolu görünüyor" : "") };
    }).sort((a, b) => (a.tot ?? 1e9) - (b.tot ?? 1e9));
    const q = ["Istanbul", ek.sehir_en || sehir];
    const us = ((((d.ucuslar || {}).haftaSonlari || {})[h.g] || {}).sehirler || {})[sehir];
    const son = us && usableFlight(us.son) ? us.son : null;
    const aday = son ? (son.secenekler && son.secenekler.length ? son.secenekler : [son, son.aktarmasiz]).filter((x) => x && typeof x.fiyat === "number" && x.fiyat > 0) : [];
    let ucus = aday.map((u) => ({
      id: slugify(`${hyAd(u.havayolu) || "ucus"}-${u.kalkis || "ist"}-${u.aktarma ? "a" : "d"}`), ad: `${hyAd(u.havayolu) || "En uygun uçuş"} · ${u.kalkis || "İstanbul"} → ${sehir}`,
      dt: `Cuma ${u.ucusSaati ? u.ucusSaati.slice(11, 16) + " kalkış" : "sabah"} · ${u.aktarma ? u.aktarma + " aktarma" : "aktarmasız"} · Pazar akşam dönüş`, pp: Math.round(u.fiyat), ap: u.varis || "", kalkis: u.kalkis || "", q,
      k: "live", kay: `Google Flights · ${model.ucusGuncel || ""}`.replace(/ \d{4}$/, ""), tam: EKONOMIK.test(u.havayolu || "") ? 0 : 1,
    }));
    ucus = ucus.filter((u, i) => ucus.findIndex((x) => x.id === u.id) === i).sort((a, b) => a.pp - b.pp);
    ucus = ucus.map((u) => ({ ...u, ...havayoluLink({ ...u, hy0: u.ad.split(" · ")[0] }, h.g, h.cikis) }));
    if (!ucus.length) ucus = [{ id: "ara", ad: `İstanbul → ${sehir}`, dt: "Bu hafta sonu için fiyat ölçülemedi; Google Flights'ta gör", pp: null, ap: "", kalkis: "", q, k: "est", kay: "Google Flights", tam: 1 }];
    return { id: h.g, gidis: h.g, donus: h.cikis, gece: gece(h.g, h.cikis), etiket: kisaAralik(h.g, h.cikis), ek: h.etiket === "ucuz" ? "fırsat" : "", ucus, otel };
  });
  const U = JSON.parse(JSON.stringify(G.ulasim || {}));
  const gEur = (n) => (typeof n === "number" && G.para && G.para !== "EUR" ? toEur(n, G.para, d.kur) : n); // gezi.json yerel para biriminde olabilir (ör. HUF)
  for (const k of Object.keys(U)) if (U[k] && typeof U[k].fiyat === "number") U[k].fiyat = gEur(U[k].fiyat);
  const transfer = ek.transfer || (U.havalimani && U.havalimani.fiyat ? [{ id: "hv", ad: "Havalimanı ↔ merkez", dt: kes(U.havalimani.aciklama, 80), pp: Math.round(U.havalimani.fiyat * 2), k: "est", url: U.havalimani.kaynak || "" }] : []);
  const cg = U.cok_gunluk, gn = U.gunluk;
  const sehirIci = ek.sehir_ici || (cg && cg.fiyat ? { ad: `Toplu taşıma · ${cg.gun || 3} gün`, kisa: "toplu taşıma", dt: kes(cg.aciklama, 80), pp: Math.round(cg.fiyat), k: "est", url: cg.kaynak || "" } : gn && gn.fiyat ? { ad: "Toplu taşıma · 3 gün", kisa: "toplu taşıma", dt: kes(gn.aciklama, 80), pp: Math.round(gn.fiyat * 3), k: "est", url: gn.kaynak || "" } : null);
  const ym = ek.yemek || {}, yk = ym.konforlu || 130;
  const yemek = [
    { id: "uygun", ad: "Uygun", dt: ym.uygun_dt || "Fırın, sokak lezzetleri, pazar", pp: ym.uygun || Math.round(yk * 0.65 / 5) * 5 },
    { id: "konforlu", ad: "Konforlu", dt: ym.konforlu_dt || "Günde bir restoran", pp: yk },
    { id: "keyif", ad: "Keyif", dt: ym.keyif_dt || "Her akşam restoran", pp: ym.keyif || Math.round((yk * 1.65) / 5) * 5 },
  ];
  const gu = ek.gezi_url || {};
  const gezi = ek.gezi || (G.yerler || []).slice(0, ek.gezi_sayisi || 8).map((y) => ({ id: y.id, ad: y.ad, dt: kes(y.fiyat_yazi || y.tur || "", 60), pp: typeof y.fiyat === "number" ? Math.round(gEur(y.fiyat) * 10) / 10 : null, url: gu[y.id] || y.harita || `https://www.google.com/maps/search/${encodeURIComponent(y.arama || y.ad)}` }));
  const ucretsiz = gezi.filter((g) => g.pp === 0).map((g) => g.id), tum = gezi.map((g) => g.id), P = ek.paketler || {};
  const paket = {
    uygun: { ad: "Uygun", kat: "uygun", ucus: "enuygun", otel: "", transfer: (transfer[0] || {}).id, yemek: "uygun", gezi: ucretsiz.length ? ucretsiz.slice(0, 3) : tum.slice(0, 1), ...(P.uygun || {}) },
    konforlu: { ad: "Konforlu", kat: "konforlu", ucus: "enuygun", otel: "", transfer: (transfer[0] || {}).id, yemek: "konforlu", gezi: tum.slice(0, 3), ...(P.konforlu || {}) },
    luks: { ad: "Lüks", kat: "luks", ucus: "tam", otel: "", transfer: (transfer[transfer.length - 1] || {}).id, yemek: "keyif", gezi: tum.slice(0, 5), ...(P.luks || {}) },
  };
  for (const p of Object.values(paket)) if (p.otel) p.otel = ((city.oteller || []).find((o) => o.ad === p.otel) || {}).id || p.otel;
  const foto = (model.fotolar || [])[0] || {};
  const vz = vizeNotu(model.ulke);
  return {
    yol, slug, url: SITE + yol, tur: "sehir", ad: sehir, ust: `${sehir} · hafta sonu kaçamağı`, sehir, kisi: 2, kur: Math.round(eurTry * 100) / 100, gun: 3,
    baslik: ek.baslik || `${sehir}, 72 saatte`, giris: ek.giris || `İstanbul'dan ${sehir} hafta sonu: cuma sabah gidiş, pazar akşam dönüş, 2 gece. Hazır paketlerden birini seç ya da kendi kaçamağını kur; her kalemin yanında onu alabileceğin site var.`,
    foto: foto.dosya || "", fotoAlt: foto.alt || sehir, fotoKaynak: foto.kaynak || "", haftalar, transfer, sehirIci, bilet: null, yemek, yemekLink: ek.yemek_link || {}, gezi, paket,
    uyari: ek.uyari || (vz ? { baslik: vz.baslik, yazi: vz.yazi, link: vz.link || "", linkAd: vz.linkAd || "" } : null), bilgiler: ek.bilgiler || [["Ülke", (model.ulke || "").toLocaleUpperCase("tr")], ["Kaçamak", "CUMA – PAZAR · 2 GECE"], ["Uçuş", "İSTANBUL'DAN"], ["Kişi", "2 KİŞİ"]],
    plan: ek.plan || ornekPlan(sehir, G.yerler || [], model.restoranlar), planNot: ek.plan_not || "Örnek akış: yerler popülerliğe göre sıralı; saatleri uçuşuna ve aldığın biletlere göre kaydır.", haric: ek.haric != null ? ek.haric : vz ? vz.haric : "",
    not: ek.not || `Uçuş ve otel fiyatları robotun ölçümü (otel ${model.otelGuncel || "–"}, uçuş ${model.ucusGuncel || "–"}); yemek ve ulaşım tahmini. Fiyatı gördüğün gün o sitede yeniden kontrol et.`,
    fiyatNot: `Otel fiyatları ${model.otelGuncel || "–"}, uçuş fiyatları ${model.ucusGuncel || "–"} tarihinde Google Hotels ve Google Flights'ta ölçüldü; 1 € = ${String(Math.round(eurTry * 100) / 100).replace(".", ",")} TL.`,
    yasal: "Bağımsız seyahat planlayıcısıyız. Rezervasyon yapmıyor, komisyon almıyoruz; seni doğrudan sağlayıcının sitesine yönlendiriyoruz.",
    kontrol: ek.kontrol || ["Pasaport: dönüş tarihinden sonra en az 6 ay geçerli olsun", ek.vize || (vz ? (vz.baslik + " " + vz.yazi).replace(/[:,]\s*$/, "").replace(/, Schengen/, "; Schengen") : "Vize durumunu kontrol et"), "Uçuş: bagaj hakkına bak, online check-in yap", "Otel: rezervasyon onayını ve iptal koşulunu kaydet", "Müze ve etkinlik biletleri: saatli biletleri önceden al", "Seyahat sağlık sigortası", "Yurt dışı çıkış harcı", "Telefon: yurt dışı paketi ya da eSIM", "Temassız banka kartı ve biraz nakit", "Priz adaptörü ve şarj aleti"],
    pdf: ek.pdf === false ? "" : `${RELEASE}/${slug}-{paket}{hafta}.pdf`, ustLink: { ad: "Şehirler", yol: "/sehir/" }, takimYol: "/sehir/", takim: "",
    title: ek.title || `${sehir} hafta sonu: 3 hazır paket, uçak + otel bütçesi | 72h Getaway`,
    description: ek.description || `${sehir} hafta sonu kaçamağı için 3 hazır paket (Uygun, Konforlu, Lüks): uçuş, otel, yemek, gezi; her kalemde tarihli link. Planını kur, arkadaşına gönder, PDF al.`,
  };
}

const UYARI_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" style="flex:none;margin-top:2px"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';

/** Sayfa HTML'i. Görünüm, yönetim kurulunun deneme sayfasıyla aynıdır. */
export function renderPlanPage(V, { esc, jsonLd, SITE, surum }) {
  const h0 = V.haftalar[0];
  const veri = { ...V }; for (const k of ["title", "description", "giris", "bilgiler", "fotoAlt", "fotoKaynak", "ustLink", "takimYol", "takim", "planNot", "yol"]) delete veri[k];
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "WebPage", "@id": V.url, url: V.url, name: V.title, description: V.description, inLanguage: "tr", isPartOf: { "@type": "WebSite", name: "72h Getaway", url: SITE + "/" } },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "72h Getaway", item: SITE + "/" }, { "@type": "ListItem", position: 2, name: V.ustLink.ad, item: SITE + V.ustLink.yol }, { "@type": "ListItem", position: 3, name: V.ad, item: V.url }] },
  ] };
  const gunler = V.plan.map((g) => `<div class="day"><h3>${esc(g.gun)}</h3><div class="stops">${g.duraklar.map((d) => `
      <div class="st"><span class="h">${esc(d[0] || "·")}</span><span>${esc(d[1])}${d[2] ? ` <span>· ${esc(d[2])}</span>` : ""}</span></div>`).join("")}
    </div></div>`).join("\n    ");
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(V.title)}</title>
<meta name="description" content="${esc(kes(V.description, 155))}">
<meta name="theme-color" content="#0F2A43">
<link rel="canonical" href="${esc(V.url)}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/img/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/img/icon-180.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta property="og:type" content="website">
<meta property="og:site_name" content="72h Getaway">
<meta property="og:locale" content="tr_TR">
<meta property="og:url" content="${esc(V.url)}">
<meta property="og:title" content="${esc(V.baslik)}">
<meta property="og:description" content="${esc(kes(V.description, 200))}">
<meta property="og:image" content="${esc(V.foto ? SITE + V.foto : SITE + "/img/paylas.png?v=2")}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${jsonLd(ld)}</script>
<link rel="stylesheet" href="/fonts/fonts.css">
<link rel="stylesheet" href="/css/plan.css?v=${surum.css}">
</head>
<body>

<header class="bar"><div class="wrap">
  <a class="logo" href="/" aria-label="72h Getaway ana sayfa"><span class="a">72h</span><span class="b">getaway</span></a>
  <nav aria-label="Site"><a${V.tur === "sehir" ? ' class="on"' : ""} href="/sehir/">Şehirler</a><a${V.tur === "deplasman" ? ' class="on"' : ""} href="/deplasman/">Deplasman</a><a${V.tur === "noel" ? ' class="on"' : ""} href="/sehir/noel/">Noel</a><a href="https://instagram.com/72hgetaway" rel="noopener">Instagram</a></nav>
</div></header>

<div class="hero"><div class="wrap">
  ${V.foto ? `<div class="photo" role="img" aria-label="${esc(V.fotoAlt)}" style="background-image:url(${esc(V.foto)})">${V.fotoKaynak ? `<span>Fotoğraf: ${esc(V.fotoKaynak)}</span>` : ""}</div>` : ""}
  <div style="display:flex;flex-direction:column;gap:10px">
    <span class="mono" style="color:var(--accent)">${esc(V.ust)}</span>
    <h1>${esc(V.baslik)}</h1>
    <p class="lead">${esc(V.giris)}</p>
  </div>
  <div class="facts">
    ${V.bilgiler.map((b) => `<div class="fact"><span class="mono">${esc(b[0])}</span><b>${esc(b[1])}</b></div>`).join("\n    ")}
  </div>
  ${V.uyari ? `<div class="warn">${UYARI_SVG}<span><b>${esc(V.uyari.baslik)}</b> ${esc(V.uyari.yazi)}${V.uyari.link ? ` <a href="${esc(V.uyari.link)}" rel="noopener">${esc(V.uyari.linkAd || "Resmî site")}</a>` : ""}</span></div>` : ""}
</div></div>

<main class="wrap">

<section id="paketler">
  <div class="sh">
    <span class="mono">1 · Hazır paketler</span>
    <h2>Seç, tıkla, al</h2>
    <p>${V.haftalar.length > 1 ? "Hafta sonunu seç; fiyatlar ve bütün linkler o tarihlere göre değişir. Uçuşa basınca Google Flights o hafta sonunun aramasıyla açılır, otele basınca o tarihlerin otel sayfası." : `Fiyatları bulduğumuz siteye doğrudan gidersin: uçuşa basınca Google Flights ${esc(kisaAralik(h0.gidis, h0.donus))} aramasıyla açılır, otele basınca o tarihlerin otel sayfası.`}</p>
  </div>
  ${V.haftalar.length > 1 ? '<div class="weeks" id="weeks" role="group" aria-label="Hafta sonu"></div>' : ""}
  <div class="tabs" role="tablist" aria-label="Paket">
    <button class="tab" role="tab" id="tab-uygun" data-p="uygun"><b>Uygun</b><span id="tp-uygun"></span></button>
    <button class="tab" role="tab" id="tab-konforlu" data-p="konforlu"><b>Konforlu</b><span id="tp-konforlu"></span></button>
    <button class="tab" role="tab" id="tab-luks" data-p="luks"><b>Lüks</b><span id="tp-luks"></span></button>
  </div>

  <div class="ticket">
    <div class="stub"><span>BİNİŞ KARTI</span></div>
    <div class="main">
      <div><div class="mono" id="pk-route">İSTANBUL → ${esc(V.sehir.toLocaleUpperCase("tr"))}</div><div class="n" id="pk-total">–</div></div>
      <small id="pk-pp"></small>
    </div>
  </div>

  <div class="split" id="pk-split" aria-hidden="true"></div>
  <div class="legend" id="pk-legend"></div>

  <div class="items" id="pk-items"></div>
  <div class="cta-row">
    <button class="btn pri" id="edit-pk" type="button">Bu paketi düzenle</button>
    <button class="btn sec" id="pdf-pk" type="button">Rehberi PDF olarak al</button>
  </div>
  <p class="note" style="margin-top:10px" id="pk-note"></p>
  <noscript><p class="note">Paketleri ve fiyatları görmek için tarayıcında JavaScript açık olmalı.</p></noscript>
</section>

<section id="olustur">
  <div class="sh">
    <span class="mono">2 · Kendin oluştur</span>
    <h2>Kaçamağını kendin kur</h2>
    <p>Gideceğin her şeyi seç; toplam altta anında değişir. Ok simgesi seni o kalemi alabileceğin sayfaya götürür.</p>
  </div>
  <p class="warn" id="gelen-not" hidden></p>
  <div id="builder"></div>
</section>

${V.plan.length ? `<section id="plan">
  <div class="sh">
    <span class="mono">3 · 72 saat planı</span>
    <h2>Saat saat ${esc(V.sehir)}</h2>
    ${V.planNot ? `<p>${esc(V.planNot)}</p>` : ""}
  </div>
  <div class="days">
    ${gunler}
  </div>` : `<section id="plan">`}
  <p class="legal">${esc(V.yasal)} ${esc(V.fiyatNot)}</p>
  <div class="site-foot">${V.tur === "sehir" ? "" : `<a href="${esc(V.takimYol)}">${esc(V.tur === "noel" ? "Tüm Noel şehirleri" : V.takim + " deplasmanları")}</a>`}<a href="/sehir/">Tüm şehirler</a><a href="/oteller.html">Otel fiyat takvimi</a><a href="/">Bütçe hesaplayıcı</a><a href="/hakkinda.html">Hakkında</a></div>
</section>
</main>

<div class="sticky"><div class="wrap">
  <div class="sum"><span id="st-label">Kendi kaçamağın · 2 kişi</span><b id="st-total">–</b><span id="st-pp"></span></div>
  <button class="btn sec" id="copy" type="button">Arkadaşına gönder</button>
  <button class="btn pri" id="pdf" type="button">PDF<span class="lg">&nbsp;rehber</span></button>
</div></div>

<div class="sheet" id="sheet" hidden><div class="in" role="dialog" aria-modal="true" aria-labelledby="sheet-h">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
    <h2 id="sheet-h" style="font-size:22px">PDF rehberin</h2>
    <button class="btn sec" id="sheet-x" type="button" style="min-height:40px">Kapat</button>
  </div>
  <p class="note" style="margin-top:6px">Rehberde kapak ve biniş kartı, aşağıdaki kalem tablosu ve tıklanabilir linkler, 72 saat planı ve kontrol listesi var.</p>
  <div class="cta-row">
    <button class="btn pri" id="pdf-yazdir" type="button">PDF olarak kaydet</button>
    <a class="btn sec" id="pdf-hazir" href="#" target="_blank" rel="noopener" hidden>Hazır PDF'i indir</a>
  </div>
  <p class="note" style="margin-top:8px">"PDF olarak kaydet" yazdırma penceresini açar; hedef olarak "PDF olarak kaydet"i seç (iPhone'da önizlemeyi iki parmakla büyütüp paylaş).</p>
  <div class="ticket" style="margin-top:14px"><div class="stub"><span>REHBER</span></div><div class="main"><div><div class="mono" id="sh-ad"></div><div class="n" id="sh-total"></div></div><small id="sh-pp"></small></div></div>
  <table style="margin-top:14px"><tbody id="sh-rows"></tbody></table>
  <p class="note" style="margin-top:10px">Linkler PDF'te tıklanabilir. Fiyatlar ölçüldüğü günün fiyatıdır; almadan önce sitede kontrol et.</p>
</div></div>

<div id="baski" aria-hidden="true"></div>

<script type="application/json" id="plan-veri">${jsonLd(veri)}</script>
<script src="/js/plan.js?v=${surum.js}"></script>
<script src="/js/olcum.js" defer></script>
<script>if ("serviceWorker" in navigator) addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); });</script>
</body>
</html>
`;
}

/** Plan dosyası olan bütün maçların sayfaları: { dosyalar: {yol: html}, yollar: ["/deplasman/…/"], liste: [V] } */
export function planDosyalari({ root, teams, models = [], d = null, today, eurTry, esc, jsonLd, SITE, slugify, usableHotel, usableFlight, toEur }) {
  const surum = { css: ozet(root, "css/plan.css"), js: ozet(root, "js/plan.js") };
  const dosyalar = {}, yollar = [], liste = [];
  for (const t of teams) {
    for (const m of t.maclar || []) {
      const p = join(root, `data/plan/${t.slug}-${m.id}.json`);
      if (!m.gidis || !m.donus || m.donus < today || !(m.butce && m.butce.konforlu)) continue;
      const V = macPlan(t, m, readJson(p, {}), { eurTry, today, SITE, slugify });
      dosyalar[`${V.yol.slice(1)}index.html`] = renderPlanPage(V, { esc, jsonLd, SITE, surum });
      yollar.push(V.yol); liste.push({ yol: V.yol, slug: V.slug, takim: t.slug, mac: m.id });
    }
  }
  for (const model of d ? models : []) {
    const p = join(root, `data/plan/${model.slug}.json`);
    const V = sehirPlan(d, model, readJson(p, {}), { eurTry, today, SITE, slugify, usableHotel, usableFlight, toEur });
    if (!V.haftalar.length) continue;
    dosyalar[`${V.yol.slice(1)}index.html`] = renderPlanPage(V, { esc, jsonLd, SITE, surum });
    liste.push({ yol: V.yol, slug: V.slug, sehir: model.sehir });
  }
  return { dosyalar, yollar, liste };
}
