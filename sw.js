// 72h Getaway servis çalışanı.
// - Veri (data/*.json, data.json, prices.json...): önce internet, yoksa son kaydedilen sürüm.
// - Sayfalar (HTML): önce internet (içerik sık değişiyor), yoksa kayıtlı sürüm.
// - Diğer dosyalar (ikon, manifest...): önce önbellek, arkada tazele (stale-while-revalidate).
// Önbellek anahtarı adresin sorgu kısmı (?t=..., ?sehir=...) atılmış hâlidir: her yol için tek kayıt,
// böylece ?t= zaman damgalı veri istekleri önbelleği sınırsız büyütmez.
const CACHE = "72h-v2";
const SHELL = ["/", "/oteller.html", "/hakkinda.html", "/404.html", "/manifest.webmanifest", "/favicon.ico", "/img/icon-192.png", "/img/icon-512.png"];

function key(input) {
  const u = new URL(typeof input === "string" ? input : input.url, location.href);
  u.search = ""; u.hash = "";
  return u.href;
}
function isData(u) { return /\.json$/i.test(u.pathname); }
function isPage(req, u) { return req.mode === "navigate" || /\.html$/i.test(u.pathname) || u.pathname.endsWith("/"); }

async function store(req, res) {
  // Yönlendirilmiş ya da başarısız yanıtlar saklanmaz (yönlendirilmiş yanıt sayfa açılışında kullanılamaz)
  if (!res || !res.ok || res.redirected || res.type !== "basic") return;
  try { const c = await caches.open(CACHE); await c.put(key(req), res); } catch (e) { /* kota dolu vb. */ }
}
async function fromCache(req) {
  const c = await caches.open(CACHE);
  return c.match(key(req));
}

async function networkFirst(req, page) {
  try {
    const res = await fetch(req);
    store(req, res.clone());
    return res;
  } catch (e) {
    const hit = await fromCache(req);
    if (hit) return hit;
    if (page) return (await fromCache("/")) || (await fromCache("/404.html")) || Response.error();
    return Response.error();
  }
}
async function staleWhileRevalidate(req, e) {
  const hit = await fromCache(req);
  const net = fetch(req).then((res) => { store(req, res.clone()); return res; }).catch(() => null);
  if (hit) { e.waitUntil(net); return hit; }
  return (await net) || Response.error();
}

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((p) =>
    fetch(p, { cache: "reload" }).then((r) => { if (r.ok && !r.redirected) return c.put(key(p), r); }).catch(() => {})
  ))));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin !== location.origin) return;
  if (isData(u)) e.respondWith(networkFirst(req, false));
  else if (isPage(req, u)) e.respondWith(networkFirst(req, true));
  else e.respondWith(staleWhileRevalidate(req, e));
});
