// Yönetici paneli için Metricool verisi (REST). Anahtar yalnızca ortam değişkenlerinden okunur: METRICOOL_TOKEN, METRICOOL_USER_ID
// (isteğe bağlı METRICOOL_BLOG_ID). Çekilen veri diske yazılmaz, loga basılmaz; yalnızca bellekte panel-uret.mjs'e döner.
// Bir sorgu başarısız olursa o bölüm null döner ve adı "hatalar" listesine girer (panel "Metricool yüklenemedi" gösterir).
// PANEL_TANILAMA=1 ile her sorgunun durumu, satır sayısı ve yalnızca alan ADLARI loga yazılır (değerler asla).
const BASE = "https://app.metricool.com/api";
const IST = 3 * 3600e3, TZ = "Europe/Istanbul";
const gunStr = (now, ofs) => new Date(now + IST + ofs * 864e5).toISOString().slice(0, 10);
const sayi = (r, adlar) => { for (const a of adlar) { const v = a.split(".").reduce((o, k) => (o == null ? o : o[k]), r); if (v != null && v !== "" && !Number.isNaN(Number(v))) return Number(v); } return null; };
const yazi = (r, adlar) => { for (const a of adlar) { const v = a.split(".").reduce((o, k) => (o == null ? o : o[k]), r); if (typeof v === "string" && v) return v; } return ""; };

/** Analitik satırını panelin beklediği biçime çevirir. Alan adları ağa göre değiştiği için birkaç olası ad denenir. */
export function etkilesimSatiri(ag, r, varsayilanBicim) {
  const t = yazi(r, ["publishedAt.dateTime", "created.dateTime", "publishDate.dateTime", "publishedAt", "createTime", "created", "publishDate", "date", "timestamp"]);
  const gun = /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : /^\d{8}/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : "";
  const parca = ["likes", "comments", "shares", "saved"].map((k) => sayi(r, { likes: ["likes", "likeCount", "reactions"], comments: ["comments", "commentCount"], shares: ["shares", "shareCount"], saved: ["saved", "saves", "favorites"] }[k]) || 0);
  const etk = sayi(r, ["interactions", "totalInteractions"]);
  return {
    ag, gun, link: yazi(r, ["url", "link", "permalink", "shareUrl", "watchUrl", "videoUrl"]),
    gosterim: sayi(r, ["impressionsTotal", "impressions", "views", "viewCount", "videoViews", "videoViewsTotal", "plays", "reach"]) || 0,
    etkilesim: etk != null ? etk : parca.reduce((a, b) => a + b, 0), bicim: yazi(r, ["type", "mediaType", "productType"]).toUpperCase() || varsayilanBicim,
  };
}
/** Zaman serisi yanıtından { "YYYY-MM-DD": değer } (gün sonu değeri). */
export function seriGunleri(data) {
  const d = Array.isArray(data) ? data : [], degerler = (d[0] && Array.isArray(d[0].values) ? d[0].values : d).filter((x) => x && typeof x === "object");
  const out = {};
  for (const v of degerler) { const t = String(v.dateTime || v.date || v.day || ""), g = /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : /^\d{8}/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : ""; const n = Number(v.value ?? v.count); if (g && !Number.isNaN(n)) out[g] = n; }
  return out;
}

export async function metricoolVerisi({ token, userId, blogId, now = Date.now(), fetchFn = fetch, tanilama = false }) {
  const hatalar = [], log = (...a) => { if (tanilama) console.log("[tanılama]", ...a); };
  const al = async (yol, q = {}) => {
    const u = new URL(BASE + yol);
    for (const [k, v] of Object.entries({ ...q, userId, integrationSource: "MCP" })) if (v != null) u.searchParams.set(k, v);
    const r = await fetchFn(u, { headers: { "X-Mc-Auth": token, Accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json(), d = j && j.data !== undefined ? j.data : j;
    log(yol, "tamam", Array.isArray(d) ? `${d.length} satır` : typeof d, Array.isArray(d) && d[0] && typeof d[0] === "object" ? "alanlar: " + Object.keys(d[0]).sort().join(",") : "");
    return d;
  };
  const dene = async (ad, fn) => { try { return await fn(); } catch (e) { hatalar.push(ad); log(ad, "BAŞARISIZ", String(e.message).slice(0, 60)); return null; } };

  if (!blogId) {
    const m = await dene("marka listesi", () => al("/v2/settings/brands"));
    const liste = Array.isArray(m) ? m : [];
    const sec = liste.find((b) => /72h/i.test(JSON.stringify([b.label, b.title, b.instagram, b.tiktok, b.url]))) || liste[0];
    blogId = sec && (sec.id ?? sec.blogId);
    if (!blogId) return { yayinlar: null, etkilesim: null, takipci: null, hatalar: ["Metricool hesabı (marka bulunamadı ya da API erişimi yok)"] };
  }
  const bas = gunStr(now, 0), bit = gunStr(now, 6), e0 = gunStr(now, -13);
  const yayinlar = await dene("yayın takvimi", async () => { const d = await al("/v2/scheduler/posts", { blogId, start: `${bas}T00:00:00`, end: `${bit}T23:59:59`, timezone: TZ, extendedRange: "false" }); if (!Array.isArray(d)) throw new Error("beklenmeyen yanıt"); return d; });

  const uclar = [["instagram", "/v2/analytics/posts/instagram", "POST"], ["instagram", "/v2/analytics/reels/instagram", "REEL"], ["tiktok", "/v2/analytics/posts/tiktok", "VIDEO"], ["facebook", "/v2/analytics/posts/facebook", "POST"], ["facebook", "/v2/analytics/reels/facebook", "REEL"], ["youtube", "/v2/analytics/posts/youtube", "VIDEO"]];
  let etkilesim = [], basarili = 0;
  for (const [ag, yol, bicim] of uclar) {
    const d = await dene(`etkileşim (${ag} ${bicim.toLowerCase()})`, async () => { const x = await al(yol, { blogId, from: `${e0}T00:00:00`, to: `${bas}T23:59:59`, timezone: TZ }); if (!Array.isArray(x)) throw new Error("beklenmeyen yanıt"); return x; });
    if (d) { basarili++; etkilesim.push(...d.map((r) => etkilesimSatiri(ag, r, bicim)).filter((r) => r.gun)); }
  }
  if (!basarili) etkilesim = null;

  const seri = async (ag, adaylar) => { for (const metric of adaylar) { try { const g = seriGunleri(await al("/v2/analytics/timelines", { blogId, from: `${e0}T00:00:00`, to: `${bas}T23:59:59`, metric, network: ag, subject: "account", timezone: TZ })); if (Object.keys(g).length) return g; } catch (e) { log(`timelines ${ag}/${metric}`, "BAŞARISIZ", String(e.message).slice(0, 60)); } } return null; };
  const ig = await seri("instagram", ["followers", "followers_count"]), tt = await seri("tiktok", ["followers_count", "followers"]), gor = await seri("instagram", ["views", "impressions", "reach"]);
  if (!ig) hatalar.push("Instagram takipçi serisi");
  if (!tt) hatalar.push("TikTok takipçi serisi");
  let takipci = null;
  if (ig || tt) {
    takipci = [];
    for (let i = 13; i >= 0; i--) {
      const g = gunStr(now, -i), once = gunStr(now, -i - 1);
      takipci.push({ gun: g, igTakipci: ig && ig[g] != null ? ig[g] : null, igKazanilan: ig && ig[g] != null && ig[once] != null ? ig[g] - ig[once] : null, ttTakipci: tt && tt[g] != null ? tt[g] : null, igGoruntulenme: gor && gor[g] != null ? gor[g] : null });
    }
  }
  return { yayinlar, etkilesim, takipci, hatalar };
}
