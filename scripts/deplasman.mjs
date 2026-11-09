// Takım deplasman sayfası (/deplasman/<slug>/): takım bir "şehir" gibi, her deplasman maçı bir 72 saatlik kaçamak.
// Veri: data/<slug>.json (ör. data/fenerbahce.json). sehir-sayfalari.mjs generate() içinden çağrılır.
const KAT_AD = { ikonik: "İkonik", pahali: "Lüks", konforlu: "Konforlu", ucuz: "Uygun" };
const KAT_SIRA = ["ucuz", "konforlu", "pahali", "ikonik"];
const KALEM = [
  ["ucus", "Uçak", "#0F2A43"], ["transfer", "Havalimanı ve tren", "#4B6A88"], ["otel", "Otel", "#F4A62A"], ["bilet", "Maç bileti", "#E0C000"],
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
/** Şehir sayfalarıyla aynı ölçü: 2 kişi gidiş-dönüş uçak + 2 gece konforlu otel (EUR). */
export const ucakOtel = (m) => 2 * ((m.butce.konforlu.ucus || 0) + (m.butce.konforlu.otel || 0));
const aralikTr = (g, c) => { const a = d(g), b = d(c); return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${b.getUTCDate()} ${AY[b.getUTCMonth()]}` : `${a.getUTCDate()} ${AY[a.getUTCMonth()]} – ${b.getUTCDate()} ${AY[b.getUTCMonth()]}`; };
/** Maç satırları için etiket: maçlar arasında ortancaya göre ucuz / normal / pahalı (şehirlerdeki ±%10 kuralı). */
export function etiketler(list) {
  const t = list.map(ucakOtel).sort((a, b) => a - b), med = t.length ? t[Math.floor((t.length - 1) / 2)] : 0;
  return list.map((m) => { const f = med ? Math.round(((ucakOtel(m) - med) / med) * 100) : 0; return { etiket: f <= -10 ? "ucuz" : f >= 10 ? "pahali" : "normal", fark: f }; });
}

/** Konaklama grupları: tek şehir (m.oteller, tüm geceler) ya da gece gece şehir (m.konaklama). */
export function gruplar(m) {
  if (Array.isArray(m.konaklama) && m.konaklama.length) return m.konaklama.map((k, i) => ({ baslik: `${i + 1}. gece · ${k.sehir}`, gece: 1, tarih: k.gece, secim: k.secim || {}, oteller: k.oteller, not: k.not }));
  return [{ baslik: null, gece: 2, secim: m.secim || {}, oteller: m.oteller || [], not: m.otel_not }];
}
/** Bütçedeki otel adları ("A + B"). */
export const secimAd = (m, k = "konforlu") => gruplar(m).map((g) => g.secim[k]).filter(Boolean).join(" + ");

/** Yaklaşan maçlar (maç günü dahil), tarih sırasıyla. */
export function upcoming(team, today) {
  return (team.maclar || []).filter((m) => m.tarih >= today).sort((a, b) => a.tarih.localeCompare(b.tarih));
}

/** Tema "şehri" (ör. data/noel.json, tur: "tema"): maç yerine etkinlik, maç bileti yok. */
export const tema = (team) => team && team.tur === "tema";
const olay = (m, team) => (tema(team) ? m.etkinlik : `${m.rakip} – ${team.takim}`);
const aktarmaYazi = (o) => (o && o.aktarma ? "aktarmalı" : "aktarmasız");

export function renderTeamPage(team, { today, eurTry, esc, para, fmtTl, fmtEur, head, foot, SITE }) {
  const url = `${SITE}/sehir/${team.slug}/`;
  const list = upcoming(team, today).filter((m) => m.ucus && m.ucus.oneri);
  const T = tema(team);
  const tl = (eur) => fmtTl(eur, eurTry) || fmtEur(eur);
  const title = T ? `${team.takim} kaça patlar? Noel pazarı şehirleri, otel ve uçak (TL) | 72h Getaway` : `${team.takim} deplasmanı kaça patlar? Otel, uçak, maç bileti (TL) | 72h Getaway`;
  const description = !list.length ? `${team.takim} planları.` : T
    ? `${team.turnuva}: ${list.map((m) => `${m.sehir} (${aralikTr(m.gidis, m.donus)})`).join(", ")}. Uçak + otel + yemek + gezi; 2 kişi toplam ~${tl(toplam(list[0].butce.konforlu) * 2)}'den başlayan 72 saatlik Noel planları.`
    : `${team.takim}'nin ${team.turnuva} deplasmanları: ${list.map((m) => `${m.sehir} (${tarihKisa(m.tarih)})`).join(", ")}. Uçak + otel + maç bileti + yemek; 2 kişi toplam ~${tl(toplam(list[0].butce.konforlu) * 2)}'den başlayan 72 saatlik planlar.`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": url, url, name: title, description, inLanguage: "tr", dateModified: team.guncellendi || today, isPartOf: { "@type": "WebSite", name: "72h Getaway", url: SITE + "/" } },
      ...list.map((m) => T ? { "@type": "Event", name: `${m.etkinlik}, ${m.sehir}`, startDate: m.pazar_bas, endDate: m.pazar_bit,
        location: { "@type": "Place", name: m.yer, address: { "@type": "PostalAddress", addressLocality: m.sehir, addressCountry: m.ulke } } }
        : { "@type": "SportsEvent", name: `${m.rakip} – ${team.takim}`, startDate: `${m.tarih}T${m.saat_tsi}:00+03:00`,
        location: { "@type": "Place", name: m.stat, address: { "@type": "PostalAddress", addressLocality: m.sehir, addressCountry: m.ulke } } }),
    ],
  };

  // Üstte maç kartları (vitrin gibi)
  const kartlar = list.map((m, i) => {
    const k = kalan(today, m.tarih);
    return `<a class="mk${i === 0 ? " ilk" : ""}" href="#${esc(m.id)}">
      <span class="mk-eb">${i === 0 ? "SIRADAKİ · " : ""}${T ? esc(aralikTr(m.gidis, m.donus).toLocaleUpperCase("tr")) : esc(m.hafta) + ". HAFTA"}</span>
      <b class="mk-s">${esc(m.mac_sehri || m.sehir)}</b>
      <span class="mk-r">${esc(olay(m, team))}</span>
      <span class="mk-t">${T ? `${esc(gunAd(m.gidis))} – ${esc(gunAd(m.donus))}` : `${esc(tarihKisa(m.tarih))} ${esc(gunAd(m.tarih))} · ${esc(m.saat_tsi)} TSİ`}${k >= 0 ? ` · ${k === 0 ? "bugün" : k + " gün kaldı"}` : ""}</span>
      <span class="mk-p">~${esc(tl(toplam(m.butce.konforlu) * 2))}</span><span class="mk-ps">2 kişi toplam · her şey dahil</span>
    </a>`;
  }).join("");

  const sections = list.map((m) => {
    const bk = m.butce.konforlu, bu = m.butce.ucuz, tk = toplam(bk), tu = toplam(bu);
    const o = m.ucus.oneri;
    const G = gruplar(m), adK = secimAd(m, "konforlu"), adU = secimAd(m, "ucuz");
    // Uygun plan yalnız ayrı, fiyatı gerçek bir uygun otel varsa (ya da seçim elle sabitlenmişse) gösterilir
    const uygunVar = m.uygun_plan !== undefined ? m.uygun_plan : !!adU && (adU !== adK || G.some((g) => g.secim.sabit));
    const bar = KALEM.filter(([k]) => bk[k] > 0).map(([k, ad, renk]) => `<i style="width:${((bk[k] / tk) * 100).toFixed(1)}%;background:${renk}" title="${esc(ad)}"></i>`).join("");
    const kalemler = KALEM.filter(([k]) => typeof bk[k] === "number").map(([k, ad, renk]) => {
      const alt = k === "ucus" ? `${o.havayolu}, ${aktarmaYazi(o)}` : k === "otel" && adK ? `${adK}, 2 gecenin yarısı` : k === "transfer" && m.transfer_yazi ? m.transfer_yazi.konforlu : k === "transfer" && m.trenler ? `trenler: ${m.trenler.map((t) => t.ad).join(", ")}` : k === "transfer" && m.araba ? "kiralık araba, 2 kişiye bölünmüş" : k === "bilet" ? "deplasman tribünü, resmî satış" : "";
      return `<li><span><i class="dot" style="background:${renk}"></i>${esc(ad)}${alt ? `<small>${esc(alt)}</small>` : ""}</span><span class="r">${bk[k] ? para(bk[k], eurTry) : "—"}</span></li>`;
    }).join("");
    const seviye = m.ucus.seviye === "yuksek" ? `<span class="etk pahali">Uçak şu an pahalı · normali ${esc(m.ucus.normal_aralik)}</span>` : m.ucus.seviye === "dusuk" ? `<span class="etk ucuz">Uçak fırsat fiyatında</span>` : `<span class="etk normal">Uçak normal fiyatında</span>`;
    const akis = (m.akis || []).map((g) => `<div class="gun"><h4>${esc(g.gun)}</h4><ol>${g.adimlar.map(([saat, ne, not]) => `<li${/ – /.test(ne) ? ' class="mac-an"' : ""}><time>${esc(saat)}</time><span><b>${esc(ne)}</b>${not ? `<small>${esc(not)}</small>` : ""}</span></li>`).join("")}</ol></div>`).join("");
    const ucuslar = m.ucus.secenekler.map((s) => `<li${s.fiyat === o.fiyat && s.havayolu === o.havayolu ? ' class="sec"' : ""}><span><b>${esc(s.havayolu)}</b> · ${esc(s.havalimani)}<small>${esc(s.not)}</small></span><span class="r">${para(s.fiyat, eurTry)}</span></li>`).join("");
    const otelSatir = G.map((g) => {
      // Fiyatı gelmeyen (ya da aşırı bulunup gizlenen) otel: 0 TL değil "fiyat doğrulanıyor"; listenin sonunda
      const fiyatli = (h) => typeof h.toplam === "number" && h.toplam > 0;
      const l = g.oteller.slice().sort((a, b) => (fiyatli(b) - fiyatli(a)) || KAT_SIRA.indexOf(a.kategori) - KAT_SIRA.indexOf(b.kategori) || a.toplam - b.toplam).map((h) => {
        if (!fiyatli(h)) return `<li class="dog"><span><span class="chip">${esc(KAT_AD[h.kategori] || h.kategori)}</span> <b>${esc(h.ad)}</b><small>Bu tarihler için henüz fiyat yok</small></span><span class="r muted">fiyat doğrulanıyor</span></li>`;
        const tag = h.ad === g.secim.konforlu ? `<em class="tag">Bütçede</em>` : h.ad === g.secim.ucuz && uygunVar ? `<em class="tag u">Uygun planda</em>` : "";
        return `<li${tag ? ' class="sec"' : ""}><span><span class="chip">${esc(KAT_AD[h.kategori] || h.kategori)}</span> <b>${esc(h.ad)}</b> ${tag}<small>kişi başı ${esc(tl(h.toplam / 2))}</small></span><span class="r">${para(h.toplam, eurTry)}</span></li>`;
      }).join("");
      return (g.baslik ? `<h4 class="gece">${esc(g.baslik)}${g.tarih ? ` <span class="muted">· ${esc(tarihKisa(g.tarih))} ${esc(gunAd(g.tarih))}</span>` : ""}</h4>` : "") + (g.not ? `<p class="secim">${esc(g.not)}</p>` : "") + `<ul class="rows">${l}</ul>`;
    }).join("");
    const trenler = (m.trenler || []).map((t) => { const c = t.secili || {}; return `<div class="card${t === m.trenler[0] ? "" : ""}"><h4>${esc(t.ad)}</h4><div class="p sm">${typeof t.fiyat === "number" ? `${esc(tl(t.fiyat))} <span class="eur">(${esc(t.fiyat.toFixed(2).replace(".", ","))} €)</span>` : "fiyat bekleniyor"}</div><p><b>${esc(tarihKisa(t.tarih))} ${esc(gunAd(t.tarih))} · ${esc(c.kalkis || t.saat)} → ${esc(c.varis || "")}</b> · ${esc(c.tren || "")}${c.aktarma ? ` · ${c.aktarma} aktarma` : " · aktarmasız"} · ${esc(String(c.sure_dk || ""))} dk</p>${t.not ? `<p class="muted">${esc(t.not)}</p>` : ""}${(t.secenekler || []).length > 1 ? `<details><summary>Diğer seferler</summary><ul class="rows">${t.secenekler.map((x) => `<li><span>${esc(x.kalkis)} → ${esc(x.varis)} · ${esc(x.tren)}${x.aktarma ? ` · ${x.aktarma} aktarma` : ""}</span><span class="r">${typeof x.fiyat === "number" ? esc(x.fiyat.toFixed(2).replace(".", ",")) + " €" : "—"}</span></li>`).join("")}</ul></details>` : ""}</div>`; }).join("");
    const yemek = (m.yemek || []).map(([ad, ne, f]) => `<li><span><b>${esc(ad)}</b><small>${esc(ne)}</small></span><span class="r">${esc(f)}</span></li>`).join("");
    const ulasim = [
      m.trenler ? null : m.araba ? ["Viyana'dan arabayla", `~${tl(m.araba.toplam)} araç başı`, m.araba.yazi] : m.havalimani_ulasim ? ["Havalimanından şehre", m.havalimani_ulasim.fiyat ? `~${tl(m.havalimani_ulasim.fiyat)} kişi başı` : "turist kartına dahil", m.havalimani_ulasim.yazi] : null,
      m.stada ? ["Stada", "", m.stada + (m.stat_not ? " " + m.stat_not : "")] : m.pazara ? ["Pazarlara", "", m.pazara] : null,
      ["Şehir içi", m.sehir_ulasim.fiyat ? `~${tl(m.sehir_ulasim.fiyat)} kişi başı` : "", m.sehir_ulasim.yazi],
    ].filter(Boolean).map(([h, p, t]) => `<div class="card"><h4>${esc(h)}</h4>${p ? `<div class="p sm">${esc(p)}</div>` : ""}<p>${esc(t)}</p></div>`).join("");

    return `
  <section id="${esc(m.id)}" class="mac">
    <div class="banner${m.foto ? "" : " cizgi"}">
      ${m.foto ? `<img src="${esc(m.foto)}" alt="${esc(m.foto_alt || m.sehir)}" loading="eager" decoding="async">` : ""}
      <div class="bn">
        <span class="eb">${T ? esc(aralikTr(m.gidis, m.donus).toLocaleUpperCase("tr")) : esc(m.hafta) + ". HAFTA"} · ${esc(m.sehir.toLocaleUpperCase("tr"))} · 72 SAAT</span>
        <h2>${T ? `${esc(m.sehir)}: ${esc(m.etkinlik)}` : `${esc(m.rakip)} – ${esc(team.takim)}`}</h2>
        <p>${T ? `${esc(m.yer)} · pazar ${esc(m.pazar_yazi)}, ${esc(m.pazar_saat)}${m.ozet ? `<br>${esc(m.ozet)}` : ""}` : `${esc(tarihUzun(m.tarih))} · ${esc(m.saat_tsi)} TSİ (yerel ${esc(m.saat_yerel)}) · ${esc(m.stat)}${m.mac_sehri ? ", " + esc(m.mac_sehri) : ""}`}</p>
      </div>
      ${m.foto ? `<span class="cr">Görüntü: ${esc(m.foto_kaynak || "Pexels")}</span>` : ""}
    </div>

    <div class="ozet">
      <div class="ust">
        <div>
          <div class="muted">2 kişi toplam · uçak + otel + ${T ? "yemek + gezi" : "maç bileti + yemek"}</div>
          <div class="tot">~${para(tk * 2, eurTry)}</div>
          <div class="muted">Kişi başı ~${esc(tl(tk))} · ${esc(m.plan || `${tarihKisa(m.gidis)} ${gunAd(m.gidis).toLocaleLowerCase("tr")} gidiş, ${tarihKisa(m.donus)} ${gunAd(m.donus).toLocaleLowerCase("tr")} dönüş, 2 gece`)}</div>
        </div>
        ${uygunVar ? `<div class="alt">
          <span class="muted">Daha uygun plan</span>
          <b>~${esc(tl(tu * 2))}</b>
          <span class="muted">2 kişi${adU ? ` · ${esc(adU)}` : ""}</span>
        </div>` : ""}
      </div>
      <div class="bar" role="img" aria-label="Bütçe dağılımı">${bar}</div>
      <ul class="kalem">${kalemler}<li class="top"><b>Kişi başı toplam</b><span class="r">~${para(tk, eurTry)}</span></li></ul>
      <div class="chips">${seviye}<span class="etk vize">${esc(m.vize)}</span></div>
      ${m.dikkat ? `<p class="dikkat"><b>Dikkat:</b> ${esc(m.dikkat)}</p>` : ""}
    </div>

    <h3>72 saatin akışı</h3>
    <div class="akis">${akis}</div>

    <h3>Uçak <span class="muted">· kişi başı gidiş-dönüş</span></h3>
    <div class="secim"><b>Bütçedeki uçuş:</b> ${esc(o.havayolu)} · ${esc(o.gidis)}${o.donus ? ` · dönüş ${esc(o.donus)}` : ""}</div>
    <ul class="rows">${ucuslar}</ul>
    <p class="muted">${m.ucus.yok ? esc(m.ucus.yok) + " " : ""}${m.uyari ? esc(m.uyari) : ""}</p>

    <h3>Otel <span class="muted">· ${G.length > 1 ? "gece başına toplam" : "2 gece toplam"}, 2 kişilik oda, vergiler dahil</span></h3>
    ${otelSatir}
    ${m.otel_uyari ? `<p class="muted">${esc(m.otel_uyari)}</p>` : ""}

    ${trenler ? `<h3>Trenler <span class="muted">· kişi başı, 2. sınıf, gerçek fiyat</span></h3><div class="grid3">${trenler}</div>` : ""}

    ${team.bilet ? `<h3>Maç bileti</h3>
    <div class="grid2">
      <div class="card sec"><h4>Resmî satış (önerilen)</h4><div class="p">~${para(team.bilet.fiyat, eurTry)}</div><p>Deplasman tribünü, ${esc(team.takim)} kulübünün satışı üzerinden. UEFA tavanı uygulanır.</p></div>
      <div class="card"><h4>İkinci el siteler</h4><div class="p sm">~90 €'dan başlıyor</div><p>Pahalı ve deplasman tribünü garanti değil; önermiyoruz.</p></div>
    </div>` : ""}

    <h3>Ulaşım</h3>
    <div class="grid3">${ulasim}</div>

    ${yemek ? `<h3>Ne yenir? <span class="muted">· kişi başı yaklaşık</span></h3><ul class="rows">${yemek}</ul>` : ""}

    <h3>${T ? "Ne gezilir?" : "Maçtan önce gez"}</h3>
    <ul class="gez">${m.gezi.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>
  </section>`;
  }).join("");

  // ---- Şehir sayfası standardı: en yakın maç, maç takvimi (hafta sonu gibi), otel, uçak
  const ilk = list[0];
  const etk = etiketler(list);
  const lo = list.length ? list.reduce((a, b) => (ucakOtel(b) < ucakOtel(a) ? b : a)) : null;
  const hi = list.length ? list.reduce((a, b) => (ucakOtel(b) > ucakOtel(a) ? b : a)) : null;
  const ETK = { ucuz: "Fırsat", normal: "Normal fiyat", pahali: "Pahalı" };
  const secOtel = (m) => { const a = secimAd(m); return a ? { ad: a } : null; };
  const standart = !ilk ? "" : `
  <section>
    <h2>${T ? "Sıradaki hafta sonu" : "Sıradaki maç"}: ${esc(aralikTr(ilk.gidis, ilk.donus))} · ${esc(ilk.mac_sehri || ilk.sehir)}</h2>
    <p class="lead">${T ? `${esc(ilk.etkinlik)}, ${esc(ilk.yer)}.` : `${esc(ilk.rakip)} – ${esc(team.takim)}, ${esc(tarihUzun(ilk.tarih))} ${esc(ilk.saat_tsi)} TSİ.`} Fiyatlar ${esc(tarihUzun(team.guncellendi))} tarihli robot kontrolüne göre; 2 gece, 2 kişi.</p>
    <div class="sum">
      <div class="muted">${esc(aralikTr(ilk.gidis, ilk.donus))} · 2 kişi · uçak + önerilen otel</div>
      <div class="tot">~${para(ucakOtel(ilk), eurTry)}</div>
      <div class="muted">${T ? "yemek, ulaşım ve gezi ile" : "maç bileti ve yemekle"} tam bütçe: ~${esc(tl(toplam(ilk.butce.konforlu) * 2))}</div>
      <ul>
        <li>Otel, 2 gece: ${para(ilk.butce.konforlu.otel * 2, eurTry)}${secOtel(ilk) ? ` · ${esc(secOtel(ilk).ad)}` : ""}</li>
        <li>Uçak, 2 kişi gidiş-dönüş: ${para(ilk.butce.konforlu.ucus * 2, eurTry)} · ${esc(ilk.ucus.oneri.havayolu)}, ${aktarmaYazi(ilk.ucus.oneri)}</li>
      </ul>
    </div>
  </section>
  <section class="zaman">
    <h2>${T ? "Hangi şehre gitmeli?" : "Hangi maça gitmeli?"}</h2>
    <p class="lead">${T ? "Aralık hafta sonları" : "Kalan deplasmanlar, hafta sonu takvimi gibi"}: 2 kişi uçak + önerilen otel (2 gece). Etiket ${T ? "şehirlerin" : "maçların"} ortanca fiyatına göre: %10 altındaysa Fırsat, %10 üstündeyse Pahalı.</p>
    <div class="tri">
      <div><span class="muted">Sıradaki · ${esc(ilk.mac_sehri || ilk.sehir)}</span><b>${esc(tl(ucakOtel(ilk)))}</b></div>
      <div class="iyi"><span class="muted">En uygun · ${esc(lo.mac_sehri || lo.sehir)}</span><b>${esc(tl(ucakOtel(lo)))}</b></div>
      <div><span class="muted">En pahalı · ${esc(hi.mac_sehri || hi.sehir)}</span><b>${esc(tl(ucakOtel(hi)))}</b></div>
    </div>
    <ul class="rows">${list.map((m, i) => `<li><span><a href="#${esc(m.id)}"><b>${esc(aralikTr(m.gidis, m.donus))}</b></a> · ${esc(m.mac_sehri || m.sehir)} <span class="etk ${m === lo && list.length > 1 ? "ucuz" : etk[i].etiket}">${m === lo && list.length > 1 ? "En uygun" : ETK[etk[i].etiket]}${etk[i].fark && etk[i].etiket !== "normal" ? ` · ${etk[i].fark > 0 ? "+" : "−"}%${Math.abs(etk[i].fark)}` : ""}</span><small>${T ? esc(m.etkinlik) : `${esc(m.rakip)} · ${esc(tarihKisa(m.tarih))} ${esc(m.saat_tsi)} TSİ`}</small></span><span class="r${m === lo ? " best" : ""}">${para(ucakOtel(m), eurTry)}</span></li>`).join("")}</ul>
  </section>
  <section>
    <h2>Otel, 2 gece</h2>
    <p class="lead">Her ${T ? "hafta sonu" : "maç"} için bütçedeki önerilen otel (2 kişilik oda, vergiler dahil). Bütün oteller ${T ? "şehrin" : "maçın"} kendi bölümünde.</p>
    <ul class="rows">${list.map((m) => `<li><span><b>${esc(m.sehir)}</b> · ${esc(secOtel(m) ? secOtel(m).ad : "")}<small>${esc(aralikTr(m.gidis, m.donus))}</small></span><span class="r">${para(m.butce.konforlu.otel * 2, eurTry)}</span></li>`).join("")}</ul>
  </section>
  <section>
    <h2>İstanbul'dan uçak</h2>
    <p class="lead">Kişi başı gidiş-dönüş, ${T ? "Cuma gidiş ve Pazar dönüşe göre seçilmiş uçuş" : "maç gününe göre seçilmiş uçuş"}.</p>
    <ul class="rows">${list.map((m) => `<li><span><b>${esc(m.sehir)}</b> · ${esc(m.ucus.oneri.havayolu)}<small>${esc(m.ucus.oneri.gidis)}</small></span><span class="r">${para(m.ucus.oneri.fiyat, eurTry)}</span></li>`).join("")}</ul>
  </section>
  <section><h2>${T ? "Şehir şehir 72 saat" : "Maç maç 72 saat"}</h2><p class="lead">${T ? "Her Noel şehri için gün gün akış, bütün uçuş ve otel seçenekleri, pazarlar, ulaşım ve yemek." : "Her deplasman için gün gün akış, bütün uçuş ve otel seçenekleri, maç bileti, ulaşım ve yemek."}</p></section>`;

  const rk = team.renk || { a: "#F4D30B", b: "#0F2A43" };
  // --tk-c: açık zeminde görünen vurgu rengi (beyaz takım rengi kenarlıkta görünmez, o zaman ikinci renk)
  const acik = (h) => { const n = parseInt(h.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 200; };
  const css = `<style>
:root { --tk-a: ${rk.a}; --tk-b: ${rk.b}; --tk-c: ${acik(rk.a) ? rk.b : rk.a}; --tk-ink: ${rk.ink || (acik(rk.a) ? "#FFFFFF" : rk.a)}; }
.fbbar { height: 8px; background: repeating-linear-gradient(90deg, var(--tk-a) 0 28px, var(--tk-b) 28px 56px); }
.mks { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(230px, 1fr); gap: 10px; overflow-x: auto; margin: 18px -16px 0; padding: 0 16px 6px; scroll-snap-type: x mandatory; }
.mk { scroll-snap-align: start; display: grid; gap: 2px; text-decoration: none; color: #FBF6EC; background: rgba(251,246,236,0.07); border: 1.5px solid rgba(251,246,236,0.18); border-radius: 16px; padding: 12px 14px; }
.mk.ilk { background: var(--tk-a); color: ${rk.mk || "var(--tk-b)"}; border-color: var(--tk-a); }
.mk:hover { border-color: var(--tk-a); }
.mk-eb { font: 700 0.68rem/1.3 "IBM Plex Mono", Consolas, monospace; letter-spacing: 0.12em; opacity: .85; }
.mk-s { font-size: 1.35rem; letter-spacing: -0.01em; }
.mk-r, .mk-t, .mk-ps { font-size: 0.82rem; opacity: .9; }
.mk-p { font-size: 1.25rem; font-weight: 800; margin-top: 6px; }
.mac { border-top: 1.5px solid var(--line); padding-top: 28px; scroll-margin-top: 10px; }
.rows a { text-decoration: none; }
.rows small { display: block; color: var(--muted); font-size: 0.82rem; }
.zaman .tri span { display: block; font-size: 0.85rem; }
.mac h3 { margin: 28px 0 10px; font-size: 1.12rem; }
.mac h3 .muted { font-weight: 500; font-size: 0.85rem; }
.mac h4 { margin: 0 0 4px; font-size: 0.98rem; }
.banner { position: relative; border-radius: 18px; overflow: hidden; min-height: 230px; display: flex; align-items: flex-end; background: #0F2A43; color: #FBF6EC; }
.banner img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.banner::after { content: ""; position: absolute; inset: 0; background: linear-gradient(rgba(10,31,51,0) 0, rgba(10,31,51,0.15) 70px, rgba(10,31,51,0.78) 130px, rgba(10,31,51,0.94)); }
.banner.cizgi { background: repeating-linear-gradient(90deg, var(--tk-a) 0 34px, var(--tk-b) 34px 68px) top / 100% 45% no-repeat, var(--tk-b); }
.bn { position: relative; z-index: 1; padding: 104px 18px 16px; text-shadow: 0 1px 3px rgba(0,0,0,0.45); }
.banner.cizgi .bn { padding-top: 16px; }
.bn .eb { font: 700 0.72rem/1.3 "IBM Plex Mono", Consolas, monospace; letter-spacing: 0.14em; color: var(--tk-ink); }
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
.gun li.mac-an::before { background: var(--tk-a); border-color: var(--tk-b); width: 10px; height: 10px; left: -8px; }
.gun li.mac-an b { background: var(--tk-a); color: var(--tk-b); box-shadow: 0 0 0 1px var(--tk-b); border-radius: 6px; padding: 1px 6px; }
.gun time { font-variant-numeric: tabular-nums; font-weight: 700; color: var(--muted); }
.secim { background: var(--surface); border-left: 4px solid var(--tk-c); border-radius: 8px; padding: 8px 12px; margin: 0 0 10px; }
.rows li.sec { background: var(--pick); }
.rows .r { white-space: nowrap; }
.tag { font-style: normal; font-size: 0.72rem; font-weight: 800; background: var(--tk-b); color: var(--tk-a); outline: 1px solid var(--tk-a); border-radius: 999px; padding: 2px 8px; }
.tag.u { background: var(--chip-bg); color: var(--chip-ink); }
.grid2, .grid3 { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); }
.card.sec { border-color: var(--tk-c); }
.dikkat { margin: 12px 0 0; padding: 10px 14px; border-radius: 12px; background: #FBE1CF; color: #8A3A12; font-size: 0.92rem; }
.card p { margin: 6px 0 0; font-size: 0.92rem; }
.card .p.sm { font-size: 1.05rem; }
.gez { margin: 0; padding-left: 20px; }
.bagimsiz { margin: 0 0 18px; padding: 10px 14px; border-radius: 12px; background: var(--surface); border: 1.5px dashed var(--line); font-size: 0.9rem; color: var(--muted); }
.mac h4.gece { margin: 14px 0 6px; font-size: 1rem; }
.card details { margin-top: 8px; font-size: 0.88rem; }
.card details summary { cursor: pointer; color: var(--muted); }
.gez li { margin: 3px 0; }
</style>`;
  return head({ title, description, canonical: url, ogTitle: T ? `${team.takim} kaça patlar?` : `${team.takim} deplasmanı kaça patlar?`, ogDescription: description, ld }).replace("</head>", css + "</head>") + `
<body>
<header>
  <div class="wrap">
    <nav aria-label="Konum"><ol class="crumbs"><li><a href="/">72h Getaway</a></li><li><a href="/sehir/">Şehirler</a></li><li><span aria-current="page">${esc(team.takim)}</span></li></ol></nav>
    <h1>${esc(team.takim)} ${T ? "bütçesi" : "deplasman bütçesi"}</h1>
    <p>${T ? `İstanbul'dan Noel pazarı şehirlerine 72 saatlik kaçamak: ${esc(team.turnuva)}. Robotun bulduğu gerçek otel ve uçak fiyatları, yemek, ulaşım ve gezi. 2 kişi için.` : `İstanbul'dan ${esc(team.takim)} deplasmanlarına 72 saatlik kaçamak: ${esc(team.turnuva)}. Robotun bulduğu gerçek otel ve uçak fiyatları, maç bileti, yemek ve ulaşım. 2 kişi için.`}</p>
    <div class="hero"><a class="big" href="/#takvim/${esc(team.slug)}">${T ? "Hafta sonu takvimi" : "Maç takvimi"}</a>${ilk ? `<a class="ghost" href="#${esc(ilk.id)}">${T ? "Sıradaki şehrin planı →" : "Sıradaki maçın planı →"}</a>` : ""}</div>
    <div class="mks">${kartlar}</div>
  </div>
</header>
<div class="fbbar" aria-hidden="true"></div>
<main class="wrap">
  ${T ? "" : `<p class="bagimsiz">${esc(team.bagimsiz || `Bağımsız bir seyahat planlayıcısıyız; ${team.takim} ile resmî bir bağımız yoktur.`)}</p>`}
  ${standart}
  ${sections || `<p class="empty">${T ? "Yaklaşan hafta sonu yok." : "Yaklaşan deplasman maçı yok."}</p>`}
  <div class="note">${team.bilet ? esc(team.bilet.yazi) + " " : ""}Uçak ve otel fiyatları ${esc(tarihUzun(team.guncellendi))} günü Google'dan alındı ve robot tarafından 2 günde bir yenilenir; yemek, ${T ? "havalimanı ulaşımı" : "araba"} ve gezi tahminidir. ${eurTry ? `TL tutarları 1 € = ${esc(String(eurTry).replace(".", ","))} TL kuruyla.` : ""} ${T ? "Geçen hafta sonu sayfadan kendiliğinden kalkar." : "Tren fiyatları ÖBB'nin bilet verisinden. Oynanan maç sayfadan kendiliğinden kalkar."} ${esc(team.bagimsiz || "")} Fotoğraflar: Unsplash ve Pexels (ücretsiz lisans).
  <br>Kaynaklar: ${(team.kaynaklar || []).map((k) => `<a href="${esc(k.url)}" rel="noopener">${esc(k.ad)}</a>`).join(" · ")}</div>
</main>
` + foot();
}

/** Eski adres (/deplasman/<slug>/) için yönlendirme sayfası. */
export function renderRedirect(team, SITE) {
  const to = `/sehir/${team.slug}/`;
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${team.takim} · 72h Getaway</title><link rel="canonical" href="${SITE}${to}"><meta http-equiv="refresh" content="0; url=${to}"><meta name="robots" content="noindex"></head><body><script>location.replace(${JSON.stringify(to)} + location.hash)</script><a href="${to}">${team.takim} deplasman bütçesi</a></body></html>\n`;
}
/** /sehir/ listesindeki kart. */
export function teamCard(team, today, { esc, para, eurTry }) {
  const l = upcoming(team, today), m = l[0];
  const T = tema(team);
  const body = m ? `<div class="muted">sıradaki ${esc(aralikTr(m.gidis, m.donus))} · ${esc(m.sehir)} · 2 kişi otel + uçak</div><div class="card-p"><b>~${para(ucakOtel(m), eurTry)}</b></div>` : `<div class="muted">${T ? "Yaklaşan hafta sonu yok" : "Yaklaşan deplasman yok"}</div>`;
  return `<li><a href="/sehir/${esc(team.slug)}/"><b>${esc(team.takim)}</b> <span class="muted">${esc(team.etiket || "Deplasman")}</span>${body}</a></li>`;
}
