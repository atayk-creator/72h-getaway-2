// TEK SEFERLİK (sonra silinir): Linz deplasmanı "bir deplasman, iki şehir" yeniden planı.
// 1) ÖBB bilet sisteminden gerçek tren fiyatları (anonim oturum, tickets.oebb.at) — 2) Google otel fiyatları
// (Viyana 8–9 Ara, Linz 9–10 Ara) — 3) Unsplash fotoğrafları (Unsplash lisansı). Sonuç: data/tek-arama.json
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runActor, apifyUsage } from "./otel-fiyatlari.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const out = { tarih: new Date().toISOString(), tren: {}, log: [] };
const L = (...a) => { const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "); console.log(s); out.log.push(s.slice(0, 600)); };

// ---------- 1) ÖBB ----------
const B = "https://tickets.oebb.at/api/";
let H = { Channel: "inet", lang: "de", "Content-Type": "application/json", Accept: "application/json", "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" };
async function api(method, path, body, qs) {
  const u = B + path + (qs ? "?" + qs : "");
  const r = await fetch(u, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  if (!r.ok) L("HTTP", r.status, path, t.slice(0, 300));
  return j;
}
const pax = () => ({ type: "ADULT", id: Date.now(), me: false, remembered: false, challengedFlags: { hasHandicappedPass: false, hasAssistanceDog: false, hasWheelchair: false, hasAttendant: false },
  relations: [], cards: [], birthdateChangeable: true, birthdateDeletable: true, nameChangeable: true, passengerDeletable: true, isSelected: true });
async function station(name) {
  const j = await api("GET", "hafas/v1/stations", null, "count=5&name=" + encodeURIComponent(name));
  const s = Array.isArray(j) ? j[0] : null; L("istasyon", name, "→", s && { name: s.name, number: s.number }); return s;
}
async function trip(key, fromN, toN, dt) {
  try {
    const from = await station(fromN), to = await station(toN); if (!from || !to) return;
    const ta = await api("POST", "offer/v2/travelActions", { from, to, datetime: dt, customerVias: [], ignoreHistory: true, filter: { productTypes: [], history: true, maxEntries: 5, channel: "inet" } });
    const act = ta && (ta.travelActions || []).find((a) => a.entrypoint && a.entrypoint.id === "timetable") || (ta && ta.travelActions && ta.travelActions[0]);
    L("travelAction", key, act && act.id, ta && !act ? JSON.stringify(ta).slice(0, 300) : "");
    if (!act) return;
    const tt = await api("POST", "hafas/v4/timetable", { reverse: false, datetimeDeparture: dt, filter: { regionaltrains: false, direct: false, changeTime: false, wheelchair: false, bikes: false, trains: false, motorail: false, droppedConnections: false },
      passengers: [pax()], count: 6, debugFilter: { noAggregationFilter: false, noEqclassFilter: false, noNrtpathFilter: false, noPaymentFilter: false, useTripartFilter: false, noVbxFilter: false, noCategoriesFilter: false },
      sortType: "DEPARTURE", from, to, timeout: {}, travelActionId: act.id });
    const cons = (tt && tt.connections) || [];
    L("bağlantı", key, cons.length, tt && !cons.length ? JSON.stringify(tt).slice(0, 300) : "");
    if (!cons.length) return;
    const qs = cons.map((c) => "connectionIds[]=" + encodeURIComponent(c.id)).join("&") + "&sortType=DEPARTURE&bestPriceId=undefined";
    const pr = await api("GET", "offer/v1/prices", null, qs);
    const offers = (pr && pr.offers) || [];
    out.tren[key] = cons.map((c) => {
      const o = offers.find((x) => x.connectionId === c.id) || {};
      const secs = (c.sections || []).map((s) => (s.category && (s.category.displayName || s.category.shortName || s.category.name)) + " " + ((s.category && s.category.number) || "")).join(" + ");
      return { kalkis: c.from && c.from.departure, varis: c.to && c.to.arrival, sure: c.duration, aktarma: c.switches, trenler: secs, fiyat: o.price ?? null, birinciSinif: o.firstClass ?? null, ham: Object.keys(o).length ? undefined : null };
    });
    L("fiyat", key, out.tren[key].map((x) => `${(x.kalkis || "").slice(11, 16)} ${x.trenler} ${x.fiyat}`).join(" | "));
    if (!offers.length) L("fiyat yanıtı", JSON.stringify(pr).slice(0, 400));
  } catch (e) { L("tren hatası", key, e.message); }
}
try {
  const init = await api("GET", "domain/v4/init", null, "userId=anonym-" + Math.random().toString(36).slice(2) + "&cookie=" + Math.random().toString(36).slice(2) + "&lang=de");
  L("init anahtarları", init && Object.keys(init));
  if (init && init.accessToken) {
    H = { ...H, AccessToken: init.accessToken, SessionId: init.sessionId || "", "x-ts-supportid": "WEB_" + (init.supportId || "") };
    await trip("havalimani_viyana", "Flughafen Wien", "Wien Hbf", "2026-12-08T09:30:00.000");
    await trip("viyana_linz", "Wien Hbf", "Linz/Donau Hbf", "2026-12-09T09:00:00.000");
    await trip("linz_havalimani", "Linz/Donau Hbf", "Flughafen Wien", "2026-12-10T15:00:00.000");
  }
} catch (e) { L("ÖBB hatası", e.message); }

// ---------- 2) Oteller ----------
const token = process.env.APIFY_TOKEN;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (token) {
  const before = await apifyUsage({ token }).catch(() => null);
  const hotels = JSON.parse(await readFile(root + "data/hotels.json", "utf8"));
  const vie = hotels.sehirler.find((c) => c.sehir === "Viyana").oteller;
  const fb = JSON.parse(await readFile(root + "data/fenerbahce.json", "utf8"));
  const linz = fb.maclar.find((m) => m.id === "linz").oteller;
  const H2 = (names, g, c) => runActor({ hotels: names, checkInDate: g, checkOutDate: c, adults: 2, currency: "EUR", country: "tr", language: "en", maxConcurrency: 8 }, { token, sleep, maxPolls: 60 }).catch((e) => [{ hata: e.message }]);
  out.viyana = { oteller: vie.map((h) => ({ id: h.id, ad: h.ad, arama: h.arama, kategori: h.kategori })), satirlar: await H2(vie.map((h) => h.arama), "2026-12-08", "2026-12-09") };
  out.linz = await H2(linz.map((h) => h.arama), "2026-12-09", "2026-12-10");
  const after = await apifyUsage({ token }).catch(() => null);
  out.maliyet = before && after ? Math.round((after.usd - before.usd) * 100) / 100 : null;
}

// ---------- 3) Fotoğraflar (Unsplash lisansı) ----------
const PH = [["linz-1", "5MRhJCgU8H0"], ["linz-2", "pxhif_I7D8c"], ["londra-1", "QD9eNzX5sak"]];
await mkdir(root + "img/sehir", { recursive: true });
for (const [n, id] of PH) {
  try {
    execFileSync("curl", ["-sSL", "-m", "60", "-o", `/tmp/${n}.jpg`, `https://unsplash.com/photos/${id}/download?force=true&w=2000`]);
    execFileSync("convert", [`/tmp/${n}.jpg`, "-auto-orient", "-resize", "1600x1600>", "-strip", "-quality", "80", root + `img/sehir/${n}.jpg`]);
    execFileSync("convert", [`/tmp/${n}.jpg`, "-auto-orient", "-resize", "640x640>", "-strip", "-quality", "78", root + `img/sehir/${n}-640.jpg`]);
    L("foto", n, "tamam");
  } catch (e) { L("foto hatası", n, e.message); }
}
await writeFile(root + "data/tek-arama.json", JSON.stringify(out) + "\n");
