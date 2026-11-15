// Yeni ana sayfa (iş emri: site tasarımı, A1 · Biniş kartı): lacivert bant + hafta sonu çipleri, EN UYGUN biniş kartı,
// "bu hafta sonu" rafı, Noel ve Deplasman kutuları, alt sekme çubuğu. Kabuk parçaları (logo, sekme çubuğu) diğer sayfalarla ortaktır.
// Rakam: 2 kişi uçak + konforlu otel 2 gece (vitrin ile aynı kaynak: model.zaman.haftalar), TL'ye günün kuruyla çevrilir.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const AY = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const D = (s) => new Date(s + "T12:00:00Z");
const aralik = (a, b) => (a.slice(5, 7) === b.slice(5, 7) ? `${D(a).getUTCDate()}–${D(b).getUTCDate()} ${AY[D(b).getUTCMonth()]}` : `${D(a).getUTCDate()} ${AY[D(a).getUTCMonth()]} – ${D(b).getUTCDate()} ${AY[D(b).getUTCMonth()]}`);
const HAFTA_AD = ["Bu hafta", "1 hafta sonra", "2 hafta", "3 hafta"];
const ozet = (root, rel) => { try { return createHash("sha1").update(readFileSync(join(root, rel))).digest("hex").slice(0, 10); } catch { return "0"; } };
const tl = (n) => Math.round(n).toLocaleString("tr-TR") + " TL";

const IKON = {
  kesfet: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  sehirler: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  deplasman: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  planim: '<path d="M6 3h12v18l-6-4-6 4z"/>',
};
export const logo = () => '<a class="logo" href="/" aria-label="72h Getaway ana sayfa"><span class="a">72h</span><span class="b">getaway</span></a>';
/** Sabit alt sekme çubuğu. aktif: "kesfet" | "sehirler" | "deplasman" | "planim" */
export function sekmeCubugu(aktif) {
  const s = [["kesfet", "Keşfet", "/"], ["sehirler", "Şehirler", "/sehirler/"], ["deplasman", "Deplasman", "/deplasman/"], ["planim", "Planım", "/planim/"]];
  return `<nav class="sekme" aria-label="Ana menü"><div class="kap">${s.map(([k, ad, yol]) => `<a href="${yol}"${k === aktif ? ' aria-current="page"' : ""}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IKON[k]}</svg>${ad}<i></i></a>`).join("")}</div></nav>`;
}

/** Ana sayfa ve Şehirler için ortak veri: ilk 4 hafta sonu ve şehir başına TL toplamları. */
export function vitrinVerisi(models, d, today, eurTry) {
  const gunler = [...new Set(models.flatMap((m) => m.zaman.haftalar.map((h) => h.g)))].filter((g) => g > today).sort().slice(0, 4);
  const cikis = (g) => { for (const m of models) { const h = m.zaman.haftalar.find((x) => x.g === g); if (h) return h.cikis; } return g; };
  const haftalar = gunler.map((g, i) => ({ g, kisa: aralik(g, cikis(g)), ad: HAFTA_AD[i] }));
  const iata = (sehir) => { for (const g of gunler) { const v = (((((d.ucuslar || {}).haftaSonlari || {})[g] || {}).sehirler || {})[sehir] || {}).son; if (v && v.varis) return v.varis; } return sehir.slice(0, 3).toLocaleUpperCase("tr"); };
  const sehirler = models.map((m) => {
    const f = (m.fotolar || [])[0] || {};
    const hs = gunler.map((g) => m.zaman.haftalar.find((h) => h.g === g));
    return { ad: m.sehir, slug: m.slug, ulke: m.ulke, iata: iata(m.sehir), foto: f.kucuk || f.dosya || "", alt: f.alt || m.sehir,
      t: hs.map((h) => (h && h.toplam != null ? Math.round(h.toplam * eurTry) : null)), e: hs.map((h) => (h ? h.etiket || "" : "")), f: hs.map((h) => (h && h.fark != null ? h.fark : null)) };
  });
  return { haftalar, sehirler };
}

export function renderAnaSayfa({ models, d, today, eurTry, esc, jsonLd, SITE, root }) {
  const V = vitrinVerisi(models, d, today, eurTry);
  const ayar = (() => { try { return JSON.parse(readFileSync(join(root, "data/ana-sayfa.json"), "utf8")); } catch { return {}; } })();
  const L = V.sehirler.filter((s) => s.t[0] != null).sort((a, b) => a.t[0] - b.t[0]), h0 = V.haftalar[0] || { g: today, kisa: "" };
  // Sayfa açılışında öne çıkan şehir (data/ana-sayfa.json); o hafta sonu fiyatı yoksa en uygun şehir gösterilir
  const one = L.find((s) => s.ad === ayar.one_cikan) || null, ilk = one || L[0], kocan = one ? "ÖNE ÇIKAN" : "EN UYGUN";
  const rafL = L.filter((s) => s !== ilk);
  V.one = one ? one.slug : "";
  const yol = (s) => `/sehir/${s.slug}/?h=${h0.g}`;
  const title = "72h Getaway · Bu hafta sonu nereye? İstanbul çıkışlı kaçamak bütçesi";
  const desc = `İstanbul'dan ${models.length} Avrupa şehrine hafta sonu kaçamağı: 2 kişi uçak + otel toplamı, hafta sonu hafta sonu. En uygun şehri gör, hazır paketini seç.`;
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "Organization", "@id": SITE + "/#org", name: "72h Getaway", url: SITE + "/", logo: SITE + "/img/icon-512.png", sameAs: ["https://instagram.com/72hgetaway"] },
    { "@type": "WebSite", "@id": SITE + "/#site", url: SITE + "/", name: "72h Getaway", inLanguage: "tr", publisher: { "@id": SITE + "/#org" } },
  ] };
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#0F2A43">
<link rel="canonical" href="${SITE}/">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/img/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/img/icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="72h Getaway">
<meta property="og:type" content="website">
<meta property="og:site_name" content="72h Getaway">
<meta property="og:locale" content="tr_TR">
<meta property="og:url" content="${SITE}/">
<meta property="og:title" content="72h Getaway · Bu hafta sonu nereye?">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${SITE}/img/paylas.png?v=2">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" as="font" type="font/woff2" href="/fonts/archivo-latin-800-normal.woff2" crossorigin>
<link rel="stylesheet" href="/fonts/fonts.css">
<link rel="stylesheet" href="/css/kabuk.css?v=${ozet(root, "css/kabuk.css")}">
${ilk ? `<link rel="preload" as="image" href="${esc(ilk.foto)}" fetchpriority="high">` : ""}
<script type="application/ld+json">${jsonLd(ld)}</script>
</head>
<body>
<a class="skip" href="#icerik">İçeriğe geç</a>
<header class="bant"><div class="kap">
  <div class="bant-ust">${logo()}<span class="etiket">İstanbul çıkışlı</span></div>
  <h1>Bu hafta sonu nereye?</h1>
  <div class="cipler" id="cipler" role="group" aria-label="Hafta sonu">
    ${V.haftalar.map((h, i) => `<button class="cip" type="button" data-i="${i}" aria-pressed="${i === 0}"><b>${esc(h.kisa)}</b><span>${esc(h.ad)}</span></button>`).join("\n    ")}
  </div>
</div></header>

<main class="kap icerik" id="icerik">
  <div id="enuygun" aria-live="polite">${ilk
    ? `<a class="bk" href="${yol(ilk)}"><div class="bk-kocan"><span>${kocan}</span></div><div class="bk-govde"><img src="${esc(ilk.foto)}" alt="${esc(ilk.alt)}" width="640" height="427" fetchpriority="high"><div class="bk-yazi"><div class="bk-rota"><span>IST → ${esc(ilk.iata)}</span><span>2 KİŞİ · 2 GECE</span></div><div class="bk-alt"><span class="bk-ad"><b>${esc(ilk.ad)}</b><span>${esc(ilk.ulke)} · uçak + otel</span></span><span class="bk-fiyat"><b>${tl(ilk.t[0])}</b><span>kişi başı ${tl(ilk.t[0] / 2)}</span></span></div></div></div></a>`
    : '<p class="bos">Bu hafta sonu için fiyatlar henüz ölçülmedi; robot kontrol ediyor. Başka bir hafta sonu seç.</p>'}</div>

  <div class="raf-bas"><h2 id="raf-baslik">Bu hafta sonu</h2><a href="/sehirler/">${models.length} şehir</a></div>
  <div class="raf" id="raf">${rafL.slice(0, 10).map((s) => `<a class="rk" href="${yol(s)}"><img src="${esc(s.foto)}" alt="" loading="lazy" width="640" height="427"><div><b>${esc(s.ad)}</b><b>${tl(s.t[0])}</b></div></a>`).join("")}</div>

  <div class="kutular">
    <a class="kutu l" href="/sehir/noel/"><span>ARALIK</span><b>Noel pazarları</b></a>
    <a class="kutu t" href="/deplasman/"><span>MAÇ + 72 SAAT</span><b>Deplasman</b></a>
  </div>

  <section class="nasil" aria-labelledby="h-nasil">
    <h2 id="h-nasil">Nasıl çalışır</h2>
    <ol>
      <li><span><b>Hafta sonunu seç</b>Robotlarımız her gün uçuş ve otel fiyatlarını ölçer; rakam 2 kişi, uçak + otel toplamıdır (yemek dahil değil).</span></li>
      <li><span><b>Paketini seç ya da kendin kur</b>Uygun, Konforlu, Lüks; her kalemin yanında onu alacağın sitenin tarihli linki var.</span></li>
      <li><span><b>Kendin al</b>Tur şirketi değiliz: rezervasyon yapmıyor, komisyon almıyoruz. Planını arkadaşına gönder, PDF rehberini al.</span></li>
    </ol>
  </section>

  <footer class="altbilgi">
    <nav aria-label="Alt bağlantılar"><a href="/sehir/noel/">Noel pazarları</a><a href="/oteller.html">Otel fiyat takvimi</a><a href="/hesapla/">Bütçe hesaplayıcı</a><a href="/hakkinda.html">Hakkında</a><a href="/hakkinda.html#gizlilik">Gizlilik</a><a href="https://instagram.com/72hgetaway" rel="noopener">Instagram</a></nav>
    <p>Fiyatlar ${esc(today.split("-").reverse().join("."))} tarihli ölçümdür; 1 € = ${String(Math.round(eurTry * 100) / 100).replace(".", ",")} TL. Almadan önce sağlayıcının sitesinde kontrol et.</p>
  </footer>
</main>

${sekmeCubugu("kesfet")}
<script type="application/json" id="ana-veri">${jsonLd(V)}</script>
<script src="/js/ana.js?v=${ozet(root, "js/ana.js")}" defer></script>
<script src="/js/olcum.js" defer></script>
<script>if ("serviceWorker" in navigator) addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); });</script>
</body>
</html>
`;
}
