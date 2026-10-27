// Uygulamanın (index.html) bütçe formülünün birebir kopyası. Videoda söylenen rakam, izleyici
// uygulamayı varsayılan ayarlarla açtığında gördüğü rakamla aynı olsun diye robotlar bunu kullanır.
// index.html'deki cost() fonksiyonu değişirse burası da değişmeli (test bunu yakalar).
import { readFile } from "node:fs/promises";

export const DEFAULTS = { nights: 3, ppl: 2, visits: 1, act: true, hIdx: 1, rIdx: 1 };
const r5 = (x) => Math.round(x / 5) * 5;
const HM = [0.7, 1, 1.5], RM = [0.3, 0.55, 1.3];

export function hotelP(c, i) { return c.hotels && c.hotels[i] ? c.hotels[i].p : r5(c.h * HM[i]); }
export function restoP(c, i) { return c.restos && c.restos[i] ? c.restos[i].p : Math.max(3, Math.round(c.f * RM[i])); }

export function cost(c, o = DEFAULTS) {
  const days = o.nights + 1, rooms = Math.ceil(o.ppl / 2), v = Math.min(o.visits, days);
  const hotel = hotelP(c, o.hIdx) * o.nights * rooms;
  const food = Math.max(0, c.f * o.ppl * days - v * c.f * 0.4 * o.ppl);
  const resto = v * restoP(c, o.rIdx) * o.ppl;
  const trans = c.t * o.ppl * days;
  const act = o.act ? c.a * o.ppl * o.nights : 0;
  return { hotel, food, resto, trans, act, sum: hotel + food + resto + trans + act };
}

// index.html'deki Budapeşte araştırma satırlarını (BUD_HOTELS, BUD_RESTOS) okur
export function parseResearched(html, varName) {
  const s = html.indexOf(`var ${varName} = [`); if (s < 0) return null;
  const body = html.slice(s, html.indexOf("];", s));
  const out = []; const re = /\{\s*t:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*p:\s*(\d+)/g; let m;
  while ((m = re.exec(body))) out.push({ t: m[1], name: m[2], p: +m[3], s: "res" });
  return out.length === 3 ? out : null;
}

// Şehirlere araştırılmış veriyi (Budapeşte + onaylı sehirler/*.json) uygular, uygulamanın yaptığı gibi
export async function withResearch(cities, { html, readJson }) {
  const idx = await readJson("sehirler/index.json", { sehirler: [] });
  const files = {};
  for (const e of idx.sehirler || []) files[e.name] = await readJson(e.file, null);
  return cities.map((c) => {
    const x = { ...c, s: "est" };
    if (c.name === "Budapeşte") { x.hotels = parseResearched(html, "BUD_HOTELS"); x.restos = parseResearched(html, "BUD_RESTOS"); x.s = "res"; }
    const f = files[c.name];
    if (f) {
      if (f.hotels && f.hotels.every(Boolean)) x.hotels = f.hotels;
      else if (f.hotels) x.hotels = [0, 1, 2].map((i) => f.hotels[i] || { p: r5(c.h * HM[i]) });
      if (f.restos && f.restos.every(Boolean)) x.restos = f.restos;
      else if (f.restos) x.restos = [0, 1, 2].map((i) => f.restos[i] || { p: Math.max(3, Math.round(c.f * RM[i])) });
      if (f.params) for (const k of ["f", "t", "a"]) if (Number.isFinite(f.params[k])) x[k] = f.params[k];
      x.s = "res"; x.researched = f.researched;
    }
    return x;
  });
}

export async function readJsonFile(f, d) { try { return JSON.parse(await readFile(f, "utf8")); } catch { return d; } }
