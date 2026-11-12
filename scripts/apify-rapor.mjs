// Apify aylık harcama raporu: sınır, bu dönemin harcaması, en çok harcayan robot.
// Apify çalıştırmaları (actor-runs) zamanına göre GitHub iş akışı çalıştırmalarıyla eşleştirilir: bir Apify çalıştırması
// hangi robotun çalışma penceresi içinde başladıysa o robota yazılır. Çıktı: data/apify-rapor.json + yonetim/apify-rapor.md
// Gerekenler: APIFY_TOKEN (Secrets), GITHUB_TOKEN ve GITHUB_REPOSITORY (iş akışı verir). Node 22, bağımlılık yok.
import { writeFile, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const API = "https://api.apify.com/v2";
const token = process.env.APIFY_TOKEN, gh = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY || "atayk-creator/72h-getaway-2";
const r2 = (n) => Math.round(n * 100) / 100;
const gizle = (s) => String(s).split(token || "§").join("***");

async function apify(path) {
  const r = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Apify ${path.split("?")[0]}: ${r.status}`);
  return (await r.json()).data;
}
async function github(path) {
  const r = await fetch(`https://api.github.com/repos/${repo}${path}`, { headers: { Authorization: `Bearer ${gh}`, Accept: "application/vnd.github+json" } });
  if (!r.ok) throw new Error(`GitHub ${path.split("?")[0]}: ${r.status}`);
  return r.json();
}

async function main() {
  if (!token) throw new Error("APIFY_TOKEN yok");
  const lim = await apify("/users/me/limits");
  console.log(`::notice::Apify: ${lim.current && lim.current.monthlyUsageUsd} / ${lim.limits && lim.limits.maxMonthlyUsageUsd} $`);
  const cyc = lim.monthlyUsageCycle || {}, bas = cyc.startAt, son = cyc.endAt;
  const harcanan = lim.current && lim.current.monthlyUsageUsd, sinir = lim.limits && lim.limits.maxMonthlyUsageUsd;

  // Bu dönemin Apify çalıştırmaları (yeniden eskiye)
  const runs = [];
  try {
  for (let off = 0; off < 20000; off += 1000) {
    const d = await apify(`/actor-runs?desc=1&limit=1000&offset=${off}`);
    const items = d.items || [];
    runs.push(...items.filter((x) => !bas || x.startedAt >= bas));
    if (items.length < 1000 || (bas && items.length && items[items.length - 1].startedAt < bas)) break;
  }
  } catch (e) { console.log(`::warning::Apify çalıştırma listesi okunamadı: ${gizle(e.message)}`); }
  const aktorAd = {};
  for (const id of new Set(runs.map((x) => x.actId))) {
    try { const a = await apify(`/acts/${id}`); aktorAd[id] = `${a.username}~${a.name}`; } catch { aktorAd[id] = id; }
  }

  // GitHub iş akışı çalıştırmaları (aynı dönem): pencere = başlangıç → son güncelleme
  const wf = [];
  if (gh) try {
    const tarih = (bas || new Date(Date.now() - 31 * 864e5).toISOString()).slice(0, 10);
    for (let page = 1; page <= 30; page++) {
      const j = await github(`/actions/runs?per_page=100&page=${page}&created=${encodeURIComponent(">=" + tarih)}`);
      wf.push(...(j.workflow_runs || []).map((w) => ({ ad: w.name, bas: w.run_started_at || w.created_at, son: w.updated_at })));
      if (!j.workflow_runs || j.workflow_runs.length < 100) break;
    }
  } catch (e) { console.log(`::warning::GitHub çalıştırmaları okunamadı (robot eşleşmesi yapılamadı): ${gizle(e.message)}`); }
  const robotu = (t) => {
    const c = wf.filter((w) => w.bas <= t && t <= w.son).sort((a, b) => (Date.parse(a.son) - Date.parse(a.bas)) - (Date.parse(b.son) - Date.parse(b.bas)));
    return c.length ? c[0].ad : "Eşleşmedi (elle ya da başka yerden)";
  };

  const robot = {}, aktor = {};
  let calismaToplam = 0;
  for (const x of runs) {
    const usd = typeof x.usageTotalUsd === "number" ? x.usageTotalUsd : 0;
    calismaToplam += usd;
    const r = robotu(x.startedAt), a = aktorAd[x.actId];
    robot[r] = robot[r] || { usd: 0, calisma: 0, aktorler: {} };
    robot[r].usd += usd; robot[r].calisma++; robot[r].aktorler[a] = r2((robot[r].aktorler[a] || 0) + usd);
    aktor[a] = aktor[a] || { usd: 0, calisma: 0 };
    aktor[a].usd += usd; aktor[a].calisma++;
  }
  const robotlar = Object.entries(robot).map(([ad, v]) => ({ ad, usd: r2(v.usd), calisma: v.calisma, aktorler: v.aktorler })).sort((a, b) => b.usd - a.usd);
  const aktorler = Object.entries(aktor).map(([ad, v]) => ({ ad, usd: r2(v.usd), calisma: v.calisma })).sort((a, b) => b.usd - a.usd);
  const diger = typeof harcanan === "number" ? r2(Math.max(0, harcanan - calismaToplam)) : null;
  const rapor = {
    olusturuldu: new Date().toISOString(), donem: { baslangic: bas, bitis: son }, harcanan_usd: r2(harcanan), sinir_usd: sinir,
    kalan_usd: typeof harcanan === "number" && sinir ? r2(sinir - harcanan) : null, calismalar_usd: r2(calismaToplam), depolama_ve_diger_usd: diger,
    calisma_sayisi: runs.length, robotlar, aktorler,
  };
  await writeFile(root + "data/apify-rapor.json", JSON.stringify(rapor, null, 1) + "\n");

  const g = (s) => (s ? s.slice(0, 10) : "?");
  const md = `# Apify harcama raporu

Oluşturuldu: ${rapor.olusturuldu.slice(0, 16).replace("T", " ")} UTC · Dönem: ${g(bas)} → ${g(son)}

| | $ |
|---|---|
| Bu dönem harcanan | **${rapor.harcanan_usd}** |
| Aylık sınır | ${sinir ?? "?"} |
| Kalan | **${rapor.kalan_usd ?? "?"}** |
| Aktör çalıştırmaları | ${rapor.calismalar_usd} (${runs.length} çalıştırma) |
| Depolama ve diğer | ${diger ?? "?"} |

## Robotlara göre (en çok harcayan üstte)

| Robot | $ | Çalıştırma | Aktörler |
|---|---|---|---|
${robotlar.map((x) => `| ${x.ad} | ${x.usd} | ${x.calisma} | ${Object.entries(x.aktorler).map(([a, u]) => `${a} ${u}`).join(", ")} |`).join("\n")}

## Aktörlere göre

| Aktör | $ | Çalıştırma |
|---|---|---|
${aktorler.map((x) => `| ${x.ad} | ${x.usd} | ${x.calisma} |`).join("\n")}

Not: Robot eşleşmesi zamana göredir; Apify çalıştırması hangi GitHub robotunun çalışma penceresinde başladıysa ona yazılır.
`;
  await writeFile(root + "yonetim/apify-rapor.md", md);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md).catch(() => {});
  console.log(md);
}

main().catch((e) => { const m = gizle(e.message); console.error("HATA:", m); console.log(`::error::Apify raporu: ${m}`); process.exit(1); });
