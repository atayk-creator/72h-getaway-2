// Takım deplasman sayfası (/deplasman/<slug>/): takım bir "şehir" gibi, her deplasman maçı bir 72 saatlik kaçamak.
// Veri: data/<slug>.json (ör. data/fenerbahce.json). sehir-sayfalari.mjs generate() içinden çağrılır.
const KAT_AD = { ikonik: "İkonik", pahali: "Lüks", konforlu: "Konforlu", ucuz: "Ucuz" };
const KAT_SIRA = ["ikonik", "pahali", "konforlu", "ucuz"];
const KALEM = [
  ["ucus", "Uçak", "#0F2A43"], ["transfer", "Havalimanı / araba", "#4B6A88"], ["otel", "Otel", "#F4A62A"], ["bilet", "Maç bileti", "#E0C000"],
  ["yemek", "Yemek", "#C4374D"], ["ulasim", "Şehir içi ulaşım", "#17744C"], ["gezi", "Gezi", "#8E7CC3"],
];
const GUN = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const AY = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const d = (s) => new Date(s + "T00:00:00Z");
export const tarihUzun = (s) => `${d(s).getUTCDate()} ${AY[d(s).getUTCMonth()]} ${d(s).getUTCFullYear()} ${GUN[d(s).getUTCDay()]}`;
const tarihKisa = (s) => `${d(s).getUTCDate()} ${AY[d(s).getUTCMonth()].slice(0, 3)}`;
const gunAd = (s) => GUN[d(s).getUTCDay()];
export const toplam = (b) => Object.values(b || {}).reduce((a, x) => a + (typeof x === "number" ? x : 0), 0);
const kalan = (today, s) => Math.round((d(s) - d(today)) / 864e5);

/** Yaklaşan maçlar (maç günü dahil), tarih sırasıyla. */
export function upcoming(team, today) {
  return (team.maclar || []).filter((m) => m.tarih >= today).sort((a, b) => a.tarih.localeCompare(b.tarih));
}

export function renderTeamPage(team, { today, eurTry, esc, para, fmtTl, fmtEur, head, foot, SITE }) {
  const url = `${SITE}/deplasman/${team.slug}/`;
  const list = upcoming(team, today);
  const tl = (eur) => fmtTl(eur, eurTry) || fmtEur(eur);
  const title = `${team.takim} deplasmanı kaça patlar? Otel, uçak, maç bileti (TL) | 72h Getaway`;
  const description = list.length
    ? `${team.takim}'nin ${team.turnuva} deplasmanları: ${list.map((m) => `${m.sehir} (${tarihKisa(m.tarih)})`).join(", ")}. Uçak + otel + maç bileti + yemek; 2 kişi toplam ~${tl(toplam(list[0].butce.konforlu) * 2)}'den başlayan 72 saatlik planlar.`
    : `${team.takim} deplasman planları.`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": url, url, name: title, description, inLanguage: "tr", dateModified: team.guncellendi || today, isPartOf: { "@type": "WebSite", name: "72h Getaway", url: SITE + "/" } },
      ...list.map((m) => ({ "@type": "SportsEvent", name: `${m.rakip} – ${team.takim}`, startDate: `${m.tarih}T${m.saat_tsi}:00+03:00`,
        location: { "@type": "Place", name: m.stat, address: { "@type": "PostalAddress", addressLocality: m.sehir, addressCountry: m.ulke } } })),
    ],
  };

  // Üstte maç kartları (vitrin gibi)
  const kartlar = list.map((m, i) => {
    const k = kalan(today, m.tarih);
    return `<a class="mk${i === 0 ? " ilk" : ""}" href="#${esc(m.id)}">
      <span class="mk-eb">${i === 0 ? "SIRADAKİ · " : ""}${esc(m.hafta)}. HAFTA</span>
      <b class="mk-s">${esc(m.sehir)}</b>
      <span class="mk-r">${esc(m.rakip)} – ${esc(team.takim)}</span>
      <span class="mk-t">${esc(tarihKisa(m.tarih))} ${esc(gunAd(m.tarih))} · ${esc(m.saat_tsi)} TSİ${k >= 0 ? ` · ${k === 0 ? "bugün" : k + " gün kaldı"}` : ""}</span>
      <span class="mk-p">~${esc(tl(toplam(m.butce.konforlu) * 2))}</span><span class="mk-ps">2 kişi toplam · her şey dahil</span>
    </a>`;
  }).join("");

  const sections = list.map((m) => {
    const bk = m.butce.konforlu, bu = m.butce.ucuz, tk = toplam(bk), tu = toplam(bu);
    const o = m.ucus.oneri;
    const secK = m.secim && m.oteller.find((h) => h.ad === m.secim.konforlu);
    const secU = m.secim && m.oteller.find((h) => h.ad === m.secim.ucuz);
    const oteller = m.oteller.slice().sort((a, b) => KAT_SIRA.indexOf(a.kategori) - KAT_SIRA.indexOf(b.kategori) || a.toplam - b.toplam);
    const bar = KALEM.filter(([k]) => bk[k] > 0).map(([k, ad, renk]) => `<i style="width:${((bk[k] / tk) * 100).toFixed(1)}%;background:${renk}" title="${esc(ad)}"></i>`).join("");
    const kalemler = KALEM.filter(([k]) => typeof bk[k] === "number").map(([k, ad, renk]) => {
      const alt = k === "ucus" ? `${o.havayolu}, aktarmasız` : k === "otel" && secK ? `${secK.ad}, 2 gecenin yarısı` : k === "transfer" && m.araba ? "kiralık araba, 2 kişiye bölünmüş" : k === "bilet" ? "deplasman tribünü, resmî satış" : "";
      return `<li><span><i class="dot" style="background:${renk}"></i>${esc(ad)}${alt ? `<small>${esc(alt)}</small>` : ""}</span><span class="r">${bk[k] ? para(bk[k], eurTry) : "—"}</span></li>`;
    }).join("");
    const seviye = m.ucus.seviye === "yuksek" ? `<span class="etk pahali">Uçak şu an pahalı · normali ${esc(m.ucus.normal_aralik)}</span>` : m.ucus.seviye === "dusuk" ? `<span class="etk ucuz">Uçak ucuz</span>` : `<span class="etk normal">Uçak normal fiyatında</span>`;
    const akis = (m.akis || []).map((g) => `<div class="gun"><h4>${esc(g.gun)}</h4><ol>${g.adimlar.map(([saat, ne, not]) => `<li${/ – /.test(ne) ? ' class="mac-an"' : ""}><time>${esc(saat)}</time><span><b>${esc(ne)}</b>${not ? `<small>${esc(not)}</small>` : ""}</span></li>`).join("")}</ol></div>`).join("");
    const ucuslar = m.ucus.secenekler.map((s) => `<li${s.fiyat === o.fiyat && s.havayolu === o.havayolu ? ' class="sec"' : ""}><span><b>${esc(s.havayolu)}</b> · ${esc(s.havalimani)}<small>${esc(s.not)}</small></span><span class="r">${para(s.fiyat, eurTry)}</span></li>`).join("");
    const otelSatir = oteller.map((h) => {
      const tag = secK && h.ad === secK.ad ? `<em class="tag">Bütçede</em>` : secU && h.ad === secU.ad ? `<em class="tag u">Ucuz planda</em>` : "";
      return `<li${tag ? ' class="sec"' : ""}><span><span class="chip">${esc(KAT_AD[h.kategori] || h.kategori)}</span> <b>${esc(h.ad)}</b> ${tag}<small>kişi başı ${esc(tl(h.toplam / 2))}</small></span><span class="r">${para(h.toplam, eurTry)}</span></li>`;
    }).join("");
    const yemek = (m.yemek || []).map(([ad, ne, f]) => `<li><span><b>${esc(ad)}</b><small>${esc(ne)}</small></span><span class="r">${esc(f)}</span></li>`).join("");
    const ulasim = [
      m.araba ? ["Viyana'dan arabayla", `~${tl(m.araba.toplam)} araç başı`, m.araba.yazi] : m.havalimani_ulasim ? ["Havalimanından şehre", m.havalimani_ulasim.fiyat ? `~${tl(m.havalimani_ulasim.fiyat)} kişi başı` : "turist kartına dahil", m.havalimani_ulasim.yazi] : null,
      ["Stada", "", m.stada + (m.stat_not ? " " + m.stat_not : "")],
      ["Şehir içi", m.sehir_ulasim.fiyat ? `~${tl(m.sehir_ulasim.fiyat)} kişi başı` : "", m.sehir_ulasim.yazi],
    ].filter(Boolean).map(([h, p, t]) => `<div class="card"><h4>${esc(h)}</h4>${p ? `<div class="p sm">${esc(p)}</div>` : ""}<p>${esc(t)}</p></div>`).join("");

    return `
  <section id="${esc(m.id)}" class="mac">
    <div class="banner${m.foto ? "" : " cizgi"}">
      ${m.foto ? `<img src="${esc(m.foto)}" alt="${esc(m.foto_alt || m.sehir)}" loading="eager" decoding="async">` : ""}
      <div class="bn">
        <span class="eb">${esc(m.hafta)}. HAFTA · ${esc(m.sehir.toLocaleUpperCase("tr"))} · 72 SAAT</span>
        <h2>${esc(m.rakip)} – ${esc(team.takim)}</h2>
        <p>${esc(tarihUzun(m.tarih))} · ${esc(m.saat_tsi)} TSİ (yerel ${esc(m.saat_yerel)}) · ${esc(m.stat)}</p>
      </div>
      ${m.foto ? `<span class="cr">Görüntü: Pexels</span>` : ""}
    </div>

    <div class="ozet">
      <div class="ust">
        <div>
          <div class="muted">2 kişi toplam · uçak + otel + maç bileti + yemek</div>
          <div class="tot">~${para(tk * 2, eurTry)}</div>
          <div class="muted">Kişi başı ~${esc(tl(tk))} · ${esc(m.plan || `${tarihKisa(m.gidis)} ${gunAd(m.gidis).toLocaleLowerCase("tr")} gidiş, ${tarihKisa(m.donus)} ${gunAd(m.donus).toLocaleLowerCase("tr")} dönüş, 2 gece`)}</div>
        </div>
        <div class="alt">
          <span class="muted">Daha ucuz plan</span>
          <b>~${esc(tl(tu * 2))}</b>
          <span class="muted">2 kişi${secU ? ` · ${esc(secU.ad)}` : ""}</span>
        </div>
      </div>
      <div class="bar" role="img" aria-label="Bütçe dağılımı">${bar}</div>
      <ul class="kalem">${kalemler}<li class="top"><b>Kişi başı toplam</b><span class="r">~${para(tk, eurTry)}</span></li></ul>
      <div class="chips">${seviye}<span class="etk vize">${esc(m.vize)}</span></div>
    </div>

    <h3>72 saatin akışı</h3>
    <div class="akis">${akis}</div>

    <h3>Uçak <span class="muted">· kişi başı gidiş-dönüş</span></h3>
    <div class="secim"><b>Bütçedeki uçuş:</b> ${esc(o.havayolu)} · ${esc(o.gidis)}${o.donus ? ` · dönüş ${esc(o.donus)}` : ""}</div>
    <ul class="rows">${ucuslar}</ul>
    <p class="muted">${m.ucus.yok ? esc(m.ucus.yok) + " " : ""}${m.uyari ? esc(m.uyari) : ""}</p>

    <h3>Otel <span class="muted">· 2 gece toplam, 2 kişilik oda, vergiler dahil</span></h3>
    ${m.otel_not ? `<p class="secim">${esc(m.otel_not)}</p>` : ""}
    <ul class="rows">${otelSatir}</ul>
    ${m.otel_uyari ? `<p class="muted">${esc(m.otel_uyari)}</p>` : ""}

    <h3>Maç bileti</h3>
    <div class="grid2">
      <div class="card sec"><h4>Resmî satış (önerilen)</h4><div class="p">~${para(team.bilet.fiyat, eurTry)}</div><p>Deplasman tribünü, Fenerbahçe'nin satışı üzerinden. UEFA tavanı uygulanır.</p></div>
      <div class="card"><h4>İkinci el siteler</h4><div class="p sm">~90 €'dan başlıyor</div><p>Pahalı ve deplasman tribünü garanti değil; önermiyoruz.</p></div>
    </div>

    <h3>Ulaşım</h3>
    <div class="grid3">${ulasim}</div>

    ${yemek ? `<h3>Ne yenir? <span class="muted">· kişi başı yaklaşık</span></h3><ul class="rows">${yemek}</ul>` : ""}

    <h3>Maçtan önce gez</h3>
    <ul class="gez">${m.gezi.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>
  </section>`;
  }).join("");

  const css = `<style>
.fbbar { height: 8px; background: repeating-linear-gradient(90deg, #F4D30B 0 28px, #0F2A43 28px 56px); }
.mks { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(230px, 1fr); gap: 10px; overflow-x: auto; margin: 18px -16px 0; padding: 0 16px 6px; scroll-snap-type: x mandatory; }
.mk { scroll-snap-align: start; display: grid; gap: 2px; text-decoration: none; color: #FBF6EC; background: rgba(251,246,236,0.07); border: 1.5px solid rgba(251,246,236,0.18); border-radius: 16px; padding: 12px 14px; }
.mk.ilk { background: #F4D30B; color: #0F2A43; border-color: #F4D30B; }
.mk:hover { border-color: #F4D30B; }
.mk-eb { font: 700 0.68rem/1.3 "IBM Plex Mono", Consolas, monospace; letter-spacing: 0.12em; opacity: .85; }
.mk-s { font-size: 1.35rem; letter-spacing: -0.01em; }
.mk-r, .mk-t, .mk-ps { font-size: 0.82rem; opacity: .9; }
.mk-p { font-size: 1.25rem; font-weight: 800; margin-top: 6px; }
.mac { border-top: 1.5px solid var(--line); padding-top: 28px; scroll-margin-top: 10px; }
.mac:first-of-type { border-top: 0; padding-top: 0; }
.mac h3 { margin: 28px 0 10px; font-size: 1.12rem; }
.mac h3 .muted { font-weight: 500; font-size: 0.85rem; }
.mac h4 { margin: 0 0 4px; font-size: 0.98rem; }
.banner { position: relative; border-radius: 18px; overflow: hidden; min-height: 230px; display: flex; align-items: flex-end; background: #0F2A43; color: #FBF6EC; }
.banner img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.banner::after { content: ""; position: absolute; inset: 0; background: linear-gradient(transparent 25%, rgba(10,31,51,0.92)); }
.banner.cizgi { background: repeating-linear-gradient(90deg, #F4D30B 0 34px, #0F2A43 34px 68px) top / 100% 45% no-repeat, #0F2A43; }
.bn { position: relative; z-index: 1; padding: 16px 18px; }
.bn .eb { font: 700 0.72rem/1.3 "IBM Plex Mono", Consolas, monospace; letter-spacing: 0.14em; color: #F4D30B; }
.bn h2 { font-size: clamp(1.4rem, 5vw, 2rem); margin: 4px 0; line-height: 1.1; }
.bn p { margin: 0; color: #D5DEE8; font-size: 0.92rem; }
.banner .cr { position: absolute; right: 8px; top: 8px; z-index: 1; font-size: 0.7rem; background: rgba(10,31,51,0.7); padding: 2px 8px; border-radius: 999px; }
.ozet { margin-top: 12px; background: var(--pick); border-radius: 18px; padding: 16px 18px; }
.ozet .ust { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; }
.ozet .tot { font-size: clamp(1.9rem, 7vw, 2.4rem); font-weight: 800; letter-spacing: -0.02em; line-height: 1.15; }
.ozet .alt { display: grid; align-content: start; background: var(--surface); border: 1.5px solid var(--line); border-radius: 14px; padding: 10px 14px; min-width: 150px; }
.ozet .alt b { font-size: 1.2rem; }
.bar { display: flex; height: 12px; border-radius: 999px; overflow: hidden; margin: 14px 0 6px; background: var(--line); gap: 2px; }
.bar i { display: block; height: 100%; }
.kalem { list-style: none; margin: 0; padding: 0; }
.kalem li { display: flex; justify-content: space-between; gap: 10px; padding: 7px 0; border-top: 1px solid var(--line); align-items: baseline; }
.kalem li:first-child { border-top: 0; }
.kalem li.top { border-top: 1.5px solid var(--ink); font-size: 1.05rem; }
.kalem small, .rows small, .akis small { display: block; color: var(--muted); font-size: 0.82rem; font-weight: 400; }
.kalem .r { font-weight: 700; white-space: nowrap; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; vertical-align: 1px; }
.ozet .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.etk.vize { background: var(--chip-bg); color: var(--chip-ink); white-space: normal; }
.akis { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 290px), 1fr)); gap: 12px; }
.gun { background: var(--surface); border: 1.5px solid var(--line); border-radius: 16px; padding: 14px 16px; }
.gun ol { list-style: none; margin: 8px 0 0 4px; padding: 0; border-left: 2px solid var(--line); }
.gun li { display: grid; grid-template-columns: 50px 1fr; gap: 8px; padding: 5px 0 5px 14px; position: relative; }
.gun li::before { content: ""; position: absolute; left: -7px; top: 10px; width: 8px; height: 8px; border-radius: 50%; background: var(--surface); border: 2px solid var(--muted); }
.gun li.mac-an::before { background: #F4D30B; border-color: #0F2A43; width: 10px; height: 10px; left: -8px; }
.gun li.mac-an b { background: #F4D30B; color: #0F2A43; border-radius: 6px; padding: 1px 6px; }
.gun time { font-variant-numeric: tabular-nums; font-weight: 700; color: var(--muted); }
.secim { background: var(--surface); border-left: 4px solid #F4D30B; border-radius: 8px; padding: 8px 12px; margin: 0 0 10px; }
.rows li.sec { background: var(--pick); }
.rows .r { white-space: nowrap; }
.tag { font-style: normal; font-size: 0.72rem; font-weight: 800; background: #0F2A43; color: #F4D30B; border-radius: 999px; padding: 2px 8px; }
.tag.u { background: var(--chip-bg); color: var(--chip-ink); }
.grid2, .grid3 { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); }
.card.sec { border-color: #E0C000; }
.card p { margin: 6px 0 0; font-size: 0.92rem; }
.card .p.sm { font-size: 1.05rem; }
.gez { margin: 0; padding-left: 20px; }
.gez li { margin: 3px 0; }
</style>`;
  return head({ title, description, canonical: url, ogTitle: `${team.takim} deplasmanı kaça patlar?`, ogDescription: description, ld }).replace("</head>", css + "</head>") + `
<body>
<header>
  <div class="wrap">
    <nav aria-label="Konum"><ol class="crumbs"><li><a href="/">72h Getaway</a></li><li><span aria-current="page">${esc(team.takim)} deplasmanı</span></li></ol></nav>
    <h1>${esc(team.takim)} deplasmanı kaça patlar?</h1>
    <p>${esc(team.turnuva)}. Her deplasman bir 72 saatlik kaçamak: 2 gece, maç gününe göre seçilmiş uçuşlar, gerçek otel fiyatları ve maç bileti. Büyük rakam 2 kişilik toplam.</p>
    <div class="mks">${kartlar}</div>
  </div>
</header>
<div class="fbbar" aria-hidden="true"></div>
<main class="wrap">
  ${sections || `<p class="empty">Yaklaşan deplasman maçı yok.</p>`}
  <div class="note">${esc(team.bilet.yazi)} Uçak ve otel fiyatları ${esc(tarihUzun(team.guncellendi))} günü Google'dan alındı ve robot tarafından 2 günde bir yenilenir; yemek, araba ve gezi tahminidir. ${eurTry ? `TL tutarları 1 € = ${esc(String(eurTry).replace(".", ","))} TL kuruyla.` : ""} Oynanan maç sayfadan kendiliğinden kalkar. Bu sayfanın ${esc(team.takim)} kulübüyle resmî bir bağı yoktur.
  <br>Kaynaklar: ${(team.kaynaklar || []).map((k) => `<a href="${esc(k.url)}" rel="noopener">${esc(k.ad)}</a>`).join(" · ")}</div>
</main>
` + foot();
}
