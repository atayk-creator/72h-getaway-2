// Takım deplasman sayfası (/deplasman/<slug>/): takım bir "şehir" gibi, her deplasman maçı bir 72 saatlik kaçamak.
// Veri: data/<slug>.json (ör. data/fenerbahce.json). sehir-sayfalari.mjs generate() içinden çağrılır.
const KAT_AD = { ikonik: "İkonik", pahali: "Lüks", konforlu: "Konforlu", ucuz: "Ucuz" };
const KAT_SIRA = ["ikonik", "pahali", "konforlu", "ucuz"];
const BUTCE_AD = { ucus: "Uçak", transfer: "Havalimanı / araba", otel: "Otel (2 gece, kişi payı)", bilet: "Maç bileti", ulasim: "Şehir içi ulaşım", yemek: "Yemek (3 gün)", gezi: "Gezi" };
const GUN = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const AY = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const d = (s) => new Date(s + "T00:00:00Z");
export const tarihUzun = (s) => `${d(s).getUTCDate()} ${AY[d(s).getUTCMonth()]} ${d(s).getUTCFullYear()} ${GUN[d(s).getUTCDay()]}`;
const tarihKisa = (s) => `${d(s).getUTCDate()} ${AY[d(s).getUTCMonth()].slice(0, 3)}`;
export const toplam = (b) => Object.values(b || {}).reduce((a, x) => a + (typeof x === "number" ? x : 0), 0);

/** Yaklaşan maçlar (maç günü dahil), tarih sırasıyla. */
export function upcoming(team, today) {
  return (team.maclar || []).filter((m) => m.tarih >= today).sort((a, b) => a.tarih.localeCompare(b.tarih));
}

export function renderTeamPage(team, { today, eurTry, esc, para, fmtTl, fmtEur, head, foot, SITE }) {
  const url = `${SITE}/deplasman/${team.slug}/`;
  const list = upcoming(team, today);
  const title = `${team.takim} deplasmanı kaça patlar? Otel, uçak, maç bileti (TL) | 72h Getaway`;
  const ilk = list[0];
  const description = list.length
    ? `${team.takim}'nin ${team.turnuva} deplasmanları: ${list.map((m) => `${m.sehir} (${tarihKisa(m.tarih)})`).join(", ")}. 2 gece, uçak + otel + maç bileti; kişi başı ~${fmtTl(toplam(ilk.butce.ucuz), eurTry) || fmtEur(toplam(ilk.butce.ucuz))}'den başlayan 72 saatlik planlar.`
    : `${team.takim} deplasman planları.`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": url, url, name: title, description, inLanguage: "tr", dateModified: team.guncellendi || today, isPartOf: { "@type": "WebSite", name: "72h Getaway", url: SITE + "/" } },
      ...list.map((m) => ({ "@type": "SportsEvent", name: `${m.rakip} – ${team.takim}`, startDate: `${m.tarih}T${m.saat_tsi}:00+03:00`,
        location: { "@type": "Place", name: m.stat, address: { "@type": "PostalAddress", addressLocality: m.sehir, addressCountry: m.ulke } } })),
    ],
  };
  const menu = list.map((m) => `<a class="btn" href="#${esc(m.id)}">${esc(m.sehir)} · ${esc(tarihKisa(m.tarih))}</a>`).join("");
  const sections = list.map((m) => {
    const bk = m.butce.konforlu, bu = m.butce.ucuz, tk = toplam(bk), tu = toplam(bu);
    const o = m.ucus.oneri;
    const oteller = (m.oteller || []).slice().sort((a, b) => KAT_SIRA.indexOf(a.kategori) - KAT_SIRA.indexOf(b.kategori) || a.toplam - b.toplam);
    const enUcuzOtel = Math.min(...oteller.map((h) => h.toplam));
    const rows = (k) => Object.keys(BUTCE_AD).filter((x) => typeof k[x] === "number").map((x) => `<li><span>${BUTCE_AD[x]}</span><span class="r">${k[x] ? para(k[x], eurTry) : "—"}</span></li>`).join("");
    const seviye = m.ucus.seviye === "yuksek" ? `<span class="etk pahali">Uçak şu an pahalı</span>` : m.ucus.seviye === "dusuk" ? `<span class="etk ucuz">Uçak ucuz</span>` : `<span class="etk normal">Uçak normal fiyatında</span>`;
    return `
  <section id="${esc(m.id)}" class="mac">
    <div class="mbas">
      <span class="eb">${esc(m.hafta)}. hafta · ${esc(m.sehir.toLocaleUpperCase("tr"))} · 72 SAAT</span>
      <h2>${esc(m.rakip)} – ${esc(team.takim)}</h2>
      <p class="lead">${esc(tarihUzun(m.tarih))}, ${esc(m.saat_tsi)} TSİ (yerel ${esc(m.saat_yerel)}) · ${esc(m.stat)}, ${esc(m.sehir)}. Plan: ${esc(tarihKisa(m.gidis))} salı gidiş, ${esc(tarihKisa(m.donus))} perşembe dönüş, 2 gece.</p>
    </div>
    ${m.foto ? `<figure class="cover"><img src="${esc(m.foto)}" alt="${esc(m.foto_alt || m.sehir)}" loading="lazy"><figcaption>Görüntü: Pexels</figcaption></figure>` : ""}
    <div class="sum">
      <div class="muted">2 kişi toplam · konforlu · uçak + otel + maç bileti + yemek</div>
      <div class="tot">~${para(tk * 2, eurTry)}</div>
      <div>Kişi başı ~${para(tk, eurTry)} · ucuz seçenekle 2 kişi ~${para(tu * 2, eurTry)}</div>
      <div class="chips">${seviye}<span class="chip">${esc(m.vize)}</span></div>
    </div>
    <div class="zaman"><div class="tri">
      <div class="iyi"><span class="muted">En mantıklı uçuş</span><b>${para(o.fiyat, eurTry)}</b><span class="muted">${esc(o.havayolu)} · ${o.aktarma === 0 ? "aktarmasız" : o.aktarma + " aktarma"} · ${esc(o.havalimani)}</span></div>
      <div><span class="muted">En ucuz otel, 2 gece</span><b>${para(enUcuzOtel, eurTry)}</b><span class="muted">2 kişilik oda, toplam</span></div>
      <div><span class="muted">Maç bileti</span><b>~${para(team.bilet.fiyat, eurTry)}</b><span class="muted">deplasman tribünü</span></div>
    </div></div>

    <h3>Uçak (kişi başı gidiş-dönüş)</h3>
    <p class="muted">Önerimiz: ${esc(o.gidis)} · ${esc(o.donus)}</p>
    <ul class="rows">${m.ucus.secenekler.map((s, i) => `<li><span><b>${esc(s.havayolu)}</b> · ${esc(s.havalimani)}<br><span class="muted">${esc(s.not)}</span></span><span class="r${i === 0 ? " best" : ""}">${para(s.fiyat, eurTry)}</span></li>`).join("")}</ul>
    <p class="muted">${m.ucus.yok ? esc(m.ucus.yok) + " " : ""}Bu rotada normal fiyat aralığı ${esc(m.ucus.normal_aralik)}.</p>

    ${m.araba ? `<h3>Viyana'dan arabayla Linz'e</h3><div class="card"><div class="p">~${para(m.araba.kisi_basi, eurTry)} <span class="eur">kişi başı (2 kişi)</span></div><p>${esc(m.araba.yazi)}</p><p class="muted">${esc(m.araba.sart)}</p></div>` : ""}
    ${m.havalimani_ulasim ? `<h3>Havalimanından şehre</h3><p>${esc(m.havalimani_ulasim.yazi)}</p>` : ""}

    <h3>Otel (2 gece toplam, vergiler dahil)</h3>
    <div class="grid">${oteller.map((h) => `<div class="card"><span class="chip">${esc(KAT_AD[h.kategori] || h.kategori)}</span><h4>${esc(h.ad)}</h4><div class="p">${para(h.toplam, eurTry)}</div><div class="s">2 gece · kişi başı ${para(h.toplam / 2, eurTry)}</div></div>`).join("")}</div>
    ${m.otel_uyari ? `<p class="muted">${esc(m.otel_uyari)}</p>` : ""}

    <h3>Stada nasıl gidilir?</h3>
    <p>${esc(m.stada)} ${m.stat_not ? esc(m.stat_not) : ""}</p>
    <h3>Şehir içi ulaşım</h3>
    <p>${esc(m.sehir_ulasim.yazi)}</p>

    <h3>Maçtan önce gez</h3>
    <ul>${m.gezi.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>

    <h3>Kişi başı bütçe</h3>
    <div class="two">
      <div><h4>Konforlu</h4><ul class="rows">${rows(bk)}<li><b>Toplam</b><span class="r best">~${para(tk, eurTry)}</span></li></ul></div>
      <div><h4>Ucuz</h4><ul class="rows">${rows(bu)}<li><b>Toplam</b><span class="r best">~${para(tu, eurTry)}</span></li></ul></div>
    </div>
  </section>`;
  }).join("");
  const css = `<style>
.fbbar { height: 8px; background: repeating-linear-gradient(90deg, #F4D30B 0 28px, #0F2A43 28px 56px); }
.mac { border-top: 1.5px solid var(--line); padding-top: 26px; }
.mac:first-of-type { border-top: 0; padding-top: 0; }
.mac .eb { font-size: 0.78rem; font-weight: 800; letter-spacing: 0.08em; color: var(--muted); }
.mac h3 { margin: 22px 0 8px; font-size: 1.05rem; }
.mac h4 { margin: 6px 0 2px; font-size: 0.98rem; }
.mac .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.mac .zaman { margin-top: 12px; }
.mac .zaman .tri span { display: block; font-size: 0.85rem; }
.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 12px; }
.menu { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.menu .btn { color: #FBF6EC; background: transparent; border-color: rgba(251,246,236,0.4); }
</style>`;
  return head({ title, description, canonical: url, ogTitle: `${team.takim} deplasmanı kaça patlar?`, ogDescription: description, ld }).replace("</head>", css + "</head>") + `
<body>
<header>
  <div class="wrap">
    <nav aria-label="Konum"><ol class="crumbs"><li><a href="/">72h Getaway</a></li><li><span aria-current="page">${esc(team.takim)} deplasmanı</span></li></ol></nav>
    <h1>${esc(team.takim)} deplasmanı kaça patlar?</h1>
    <p>${esc(team.turnuva)}. Her deplasman bir 72 saatlik kaçamak: salı gidiş, çarşamba maç, perşembe dönüş. Uçak, otel ve maç bileti gerçek fiyatlarla, kişi başı.</p>
    <div class="menu">${menu}</div>
  </div>
</header>
<div class="fbbar" aria-hidden="true"></div>
<main class="wrap">
  ${sections || `<p class="empty">Yaklaşan deplasman maçı yok.</p>`}
  <div class="note">${esc(team.bilet.yazi)} Uçak ve otel fiyatları ${esc(tarihUzun(team.guncellendi))} günü Google'dan alındı; yemek ve gezi tahminidir. ${eurTry ? `TL tutarları 1 € = ${esc(String(eurTry).replace(".", ","))} TL kuruyla.` : ""} Bu sayfanın ${esc(team.takim)} kulübüyle resmî bir bağı yoktur.
  <br>Kaynaklar: ${(team.kaynaklar || []).map((k) => `<a href="${esc(k.url)}" rel="noopener">${esc(k.ad)}</a>`).join(" · ")}</div>
</main>
` + foot();
}
