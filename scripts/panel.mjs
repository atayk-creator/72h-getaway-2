// Yönetici paneli (iş emri: yonetim/is-emri-yonetici-paneli.md): Claude'daki panelin (yonetim/panel-kaynak/panel-claude.html)
// hesapları ve görünümü, gömülü veriyle çalışan tek HTML'e çevrildi. Hesaplar kaynakla aynıdır (slot durumu, kural kontrolü,
// özet sayılar, günlük etkileşim, en iyi içerikler, takipçi özeti); d3 yerine SVG elle üretilir.
// Bu dosyanın ürettiği düz HTML yalnızca bellekte durur; scripts/panel-uret.mjs onu şifreleyip panel/index.html'e yazar.
const IST = 3 * 3600e3;
const HEDEF = 1000; // Atay'ın takipçi hedefi
export const SLOT = {
  haftaici: [["07:45", "Video"], ["12:30", "Post"], ["18:15", "Video"], ["20:00", "Post"], ["21:30", "Video"]],
  haftasonu: [["10:30", "Video"], ["13:30", "Post"], ["17:00", "Video"], ["19:30", "Post"], ["21:30", "Video"]],
};
const AG = { instagram: "IG", tiktok: "TT", facebook: "FB", youtube: "YT" };
const AGAD = { instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", youtube: "YouTube" };
const AGLAR = ["instagram", "tiktok", "facebook", "youtube"];
const RENK = ["#F4A62A", "#0F2A43", "#2E7D5B", "#C4374D"];
const gunStr = (now, ofs) => new Date(now + IST + ofs * 864e5).toISOString().slice(0, 10);
const P = (v) => { if (typeof v === "string" && /^[\[{]/.test(v)) { try { return JSON.parse(v); } catch { return v; } } return v; };
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

/** Önümüzdeki 7 günün her yayın slotu: programda ne var, kim yapıyor, Metricool'da kurulu mu, kurallara uyuyor mu. */
export function slotlar(yayinlar, program, now = Date.now()) {
  const posts = (yayinlar || []).map((r) => {
    const pd = P(r.publicationDate) || {}, ig = P(r.instagramData) || {}, fb = P(r.facebookData) || {}, pr = P(r.providers) || [];
    const dt = String(pd.dateTime || "");
    const nets = (Array.isArray(pr) ? pr : []).map((p) => p.network);
    const story = (ig.type === "STORY" && nets.includes("instagram")) || (fb.type === "STORY" && nets.includes("facebook"));
    return { gun: dt.slice(0, 10), saat: dt.slice(11, 16), text: String(r.text || ""), fc: String(r.firstCommentText || ""), draft: r.draft === true || r.draft === "true", nets, story };
  });
  const nowSaat = new Date(now + IST).toISOString().slice(11, 16);
  const gunAdi = new Intl.DateTimeFormat("tr-TR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const out = [];
  for (let gi = 0; gi < 7; gi++) {
    const g = gunStr(now, gi), dow = new Date(g + "T12:00:00Z").getUTCDay();
    const slots = dow === 0 || dow === 6 ? SLOT.haftasonu : SLOT.haftaici;
    const day = posts.filter((p) => p.gun === g && !p.draft);
    slots.forEach(([saat, tur], si) => {
      const hit = day.filter((p) => p.saat === saat && !p.story);
      const [h, m] = saat.split(":").map(Number);
      const t5 = String(h).padStart(2, "0") + ":" + String(m + 5).padStart(2, "0");
      const hik = day.some((p) => p.story && p.saat === t5);
      const nets = [...new Set(hit.flatMap((p) => p.nets))];
      const ilkP = hit.find((p) => p.nets.includes("instagram")) || hit[0];
      const sorunlar = [];
      if (hit.some((p) => EMOJI.test(p.text) || EMOJI.test(p.fc))) sorunlar.push("emoji var");
      if (hit.some((p) => /\bucuz/i.test(p.text) || /\bucuz/i.test(p.fc))) sorunlar.push('"ucuz" geçiyor');
      const perNet = {}; hit.forEach((p) => p.nets.forEach((n) => { perNet[n] = (perNet[n] || 0) + 1; }));
      if (Object.values(perNet).some((n) => n > 1)) sorunlar.push("aynı ağa iki gönderi");
      if (hit.length && !hik) sorunlar.push("hikâye yok");
      const gecti = gi === 0 && saat < nowSaat;
      const pl = (program || []).find((p) => p.gun === g && Number(p.sira) === si);
      const planli = pl ? pl.planli === true || pl.planli === "true" : null;
      const plan = pl && planli ? pl.kod + " " + pl.icerik : "";
      const metin = ilkP ? ilkP.text.split("\n")[0].slice(0, 70) : "";
      out.push({
        anahtar: g + "-" + saat, gun: g, gunAd: gi === 0 ? "Bugün" : gi === 1 ? "Yarın" : gunAdi.format(new Date(g + "T12:00:00Z")), sira: si, saat, tur,
        icerik: metin, plan, kim: pl && planli ? pl.kim : "", gosterilen: metin || plan, aglar: nets.map((n) => AG[n] || n).join(" · "),
        durum: hit.length ? "Kurulu" : gecti ? "Geçti" : planli === false ? "Plan yok" : "Boş", sorun: sorunlar.join(", "),
      });
    });
  }
  return out;
}
export function ozet(s, notlar, now = Date.now()) {
  const bugun = gunStr(now, 0), yarin = gunStr(now, 1), b = s.filter((r) => r.gun === bugun), y = s.filter((r) => r.gun === yarin), n = notlar || [];
  return {
    bugunKurulu: b.filter((r) => r.durum !== "Boş" && r.durum !== "Plan yok").length, bugunToplam: b.filter((r) => r.durum !== "Plan yok").length,
    yarinKurulu: y.filter((r) => r.durum === "Kurulu").length, yarinToplam: y.filter((r) => r.durum !== "Plan yok").length, yarinBos: y.filter((r) => r.durum === "Boş").length,
    sorun: s.filter((r) => r.sorun).length, karar: n.filter((x) => x.tip === "karar" && x.durum !== "tamam").length, is: n.filter((x) => x.tip === "is" && x.durum !== "tamam").length,
  };
}
export function gunluk(etkilesim, now = Date.now()) {
  const out = [];
  for (let i = 13; i >= 0; i--) {
    const gun = gunStr(now, -i), row = { gun, instagram: 0, tiktok: 0, facebook: 0, youtube: 0, toplam: 0, gosterim: 0 };
    (etkilesim || []).forEach((r) => { if (r.gun === gun && AGLAR.includes(r.ag)) { row[r.ag] += r.etkilesim; row.toplam += r.etkilesim; row.gosterim += r.gosterim; } });
    out.push(row);
  }
  return out;
}
export const etkozet = (g) => { const best = g.reduce((a, b) => (b.toplam > (a ? a.toplam : -1) ? b : a), null); return { etkilesim: g.reduce((a, r) => a + r.toplam, 0), gosterim: g.reduce((a, r) => a + r.gosterim, 0), enIyiGun: best && best.toplam > 0 ? best.gun : "" }; };
export const eniyi = (etkilesim) => (etkilesim || []).filter((r) => r.link && r.bicim !== "STORY").slice().sort((a, b) => b.etkilesim - a.etkilesim).slice(0, 8);
export function takipozet(takipci) {
  const t = takipci || [], son = (f) => { for (let i = t.length - 1; i >= 0; i--) if (t[i][f] != null) return t[i][f]; return null; };
  return { ig: son("igTakipci"), tt: son("ttTakipci"), ig7: t.slice(-7).reduce((a, r) => a + (r.igKazanilan || 0), 0) };
}

// ---------- görünüm ----------
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (n) => (n == null || n === "" ? "—" : new Intl.NumberFormat("tr-TR").format(n));
const kisaGun = (s) => (s ? new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(s + "T12:00:00Z")) : "—");
const fmtGun = (s) => new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(s + "T12:00:00Z"));
const chip = (t, k) => `<span class="chip ${k || ""}">${esc(t)}</span>`;
const durumKind = (d) => (d === "Kurulu" ? "ok" : d === "Boş" ? "bad" : "mute");
const durumTd = (r) => `<td>${chip(r.durum, durumKind(r.durum))}${r.sorun ? " " + chip(r.sorun, "warn") : ""}</td>`;
const bosSatir = (cols, t) => `<tr><td class="mute" colspan="${cols}">${esc(t)}</td></tr>`;
const notSatir = (n) => `<li><div class="t"><b>${esc(n.baslik)}</b><span class="mute">${esc(n.son || "")}</span></div>${n.detay ? `<span class="d">${esc(n.detay)}</span>` : ""}</li>`;
const bosLi = (t) => `<li><span class="mute">${esc(t)}</span></li>`;
const durumChip = (d) => chip(d || "—", d === "tamam" ? "ok" : d === "açık" || d === "bekliyor" ? "warn" : "mute");
const kisaPlan = (r) => (r.plan ? r.plan.replace(/^[VP]-\d+ /, "") : "");
const adim = (max, n) => { const ham = (max || 1) / n, us = 10 ** Math.floor(Math.log10(ham)), k = [1, 2, 5, 10].find((x) => x * us >= ham) * us; return { k, ust: Math.ceil((max || 1) / k) * k }; };

function grafikEtkilesim(data) {
  const W = 440, H = 250, m = { t: 22, r: 6, b: 26, l: 38 }, n = data.length, bant = (W - m.l - m.r) / n, bw = bant * 0.75;
  const { k, ust } = adim(Math.max(...data.map((d) => d.toplam)), 4), y = (v) => H - m.b - (v / ust) * (H - m.t - m.b);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Son 14 günde günlük etkileşim, ağlara göre yığılmış çubuk grafik">`;
  for (let v = 0; v <= ust; v += k) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${m.l - 6}" y="${y(v)}" dy="0.32em" text-anchor="end">${nf(v)}</text>`;
  data.forEach((d, i) => {
    const x = m.l + i * bant + (bant - bw) / 2; let alt = 0;
    AGLAR.forEach((a, ai) => { if (d[a] > 0) { s += `<rect x="${x.toFixed(1)}" width="${bw.toFixed(1)}" y="${y(alt + d[a]).toFixed(1)}" height="${Math.max(0, y(alt) - y(alt + d[a])).toFixed(1)}" fill="${RENK[ai]}"/>`; alt += d[a]; } });
    if (d.toplam > 0) s += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y(d.toplam) - 5).toFixed(1)}" text-anchor="middle" class="koyu">${nf(d.toplam)}</text>`;
    if ((n - 1 - i) % 3 === 0) s += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(kisaGun(d.gun))}</text>`;
    s += `<rect x="${(m.l + i * bant).toFixed(1)}" width="${bant.toFixed(1)}" y="${m.t}" height="${H - m.t - m.b}" fill="transparent" tabindex="0" data-tip="${esc(JSON.stringify([kisaGun(d.gun) + " · " + nf(d.toplam) + " etkileşim", ...AGLAR.map((a) => [AGAD[a], nf(d[a])]), ["Gösterim", nf(d.gosterim)]]))}"/>`;
  });
  return s + "</svg>";
}
function grafikTakipci(tum) {
  const data = tum.filter((d) => d.igTakipci != null);
  if (!data.length) return '<p class="mute">Bu dönem için takipçi verisi yok.</p>';
  const W = 440, H = 190, m = { t: 20, r: 44, b: 24, l: 38 }, n = data.length, x = (i) => (n === 1 ? (m.l + W - m.r) / 2 : m.l + (i * (W - m.l - m.r)) / (n - 1));
  const { k, ust } = adim(Math.max(...data.map((d) => d.igTakipci)), 3), y = (v) => H - m.b - (v / ust) * (H - m.t - m.b);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Instagram takipçi sayısının günlere göre çizgi grafiği">`;
  for (let v = 0; v <= ust; v += k) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${m.l - 6}" y="${y(v)}" dy="0.32em" text-anchor="end">${nf(v)}</text>`;
  s += `<path d="${data.map((d, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(d.igTakipci).toFixed(1)).join(" ")}" fill="none" stroke="${RENK[0]}" stroke-width="2.5"/>`;
  const her = Math.ceil(n / 5);
  data.forEach((d, i) => {
    s += `<circle cx="${x(i).toFixed(1)}" cy="${y(d.igTakipci).toFixed(1)}" r="3.5" fill="${RENK[0]}"/>`;
    if ((n - 1 - i) % her === 0) s += `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(kisaGun(d.gun))}</text>`;
    const w = n === 1 ? 60 : (W - m.l - m.r) / (n - 1);
    s += `<rect x="${(x(i) - w / 2).toFixed(1)}" width="${Math.max(8, w).toFixed(1)}" y="${m.t}" height="${H - m.t - m.b}" fill="transparent" tabindex="0" data-tip="${esc(JSON.stringify([kisaGun(d.gun), ["Takipçi", nf(d.igTakipci)], ["O gün kazanılan", nf(d.igKazanilan)], ["Görüntülenme", nf(d.igGoruntulenme)]]))}"/>`;
  });
  const son = data[n - 1];
  return s + `<text x="${(x(n - 1) + 8).toFixed(1)}" y="${y(son.igTakipci).toFixed(1)}" dy="0.32em" class="koyu">${nf(son.igTakipci)}</text></svg>`;
}

/**
 * Düz panel HTML'i. girdi: { yayinlar, etkilesim, takipci, notlar, program, hatalar: { metricool?: string[], notlar?: string }, now }
 * yayinlar/etkilesim/takipci null ise o bölüm "yüklenemedi" gösterir (kırmızı hata yok, sayfa yine açılır).
 */
export function panelHtml(g) {
  const now = g.now || Date.now(), bugun = gunStr(now, 0), yarin = gunStr(now, 1), H = g.hatalar || {};
  const notlarVar = Array.isArray(g.notlar), N = notlarVar ? g.notlar : [];
  const S = Array.isArray(g.yayinlar) ? slotlar(g.yayinlar, g.program || [], now) : null;
  const O = ozet(S || [], N, now), G = Array.isArray(g.etkilesim) ? gunluk(g.etkilesim, now) : null, EO = G ? etkozet(G) : null, EI = Array.isArray(g.etkilesim) ? eniyi(g.etkilesim) : null;
  const TK = Array.isArray(g.takipci) ? g.takipci : null, TO = TK ? takipozet(TK) : { ig: null, tt: null, ig7: null };
  const sv = (v) => (S ? String(v) : "—"), nt = (v) => (notlarVar ? String(v) : "—");
  const notTip = (tip) => N.filter((r) => r.tip === tip && r.durum !== "tamam");
  const oto = [];
  if (S) S.forEach((r) => {
    if (r.gun > yarin) return;
    if (r.durum === "Boş") oto.push({ baslik: `${r.gunAd} ${r.saat} ${r.tur.toLowerCase()} slotu boş`, son: "Metricool", detay: (r.plan ? `Programda: ${r.plan}${r.kim ? ` (${r.kim})` : ""}. ` : "Programda içerik yok. ") + "Teslim gelince ofis kurar." });
    if (r.sorun) oto.push({ baslik: `${r.gunAd} ${r.saat}: ${r.sorun}`, son: "Metricool", detay: r.icerik });
  });
  const sira = [], sorunlu = oto.filter((o) => !/slotu boş$/.test(o.baslik)), bos = oto.filter((o) => /slotu boş$/.test(o.baslik)), kar = notTip("karar");
  sorunlu.forEach((o) => sira.push({ baslik: "Kural sorunu: " + o.baslik, son: "Ofis düzeltsin", detay: o.detay }));
  if (bos.length) sira.push({ baslik: `${bos.length} slot boş (bugün ve yarın)`, son: "Ofis kursun", detay: bos.map((b) => b.baslik.replace(" slotu boş", "")).join(" · ") });
  kar.slice(0, 3).forEach((k) => sira.push({ baslik: "Karar: " + k.baslik, son: k.son, detay: k.detay }));
  if (kar.length > 3) sira.push({ baslik: `ve ${kar.length - 3} karar daha`, son: "Kararlar sekmesi", detay: "" });
  const metYok = "Metricool yüklenemedi", notYok = "Kurul notları henüz yüklenmedi";
  const gunTablo = (gun) => (S ? S.filter((r) => r.gun === gun).map((r) => `<tr><td>${r.saat}</td><td class="mute">${r.tur}</td><td${r.icerik ? "" : ' class="mute"'}>${esc(r.gosterilen || "—")}</td><td class="mute">${esc(r.kim || "—")}</td>${durumTd(r)}</tr>`).join("") : bosSatir(5, metYok));
  const hafta = S ? [...new Set(S.map((r) => r.gun))].map((gg) => { const rows = S.filter((r) => r.gun === gg).sort((a, b) => a.sira - b.sira); return `<tr><td>${esc(rows[0].gunAd)}</td>${rows.map((r) => `<td>${chip(r.saat + " " + r.durum, r.sorun ? "warn" : durumKind(r.durum))}${kisaPlan(r) ? `<div class="plan">${esc(kisaPlan(r))}</div>${r.kim ? `<div class="plan mute">${esc(r.kim)}</div>` : ""}` : ""}</td>`).join("")}</tr>`; }).join("") : bosSatir(6, metYok);
  const uyarilar = oto.concat(notTip("uyari"));
  const sorunSatiri = [...(H.metricool && H.metricool.length ? [`Metricool'dan alınamayan bölümler: ${H.metricool.join(", ")}.`] : []), ...(H.notlar ? [H.notlar] : [])];
  const uretim = new Date(now).toISOString();
  const saatYazi = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" }).format(new Date(now));
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>72h Panel</title>
<meta name="theme-color" content="#0F2A43">
<link rel="manifest" href="/panel/manifest.webmanifest">
<link rel="apple-touch-icon" href="/img/icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="72h Panel">
<link rel="stylesheet" href="/fonts/fonts.css">
<style>
:root{--bg:#FBF6EC;--panel:#fff;--ink:#0F2A43;--muted:#5B6B7C;--line:#E3DCCB;--ok:#1F5E43;--warn:#8A5A00;--bad:#A3263A;--accent:#F4A62A}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Figtree,Arial,sans-serif;font-size:15px;line-height:1.45;font-variant-numeric:tabular-nums}
h1,h2,p{margin:0}.kap{max-width:980px;margin:0 auto;padding:0 14px 40px;display:flex;flex-direction:column;gap:16px}
.ust{background:#0F2A43;color:#FBF6EC;padding:calc(12px + env(safe-area-inset-top,0px)) 14px 14px}
.ust .ic{max-width:980px;margin:0 auto;display:flex;flex-direction:column;gap:8px}
.ust-s{display:flex;justify-content:space-between;align-items:center;gap:10px}
.logo{display:flex;font-family:Archivo,Arial,sans-serif;font-weight:800;font-size:15px}.logo .a{background:#F4A62A;color:#0F2A43;padding:4px 8px;border-radius:6px 0 0 6px}.logo .b{background:#FBF6EC;color:#0F2A43;padding:4px 9px 4px 7px;border-radius:0 6px 6px 0;border-left:2px dashed #0F2A43}
.cikis{height:44px;padding:0 14px;border-radius:99px;border:1px solid #2F506D;background:transparent;color:#FBF6EC;font:700 14px Figtree,Arial,sans-serif;cursor:pointer}
h1{font-family:Archivo,Arial,sans-serif;font-weight:800;font-size:24px}
.lead{color:#A9B8C7;font-size:14px}.lead b{color:#FBF6EC}
.veri{font-family:"IBM Plex Mono",monospace;font-size:11px;color:#A9B8C7}
.eski{background:#FCE9C4;color:#6B4A00;border-radius:10px;padding:10px 12px;font-weight:700;font-size:14px}
.tabs{display:flex;gap:6px;overflow-x:auto;position:sticky;top:0;z-index:3;background:var(--bg);padding:10px 14px;margin:0 -14px;scrollbar-width:none}.tabs::-webkit-scrollbar{display:none}
.tab{flex:none;min-height:44px;padding:0 16px;border-radius:99px;border:1px solid var(--line);background:var(--panel);color:var(--ink);font:700 14px Figtree,Arial,sans-serif;cursor:pointer}
.tab[aria-selected="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.page{display:flex;flex-direction:column;gap:16px}.page[hidden]{display:none}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.tile,.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:4px;min-width:0}
.card{gap:12px}.tile span,.tile small,small{font-size:12px;color:var(--muted)}
.tile b,.figs b{font-family:Archivo,Arial,sans-serif;font-weight:800;font-size:26px;line-height:1.1}
.head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap}h2{font-size:17px;font-family:Archivo,Arial,sans-serif}
.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:12px;color:var(--muted);padding:6px 8px 6px 0;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:9px 8px 9px 0;border-bottom:1px solid var(--line);vertical-align:top}tr:last-child td{border-bottom:0}
.chip{display:inline-block;font-size:12px;font-weight:700;padding:1px 8px;border-radius:99px;border:1px solid var(--line);white-space:nowrap}
.ok{color:var(--ok);border-color:var(--ok)}.warn{color:var(--warn);border-color:var(--warn)}.bad{color:var(--bad);border-color:var(--bad)}.mute{color:var(--muted)}
.list{list-style:none;margin:0;padding:0}.list li{padding:10px 0;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:2px}.list li:last-child{border-bottom:0}
.list .t{display:flex;justify-content:space-between;gap:10px;align-items:baseline}.list .d{font-size:13px;color:var(--muted)}
.links{display:flex;flex-wrap:wrap;gap:8px}.links a{min-height:44px;display:inline-flex;align-items:center;padding:0 14px;border:1px solid var(--line);border-radius:10px;color:var(--ink);text-decoration:none;background:var(--bg);font-weight:700}
.chart{position:relative}.chart svg{display:block;width:100%;height:auto}.chart text{font-size:11px;fill:var(--muted)}.chart text.koyu{fill:var(--ink);font-weight:700}.chart .grid{stroke:var(--line)}
.tip{position:absolute;top:4px;pointer-events:none;background:#fff;border:1px solid var(--line);box-shadow:0 6px 18px rgba(15,42,67,.18);border-radius:10px;padding:8px 10px;font-size:12px;min-width:160px;z-index:2}
.tip b{display:block;margin-bottom:4px}.tip div{display:flex;justify-content:space-between;gap:12px;color:var(--muted)}
.leg{display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:var(--muted)}.leg span{display:inline-flex;align-items:center;gap:6px}.leg i{width:10px;height:10px;border-radius:2px}
.figs{display:flex;flex-wrap:wrap;gap:18px}.figs div{display:flex;flex-direction:column}.figs span{font-size:12px;color:var(--muted)}
.bar{height:10px;border-radius:99px;background:var(--line);overflow:hidden}.bar i{display:block;height:100%;border-radius:99px;background:var(--ok)}
.who{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.who div{border:1px solid var(--line);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:2px}.who span{font-size:13px;color:var(--muted)}
.week td,.week th{text-align:center}.week td:first-child,.week th:first-child{text-align:left;white-space:nowrap}.week td{min-width:112px}.plan{font-size:12px;line-height:1.3;margin-top:3px}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
</style>
</head>
<body>
<header class="ust"><div class="ic">
  <div class="ust-s"><span class="logo"><span class="a">72h</span><span class="b">panel</span></span><button class="cikis" id="cikis" type="button">Çıkış</button></div>
  <h1>72h Yönetici Ekranı</h1>
  <p class="lead">Bugün <b>${sv(O.bugunKurulu)}</b> / <b>${sv(O.bugunToplam)}</b> paylaşım yerinde, yarın <b>${sv(O.yarinKurulu)}</b> / <b>${sv(O.yarinToplam)}</b> kurulu. <b>${sv(O.sorun)}</b> gönderide kural sorunu, senden beklenen <b>${nt(O.karar)}</b> karar var.</p>
  <span class="veri" id="veri" data-t="${uretim}">Veri: ${esc(saatYazi)}</span>
</div></header>
<div class="kap">
  <nav class="tabs" aria-label="Bölümler">
    ${[["ozet-s", "Özet"], ["yayin-s", "Yayın"], ["sosyal-s", "Sosyal medya"], ["karar-s", "Kararlar"], ["ekip-s", "Ekip"], ["site-s", "Site ve uygulama"]].map(([id, ad], i) => `<button class="tab" data-tab="${id}" aria-selected="${i === 0}">${ad}</button>`).join("")}
  </nav>
  <p class="eski" id="eski" hidden>Veri eski: son yenileme 3 saatten önce. Saatlik iş akışı durmuş olabilir.</p>
  ${sorunSatiri.length ? `<p class="eski">${esc(sorunSatiri.join(" "))}</p>` : ""}

  <section class="page" id="ozet-s">
    <div class="card"><div class="head"><h2>Şimdi sırada ne var?</h2><small>Önem sırasına göre</small></div>
      <ul class="list">${sira.length ? sira.map(notSatir).join("") : bosLi(S || notlarVar ? "Her şey yolunda: bekleyen iş yok." : "Veri yüklenemedi.")}</ul></div>
    <div class="tiles">
      <div class="tile"><span>Instagram takipçi</span><b>${nf(TO.ig)}</b><small>son 7 günde +${nf(TO.ig7)}</small></div>
      <div class="tile"><span>TikTok takipçi</span><b>${nf(TO.tt)}</b></div>
      <div class="tile"><span>Etkileşim, son 14 gün</span><b>${EO ? nf(EO.etkilesim) : "—"}</b></div>
      <div class="tile"><span>Yarın boş slot</span><b>${sv(O.yarinBos)}</b></div>
      <div class="tile"><span>Senden beklenen karar</span><b>${nt(O.karar)}</b></div>
      <div class="tile"><span>Ekipte süren iş</span><b>${nt(O.is)}</b></div>
    </div>
    <div class="card"><div class="head"><h2>Hedef: Instagram'da ${nf(HEDEF)} takipçi</h2><small>${TO.ig == null ? "—" : TO.ig >= HEDEF ? `Hedef aşıldı: ${nf(TO.ig)} takipçi` : `${nf(TO.ig)} / ${nf(HEDEF)} · %${Math.round((TO.ig / HEDEF) * 100)}`}</small></div>
      <div class="bar" aria-hidden="true"><i style="width:${TO.ig == null ? 0 : Math.min(100, (TO.ig / HEDEF) * 100)}%"></i></div></div>
    <div class="two">
      ${[["Bugün", bugun], ["Yarın", yarin]].map(([ad, gg]) => `<div class="card"><div class="head"><h2>${ad}</h2><small>${esc(fmtGun(gg))}</small></div><div class="scroll"><table><thead><tr><th>Saat</th><th>Tür</th><th>İçerik</th><th>Kim</th><th>Durum</th></tr></thead><tbody>${gunTablo(gg)}</tbody></table></div></div>`).join("")}
    </div>
  </section>

  <section class="page" id="yayin-s" hidden>
    <div class="card"><div class="head"><h2>7 günlük yayın programı</h2><small>Program: kurulun yayın programı. Durum: Metricool. KOPYA taslakları sayılmaz.</small></div>
      <div class="scroll"><table class="week"><thead><tr><th>Gün</th><th>Sabah video</th><th>Öğle post</th><th>Akşam video</th><th>Akşam post</th><th>21:30 video</th></tr></thead><tbody>${hafta}</tbody></table></div>
      <small>Hafta içi 07:45 · 12:30 · 18:15 · 20:00 · 21:30. Hafta sonu 10:30 · 13:30 · 17:00 · 19:30 · 21:30. Hikâye, gönderiden 5 dakika sonra beklenir.</small></div>
    <div class="card"><div class="head"><h2>Bütün slotlar, ayrıntılı</h2><small>Programdaki içerik, yapan kişi, Metricool'daki karşılığı ve kural kontrolü</small></div>
      <div class="scroll"><table><thead><tr><th>Gün</th><th>Saat</th><th>Tür</th><th>Programda</th><th>Kim</th><th>Metricool'da kurulu</th><th>Nerede</th><th>Durum</th></tr></thead><tbody>${S ? S.map((r) => `<tr><td>${esc(r.gunAd)}</td><td>${r.saat}</td><td class="mute">${r.tur}</td><td>${esc(r.plan || "—")}</td><td class="mute">${esc(r.kim || "—")}</td><td>${esc(r.icerik || "—")}</td><td class="mute">${esc(r.aglar || "—")}</td>${durumTd(r)}</tr>`).join("") : bosSatir(8, metYok)}</tbody></table></div></div>
  </section>

  <section class="page" id="sosyal-s" hidden>
    <div class="card"><div class="head"><h2>Etkileşim</h2><small>Son 14 gün · paylaşıldığı güne göre</small></div>
      <div class="figs"><div><span>Toplam etkileşim</span><b>${EO ? nf(EO.etkilesim) : "—"}</b></div><div><span>Toplam gösterim</span><b>${EO ? nf(EO.gosterim) : "—"}</b></div><div><span>En çok etkileşim alan gün</span><b>${EO ? esc(kisaGun(EO.enIyiGun)) : "—"}</b></div></div>
      <div class="leg" aria-hidden="true">${AGLAR.map((a, i) => `<span><i style="background:${RENK[i]}"></i>${AGAD[a]}</span>`).join("")}</div>
      <div class="chart">${G ? grafikEtkilesim(G) : '<p class="mute">Etkileşim verisi yüklenemedi</p>'}</div>
      <small>Etkileşim: beğeni, yorum, kaydetme ve paylaşımların toplamı (Metricool tanımı). Her çubuk, o gün paylaşılan içeriklerin bugüne kadar topladığı etkileşimdir.</small></div>
    <div class="card"><div class="head"><h2>Instagram takipçi sayısı</h2><small>Son 14 gün, gün sonu değeri</small></div><div class="chart">${TK ? grafikTakipci(TK) : '<p class="mute">Takipçi verisi yüklenemedi</p>'}</div></div>
    <div class="card"><div class="head"><h2>En çok etkileşim alan 8 içerik</h2><small>Son 14 gün</small></div>
      <div class="scroll"><table><thead><tr><th>Ağ</th><th>Tarih</th><th>Tür</th><th>Gösterim</th><th>Etkileşim</th><th>İçerik</th></tr></thead><tbody>${EI ? (EI.length ? EI.map((r) => `<tr><td>${esc(AGAD[r.ag] || r.ag)}</td><td class="mute">${esc(kisaGun(r.gun))}</td><td class="mute">${esc(String(r.bicim).toLowerCase())}</td><td>${nf(r.gosterim)}</td><td>${nf(r.etkilesim)}</td><td>${/^https:\/\//.test(r.link) ? `<a href="${esc(r.link)}" target="_blank" rel="noopener noreferrer">Aç</a>` : "—"}</td></tr>`).join("") : bosSatir(6, "Bu dönemde içerik yok.")) : bosSatir(6, "Yüklenemedi")}</tbody></table></div></div>
  </section>

  <section class="page" id="karar-s" hidden>
    <div class="two">
      <div class="card"><div class="head"><h2>Senden beklenen kararlar</h2><small>Yönetim kurulu notları</small></div><ul class="list">${notlarVar ? (kar.length ? kar.map(notSatir).join("") : bosLi("Bekleyen karar yok.")) : bosLi(notYok)}</ul>
        <small>Bir kararı verdiğinde sohbette yazman yeter; kurul listeden düşürür ve ilgili ekibe iletir.</small></div>
      <div class="card"><div class="head"><h2>Uyarılar</h2><small>Otomatik kontrol + kurul notları</small></div><ul class="list">${uyarilar.length ? uyarilar.map(notSatir).join("") : bosLi("Uyarı yok.")}</ul></div>
    </div>
  </section>

  <section class="page" id="ekip-s" hidden>
    <div class="card"><div class="head"><h2>Ekip işleri</h2><small>Kim, ne, ne zamana</small></div>
      <div class="scroll"><table><thead><tr><th>Kim</th><th>İş</th><th>Son saat</th><th>Durum</th></tr></thead><tbody>${notlarVar ? N.filter((r) => r.tip === "is").map((r) => `<tr><td>${esc(r.kim)}</td><td>${esc(r.baslik)}</td><td class="mute">${esc(r.son)}</td><td>${durumChip(r.durum)}</td></tr>`).join("") || bosSatir(4, "Kayıtlı iş yok.") : bosSatir(4, notYok)}</tbody></table></div></div>
    <div class="card"><div class="head"><h2>Hangi iş kime yazılır?</h2><small>Her biri ayrı bir sohbet</small></div>
      <div class="who">${[["Yönetim kurulu", "Strateji, kontrol, rapor, iş emirleri. Metricool'a gönderi kurmaz."], ["Sosyal medya ofisi", "Metricool'a kuran tek ekip. Teslim dosyası, yayın programı."], ["Ecem", "Videolar: şehir, Noel, deplasman. Fiyat kontrolü yayından önce."], ["Alper", "Videolar: Ecem'le paylaşır. Görsel işleri."], ["Küçük Alper", "Postlar ve karuseller."], ["Topluluk masası", "Yorum ve mesaj cevapları."], ["IT", "Site, robotlar, uygulama, PDF rehber."]].map(([a, b]) => `<div><b>${a}</b><span>${b}</span></div>`).join("")}</div></div>
  </section>

  <section class="page" id="site-s" hidden>
    <div class="card"><div class="head"><h2>Site ve uygulama işleri</h2><small>Teslimler ve açıklar</small></div>
      <div class="scroll"><table><thead><tr><th>İş</th><th>Tarih</th><th>Durum</th></tr></thead><tbody>${notlarVar ? N.filter((r) => r.tip === "it").map((r) => `<tr><td>${esc(r.baslik)}</td><td class="mute">${esc(r.son)}</td><td>${durumChip(r.durum)}</td></tr>`).join("") || bosSatir(3, "Kayıtlı iş yok.") : bosSatir(3, notYok)}</tbody></table></div></div>
    <div class="card"><h2>Kısayollar</h2><div class="links">${[["https://72hgetaway.com", "Site"], ["https://72hgetaway.com/deplasman/", "Deplasman sayfaları"], ["https://72hgetaway.com/deplasman/fenerbahce-londra/", "Fenerbahçe Londra"], ["https://app.metricool.com", "Metricool"], ["https://www.instagram.com/72hgetaway/", "Instagram"], ["https://www.tiktok.com/@72hgetaway", "TikTok"], ["https://www.facebook.com/72hgetaway", "Facebook"], ["https://claude.ai/artifact/McsNnCq1vLVTjEB9uKqjbx", "Tasarım tuvali"], ["https://github.com/atayk-creator/72h-getaway-2/blob/main/yonetim/is-emri-site-tasarimi.md", "Site tasarımı iş emri"], ["https://github.com/atayk-creator/72h-getaway-2/blob/main/yonetim/is-emri-sehir-sayfasi-teslim.md", "IT teslim notları"]].map(([u, a]) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${a}</a>`).join("")}</div></div>
  </section>
</div>
<script>
(function () {
  var tabs = document.querySelectorAll(".tab");
  function ac(id) { for (var i = 0; i < tabs.length; i++) { var on = tabs[i].dataset.tab === id; tabs[i].setAttribute("aria-selected", on ? "true" : "false"); var s = document.getElementById(tabs[i].dataset.tab); if (s) s.hidden = !on; } try { history.replaceState(null, "", "#" + id); } catch (e) {} }
  for (var i = 0; i < tabs.length; i++) tabs[i].addEventListener("click", function () { ac(this.dataset.tab); });
  var ilk = (location.hash || "").slice(1); if (ilk && document.getElementById(ilk)) ac(ilk);
  document.getElementById("cikis").addEventListener("click", function () { if (window.PANEL_CIKIS) window.PANEL_CIKIS(); });
  var t = new Date(document.getElementById("veri").getAttribute("data-t")).getTime();
  function eskiMi() { document.getElementById("eski").hidden = Date.now() - t < 3 * 3600e3; }
  eskiMi();
  /* Panel açılınca ve öne gelince yenilenir (saatte bir yeni veri yayınlanır) */
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { eskiMi(); if (Date.now() - yuklenme > 10 * 60e3) location.reload(); } });
  var yuklenme = Date.now();
  var acik = null;
  function tipGoster(r) {
    var box = r.closest(".chart"), d = JSON.parse(r.getAttribute("data-tip"));
    if (acik) acik.remove();
    acik = document.createElement("div"); acik.className = "tip";
    var b = document.createElement("b"); b.textContent = d[0]; acik.appendChild(b);
    for (var i = 1; i < d.length; i++) { var row = document.createElement("div"), a = document.createElement("span"), c = document.createElement("span"); a.textContent = d[i][0]; c.textContent = d[i][1]; row.appendChild(a); row.appendChild(c); acik.appendChild(row); }
    box.appendChild(acik);
    var bb = box.getBoundingClientRect(), rb = r.getBoundingClientRect(), cx = rb.left + rb.width / 2 - bb.left;
    acik.style.left = Math.min(Math.max(0, cx - 85), Math.max(0, bb.width - 180)) + "px";
  }
  ["pointerenter", "click", "focus"].forEach(function (ev) { document.addEventListener(ev, function (e) { var r = e.target && e.target.closest ? e.target.closest("[data-tip]") : null; if (r) tipGoster(r); else if (ev === "click" && acik) { acik.remove(); acik = null; } }, true); });
})();
</script>
</body>
</html>
`;
}
