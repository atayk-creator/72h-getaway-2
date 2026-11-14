/* Şehir ve deplasman plan sayfası: hazır paketler, kendin oluştur, arkadaşına gönder, PDF rehber.
   Veri sayfanın içindeki <script id="plan-veri"> bloğundan gelir (scripts/plan-sayfalari.mjs üretir). */
(function () {
  var el = document.getElementById("plan-veri");
  if (!el) return;
  var V = JSON.parse(el.textContent);
  var KUR = V.kur, K = V.kisi || 2, hi = 0, cur = "uygun", sel = null, selAd = "", dokundu = false;
  var $ = function (id) { return document.getElementById(id); };
  var PAKETLER = ["uygun", "konforlu", "luks"];
  var ARROW = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';
  var AY = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  var AYU = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

  function H() { return V.haftalar[hi]; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function tl(n) { return Math.round(n).toLocaleString("tr-TR") + " TL"; }
  function kisiTl(pp) { return pp * K * KUR; }
  function gunAy(iso, uzun) { var p = iso.split("-"); return +p[2] + " " + (uzun ? AYU : AY)[+p[1] - 1]; }
  function aralik(h) { var a = h.gidis.split("-"), b = h.donus.split("-"); return a[1] === b[1] ? +a[2] + "–" + +b[2] + " " + AYU[+b[1] - 1] : gunAy(h.gidis, 1) + " – " + gunAy(h.donus, 1); }
  function ekGun(iso, n) { var d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function find(a, id) { for (var i = 0; i < (a || []).length; i++) if (a[i].id === id) return a[i]; return null; }

  /* tarihli derin linkler */
  function gf(from, to) { var h = H(); return "https://www.google.com/travel/flights?hl=tr&curr=EUR&q=" + encodeURIComponent("Flights from " + from + " to " + to + " on " + h.gidis + " through " + h.donus); }
  function bk(q) { var h = H(); return "https://www.booking.com/searchresults.html?ss=" + encodeURIComponent(q) + "&checkin=" + h.gidis + "&checkout=" + h.donus + "&group_adults=" + K + "&no_rooms=1&group_children=0"; }
  function gh(q) { var h = H(); return "https://www.google.com/travel/hotels?hl=tr&curr=EUR&q=" + encodeURIComponent(q + " " + h.gidis + " " + h.donus); }
  function yemekLink() {
    var y = V.yemekLink || {}, h = H(), aksam = ekGun(h.gidis, h.gece > 1 ? 1 : 0);
    if (y.site) return "https://www." + y.site + "/s?dateTime=" + aksam + "T19%3A00&covers=" + K + "&term=" + encodeURIComponent(y.alan || V.sehir);
    return "https://www.google.com/maps/search/" + encodeURIComponent((y.alan || V.sehir) + " restoran");
  }
  function ucusLink(u) { return u.url || (u.q ? gf(u.q[0], u.q[1]) : gf(u.kalkis || "IST", u.ap || V.sehir)); }
  function chip(k) { return k === "live" ? '<span class="chip c-live">Canlı fiyat</span>' : k === "off" ? '<span class="chip c-off">Resmî fiyat</span>' : k === "free" ? '<span class="chip c-free">Ücretsiz</span>' : '<span class="chip c-est">Tahmini</span>'; }

  /* paket kurallarını o hafta sonunun fiyatlarına göre seçime çevir */
  function enUygun(a, f, alan) { var b = null; (a || []).forEach(function (x) { if (x[alan] != null && (!f || f(x)) && (!b || x[alan] < b[alan])) b = x; }); return b; }
  function secT(tercih, u) {
    var ap = u && u.ap, uy = (V.transfer || []).filter(function (t) { return !t.ap || !ap || t.ap === ap; });
    return find(uy, tercih) || uy[0] || null;
  }
/* Otel: pakette adı yazan otel (fiyatı varsa), yoksa kategorisinin en uygunu. Paketler fiyatça sıralı kalır:
     Uygun hiçbir zaman Konforlu'dan, Konforlu hiçbir zaman Lüks'ten pahalı otel seçmez. */
  function otelSec(ad) {
    var P = V.paket[ad], h = H(), kat = P.kat || ad, sabit = find(h.otel, P.otel);
    if (sabit && sabit.tot != null) return sabit;
    var taban = ad === "konforlu" ? otelSec("uygun") : ad === "luks" ? otelSec("konforlu") : null, min = taban && taban.tot != null ? taban.tot : 0;
    var o = enUygun(h.otel, function (x) { return x.kat === kat && x.tot >= min; }, "tot");
    if (ad === "uygun") { var en = enUygun(h.otel, null, "tot"); if (!o || (en && en.tot < o.tot)) o = en; }
    if (!o && ad === "luks") h.otel.forEach(function (x) { if (x.tot != null && x.tot >= min && (!o || x.tot > o.tot)) o = x; });
    return o || enUygun(h.otel, function (x) { return x.tot >= min; }, "tot") || taban || sabit || h.otel[0] || null;
  }
  function coz(ad) {
    var P = V.paket[ad], h = H();
    var u = (P.ucus === "tam" && enUygun(h.ucus, function (x) { return x.tam; }, "pp")) || enUygun(h.ucus, null, "pp") || h.ucus[0] || null;
    var o = otelSec(ad);
    var t = secT(P.transfer, u), g = {};
    (P.gezi || []).forEach(function (id) { if (find(V.gezi, id)) g[id] = 1; });
    return { u: u ? u.id : "", o: o ? o.id : "", t: t ? t.id : "", y: find(V.yemek, P.yemek) ? P.yemek : (V.yemek[0] || {}).id, g: g, bilet: V.bilet ? 1 : 0, sehir: V.sehirIci ? 1 : 0 };
  }

  /* bir seçimden kalem listesi üret */
  function lines(s) {
    var h = H(), u = find(h.ucus, s.u), o = find(h.otel, s.o), t = find(V.transfer, s.t), y = find(V.yemek, s.y), L = [];
    if (u) L.push({ g: "ucus", nm: "Uçuş · " + u.ad, dt: u.dt + (u.pp != null ? " · " + u.pp + " € × " + K : " · fiyat sitede, toplama eklenmedi"), k: u.pp != null ? u.k || "live" : "est", kay: u.kay || "Google Flights", tl: u.pp != null ? kisiTl(u.pp) : 0, yok: u.pp == null, url: ucusLink(u), btn: "Uçuşa bak", alt: u.hy, altAd: u.hyAd });
    if (o) L.push({ g: "otel", nm: "Otel · " + o.ad, dt: h.gece + " gece · çift kişilik oda" + (o.tot != null ? " · toplam " + Math.round(o.tot) + " €" : " · fiyat sitede, toplama eklenmedi"), k: o.tot != null ? "live" : "est", kay: o.kay || "Google Hotels", tl: o.tot != null ? o.tot * KUR : 0, yok: o.tot == null, url: bk(o.q), btn: "Oteli ayırt", alt: gh(o.q), altAd: "Google Hotels" });
    if (V.bilet && s.bilet) L.push({ g: "bilet", nm: V.bilet.ad, dt: V.bilet.pp + " € × " + K + " · " + V.bilet.dt, k: V.bilet.k || "est", kay: V.bilet.kay || "tahmin", tl: kisiTl(V.bilet.pp), url: V.bilet.url, btn: V.bilet.btn || "Kulüp sitesi" });
    var si = s.sehir && V.sehirIci ? V.sehirIci : null;
    if (t || si) {
      var ul = (t ? t.pp : 0) + (si ? si.pp : 0);
      L.push({ g: "ulasim", nm: "Ulaşım · " + (t ? t.ad + (si ? " + " + si.kisa : "") : si.ad), dt: (t ? t.dt : "") + (t && si ? " · " : "") + (si ? si.dt : ""), k: t ? t.k || "est" : si.k || "est", kay: (t ? t.k : si.k) === "off" ? "resmî site" : "tahmin", tl: kisiTl(ul), url: t ? t.url : si.url, btn: t ? "Bilet al" : "Bilgi", alt: t && si ? si.url : null, altAd: si ? si.kisa : "" });
    }
    if (y) L.push({ g: "yemek", nm: "Yemek · " + y.ad + " · " + V.gun + " gün", dt: y.dt + " · kişi başı " + y.pp + " €", k: "est", kay: "şehir ortalaması", tl: kisiTl(y.pp), url: yemekLink(), btn: "Masa ayırt" });
    var gz = (V.gezi || []).filter(function (g) { return s.g[g.id]; }), gp = 0, unp = [];
    gz.forEach(function (g) { if (g.pp) gp += g.pp; if (g.pp === null) unp.push(g.ad); });
    if (gz.length) L.push({ g: "gezi", nm: "Gezi · " + gz.map(function (g) { return g.ad; }).join(", "), dt: unp.length ? unp.join(", ") + ": fiyat sitede, toplama eklenmedi" : gp ? "giriş ücretleri" : "ücretsiz", k: gp ? "off" : unp.length ? "est" : "free", kay: "resmî site", tl: kisiTl(gp), url: gz[0].url, btn: "Biletler", multi: gz });
    return L;
  }
  var COL = { ucus: "#0F2A43", otel: "#F4A62A", bilet: "#C4374D", ulasim: "#2E7D5B", yemek: "#5B6B7C", gezi: "#9DB3C6" };
  var LBL = { ucus: "Uçuş", otel: "Otel", bilet: V.bilet && V.bilet.kisa || "Bilet", ulasim: "Ulaşım", yemek: "Yemek", gezi: "Gezi" };
  function sum(L) { return L.reduce(function (a, l) { return a + Math.round(l.tl); }, 0); }
  function eksik(L) { return L.filter(function (l) { return l.yok; }).map(function (l) { return LBL[l.g].toLowerCase(); }); }
  function ppYazi(L, T) { var e = eksik(L); return "kişi başı " + tl(T / K) + (e.length ? " · " + e.join(" ve ") + " hariç" : "") + (V.haric ? " · " + V.haric : ""); }
  function rota(s) { var u = find(H().ucus, s.u); return (u && u.kalkis ? u.kalkis + " → " + (u.ap || V.sehir.toUpperCase()) : "İSTANBUL → " + V.sehir.toLocaleUpperCase("tr")) + " · " + K + " KİŞİ · " + H().gece + " GECE"; }

  function renderHafta() {
    var w = $("weeks");
    if (!w || V.haftalar.length < 2) return;
    w.innerHTML = V.haftalar.map(function (h, i) { return '<button class="week" type="button" data-i="' + i + '" aria-pressed="' + (i === hi) + '">' + esc(h.etiket || aralik(h)) + (h.ek ? "<span>" + esc(h.ek) + "</span>" : "") + "</button>"; }).join("");
  }
  function renderPaket() {
    PAKETLER.forEach(function (p) {
      $("tab-" + p).setAttribute("aria-selected", p === cur ? "true" : "false");
      $("tp-" + p).textContent = tl(sum(lines(coz(p))));
    });
    var s = coz(cur), L = lines(s), T = sum(L);
    $("pk-route").textContent = rota(s);
    $("pk-total").textContent = tl(T);
    $("pk-pp").textContent = ppYazi(L, T);
    $("pk-split").innerHTML = L.map(function (l) { return '<span style="flex:' + Math.max(1, Math.round(l.tl)) + ";background:" + COL[l.g] + '"></span>'; }).join("");
    $("pk-legend").innerHTML = L.filter(function (l) { return l.tl > 0; }).map(function (l) { return '<span><i style="background:' + COL[l.g] + '"></i>' + LBL[l.g] + " %" + Math.round(l.tl / T * 100) + "</span>"; }).join("");
    $("pk-items").innerHTML = L.map(row).join("") + '<div class="tot"><div><div style="font-weight:700">TOPLAM · ' + K + " kişi, " + H().gece + " gece</div><span>" + ppYazi(L, T) + "</span></div><b>" + tl(T) + "</b></div>";
    $("pk-note").textContent = V.not || "";
  }
  function fiyatYazi(l) { return l.yok ? "Sitede" : l.k === "free" ? "Ücretsiz" : tl(l.tl); }
  function row(l) {
    var extra = l.multi && l.multi.length > 1 ? '<div class="src" style="margin-top:8px">' + l.multi.map(function (g) { return '<a class="go alt" target="_blank" rel="noopener" href="' + esc(g.url) + '">' + esc(g.ad) + " " + ARROW + "</a>"; }).join("") + "</div>" : "";
    return '<div class="it"><div><div class="nm">' + esc(l.nm) + '</div><div class="dt">' + esc(l.dt) + '</div><div class="src">' + chip(l.k) + "<span>" + esc(l.kay) + "</span>" + (l.alt ? '<a target="_blank" rel="noopener" href="' + esc(l.alt) + '" style="font-weight:700">' + esc(l.altAd || "Diğer site") + "</a>" : "") + "</div>" + extra + "</div>" +
      '<div class="rt"><span class="pr">' + fiyatYazi(l) + "</span>" + (l.multi && l.multi.length > 1 ? "" : '<a class="go" target="_blank" rel="noopener" href="' + esc(l.url) + '">' + l.btn + " " + ARROW + "</a>") + "</div></div>";
  }

  /* oluşturucu: her seçenek tek satır */
  function opt(type, name, id, checked, title, sub, price, priceSub, url) {
    return '<label class="opt"><input type="' + type + '" name="' + name + '" value="' + esc(id) + '"' + (checked ? " checked" : "") + '><span class="t"><b>' + esc(title) + "</b><span>" + esc(sub) + '</span></span><span class="p">' + price + (priceSub ? "<small>" + esc(priceSub) + "</small>" : "") + '</span><a target="_blank" rel="noopener" href="' + esc(url) + '" aria-label="' + esc(title) + ' sitesine git">' + ARROW + "</a></label>";
  }
  function renderBuilder() {
    var h = H(), u = find(h.ucus, sel.u) || h.ucus[0], ap = u && u.ap;
    if (u) sel.u = u.id;
    if (!find(h.otel, sel.o) && h.otel[0]) sel.o = h.otel[0].id;
    var tr = (V.transfer || []).filter(function (t) { return !t.ap || !ap || t.ap === ap; });
    if (tr.length && !find(tr, sel.t)) sel.t = tr[0].id;
    var s = "";
    if (h.ucus.length) s += '<div class="grp"><h3>Uçuş <span class="mono">' + K + " kişi · gidiş-dönüş</span></h3><p class=\"hint\">Ok, Google Flights'ta " + aralik(h) + " aramasını açar.</p><div class=\"opts\">" + h.ucus.map(function (x) { return opt("radio", "u", x.id, sel.u === x.id, x.ad, x.dt, x.pp != null ? tl(kisiTl(x.pp)) : "Sitede", x.pp != null ? x.pp + " € / kişi" : "toplama eklenmez", ucusLink(x)); }).join("") + "</div></div>";
    if (h.otel.length) s += '<div class="grp"><h3>Otel <span class="mono">' + h.gece + " gece · " + K + ' kişi</span></h3><p class="hint">Ok, o otelin ' + aralik(h) + ' arama sayfasını açar.</p><div class="opts">' + h.otel.map(function (o) { return opt("radio", "o", o.id, sel.o === o.id, o.ad, o.dt, o.tot != null ? tl(o.tot * KUR) : "Sitede", o.tot != null ? Math.round(o.tot) + " € toplam" : "toplama eklenmez", bk(o.q)); }).join("") + "</div></div>";
    if (tr.length) s += '<div class="grp"><h3>Havalimanından şehre <span class="mono">' + K + ' kişi · g-d</span></h3><div class="opts">' + tr.map(function (t) { return opt("radio", "t", t.id, sel.t === t.id, t.ad, t.dt, tl(kisiTl(t.pp)), t.k === "off" ? "resmî" : "tahmini", t.url); }).join("") + "</div></div>";
    if (V.bilet || V.sehirIci) s += '<div class="grp"><h3>' + (V.bilet ? esc(V.bilet.grup || "Bilet ve şehir içi") : "Şehir içi ulaşım") + '</h3><div class="opts">' +
      (V.bilet ? opt("checkbox", "bilet", "1", !!sel.bilet, V.bilet.ad, V.bilet.dt, tl(kisiTl(V.bilet.pp)), V.bilet.k === "off" ? "resmî" : "tahmini", V.bilet.url) : "") +
      (V.sehirIci ? opt("checkbox", "sehir", "1", !!sel.sehir, V.sehirIci.ad, V.sehirIci.dt, tl(kisiTl(V.sehirIci.pp)), V.sehirIci.k === "off" ? "resmî" : "tahmini", V.sehirIci.url) : "") + "</div></div>";
    if (V.yemek.length) s += '<div class="grp"><h3>Yemek <span class="mono">' + V.gun + " gün · " + K + ' kişi</span></h3><p class="hint">' + esc(V.yemekLink && V.yemekLink.site ? "Ok, OpenTable'da " + gunAy(ekGun(h.gidis, h.gece > 1 ? 1 : 0), 1) + " akşamı için " + K + " kişilik masa aramasını açar." : "Ok, haritada şehrin restoranlarını açar.") + '</p><div class="opts">' + V.yemek.map(function (y) { return opt("radio", "y", y.id, sel.y === y.id, y.ad, y.dt, tl(kisiTl(y.pp)), y.pp + " € / kişi", yemekLink()); }).join("") + "</div></div>";
    if (V.gezi.length) s += '<div class="grp"><h3>Gezi ve etkinlik <span class="mono">istediğin kadar seç</span></h3><div class="opts">' + V.gezi.map(function (g) { return opt("checkbox", "g", g.id, !!sel.g[g.id], g.ad, g.dt, g.pp === null ? "Sitede" : g.pp === 0 ? "Ücretsiz" : tl(kisiTl(g.pp)), g.pp === null ? "toplama eklenmez" : "", g.url); }).join("") + "</div></div>";
    $("builder").innerHTML = s;
    renderSum();
  }
  function renderSum() {
    var L = lines(sel), T = sum(L);
    $("st-total").textContent = tl(T);
    $("st-pp").textContent = ppYazi(L, T);
    $("st-label").textContent = selAd + " · " + K + " kişi" + (V.haftalar.length > 1 ? " · " + aralik(H()) : "");
    if (dokundu) try { history.replaceState(null, "", planLink(true)); } catch (e) {}
  }

  /* plan linkte yaşar: arkadaşına gönder */
  function planLink(goreli) {
    var q = "?p=" + cur + (V.haftalar.length > 1 ? "&h=" + H().id : "") + "&u=" + encodeURIComponent(sel.u) + "&o=" + encodeURIComponent(sel.o) + (sel.t ? "&t=" + sel.t : "") + "&y=" + sel.y + "&g=" + Object.keys(sel.g).join(",") + (V.bilet ? "&b=" + sel.bilet : "") + (V.sehirIci ? "&s=" + sel.sehir : "");
    return (goreli ? location.pathname : V.url) + q;
  }
  function linktenOku() {
    var Q;
    try { Q = new URLSearchParams(location.search); } catch (e) { return false; }
    if (Q.get("h")) V.haftalar.forEach(function (h, i) { if (h.id === Q.get("h")) hi = i; });
    if (PAKETLER.indexOf(Q.get("p")) > -1) cur = Q.get("p");
    sel = coz(cur);
    if (!Q.get("u") && !Q.get("o")) return false;
    var h = H(), degisen = [];
    if (find(h.ucus, Q.get("u"))) sel.u = Q.get("u"); else if (Q.get("u")) degisen.push("uçuş");
    if (find(h.otel, Q.get("o"))) sel.o = Q.get("o"); else if (Q.get("o")) degisen.push("otel");
    if (find(V.transfer, Q.get("t"))) sel.t = Q.get("t");
    if (find(V.yemek, Q.get("y"))) sel.y = Q.get("y");
    if (Q.get("g") != null) { sel.g = {}; Q.get("g").split(",").forEach(function (k) { if (find(V.gezi, k)) sel.g[k] = 1; }); }
    if (V.bilet) sel.bilet = Q.get("b") === "0" ? 0 : 1;
    if (V.sehirIci) sel.sehir = Q.get("s") === "0" ? 0 : 1;
    selAd = "Sana gönderilen plan";
    if (degisen.length) { var n = $("gelen-not"); if (n) { n.textContent = "Linkteki " + degisen.join(" ve ") + " seçeneği artık listede yok; en yakın seçenekle açtık."; n.hidden = false; } }
    return true;
  }

  /* PDF rehber: önizleme + baskı görünümü */
  function baskiDoldur(s, ad) {
    var L = lines(s), T = sum(L), h = H();
    var satir = L.map(function (l) {
      var linkler = l.multi && l.multi.length > 1 ? l.multi.map(function (g) { return '<a href="' + esc(g.url) + '">' + esc(g.ad) + " →</a>"; }).join(" &nbsp; ") : '<a href="' + esc(l.url) + '">' + l.btn + " →</a>" + (l.alt ? ' &nbsp; <a href="' + esc(l.alt) + '">' + esc(l.altAd || "Diğer site") + " →</a>" : "");
      return "<tr><td><b>" + esc(l.nm) + '</b><div class="dt">' + esc(l.dt) + " · " + esc(l.kay) + "</div>" + linkler + '</td><td class="r">' + fiyatYazi(l) + "</td></tr>";
    }).join("");
    var marka = '<div class="marka"><span>72h Getaway · ' + esc(V.ad) + "</span><span>" + esc(aralik(h)) + "</span></div>";
    var plan = (h.plan || V.plan || []).map(function (g) { return '<div class="gun"><h3>' + esc(g.gun) + "</h3>" + g.duraklar.map(function (d) { return "<div><b>" + esc(d[0]) + "</b><span>" + esc(d[1]) + (d[2] ? ' <span class="dt">· ' + esc(d[2]) + "</span>" : "") + "</span></div>"; }).join("") + "</div>"; }).join("");
    $("baski").innerHTML =
      '<div class="pg"><div class="kapak">' + (V.foto ? '<div class="kfoto" style="background-image:url(' + esc(V.foto) + ')"></div>' : "") + '<span class="mono">' + esc(V.ust) + " · " + esc(ad) + "</span><h1>" + esc(V.baslik) + "</h1><p>" + esc(aralik(h)) + " " + h.gidis.slice(0, 4) + " · " + K + " kişi · " + h.gece + " gece</p></div>" +
      '<div class="ticket"><div class="stub"><span>REHBER</span></div><div class="main"><div><div class="mono">' + esc(rota(s)) + '</div><div class="n">' + tl(T) + "</div></div><small>" + esc(ppYazi(L, T)) + "</small></div></div>" +
      (V.uyari ? '<p style="margin-top:14px"><b>' + esc(V.uyari.baslik) + "</b> " + esc(V.uyari.yazi) + (V.uyari.link ? ' <a href="' + esc(V.uyari.link) + '">' + esc(V.uyari.link.replace(/^https?:\/\/(www\.)?/, "")) + "</a>" : "") + "</p>" : "") +
      '<p class="alt">' + esc(V.fiyatNot) + " Bu rehber " + new Date().toLocaleDateString("tr-TR") + " tarihinde hazırlandı; fiyatlar değişmiş olabilir, güncel hali: " + esc(V.url) + "</p></div>" +
      '<div class="pg">' + marka + "<h2>Kalemler ve linkler</h2><table><tbody>" + satir + '<tr class="tt"><td>TOPLAM · ' + K + " kişi, " + h.gece + ' gece</td><td class="r">' + tl(T) + '</td></tr></tbody></table><p class="alt">Linkler tıklanabilir; her biri o kalemi alabileceğin siteyi bu tarihlerle açar. Rezervasyon yapmıyor, komisyon almıyoruz.</p></div>' +
      (plan ? '<div class="pg">' + marka + "<h2>72 saat planı</h2>" + plan + "</div>" : "") +
      '<div class="pg">' + marka + "<h2>Kontrol listesi</h2><ul>" + (V.kontrol || []).map(function (k) { return "<li>" + esc(k) + "</li>"; }).join("") + '</ul><p class="alt">' + esc(V.yasal) + "</p></div>";
    return { L: L, T: T };
  }
  function openSheet(s, ad, paket) {
    var hz = $("pdf-hazir");
    if (V.pdf && paket && hi < 2) { hz.href = V.pdf.replace("{paket}", paket).replace("{hafta}", V.haftalar.length > 1 ? "-" + H().id : ""); hz.hidden = false; } else hz.hidden = true;
    var r = baskiDoldur(s, ad), L = r.L, T = r.T;
    $("sh-ad").textContent = (V.ust + " · " + ad).toLocaleUpperCase("tr");
    $("sh-total").textContent = tl(T);
    $("sh-pp").textContent = ppYazi(L, T);
    $("sh-rows").innerHTML = L.map(function (l) { return "<tr><td><b>" + esc(l.nm) + '</b><br><span class="note">' + esc(l.dt) + '</span><br><a target="_blank" rel="noopener" href="' + esc(l.url) + '" style="font-weight:700;font-size:13px">' + l.btn + ' →</a></td><td class="r">' + fiyatYazi(l) + "</td></tr>"; }).join("") + '<tr><td><b>TOPLAM</b></td><td class="r"><b>' + tl(T) + "</b></td></tr>";
    $("sheet").hidden = false; $("sheet-x").focus();
  }
  function kapat() { $("sheet").hidden = true; }

  /* olaylar */
  $("builder").addEventListener("change", function (e) {
    var i = e.target; if (!i.name) return;
    dokundu = true;
    if (selAd.indexOf("Kendi") < 0 && selAd.indexOf("paketinden") < 0) selAd = "Kendi kaçamağın";
    if (i.name === "g") { if (i.checked) sel.g[i.value] = 1; else delete sel.g[i.value]; renderSum(); return; }
    if (i.name === "bilet" || i.name === "sehir") { sel[i.name] = i.checked ? 1 : 0; renderSum(); return; }
    sel[i.name] = i.value; if (i.name === "u") renderBuilder(); else renderSum();
  });
  $("builder").addEventListener("click", function (e) { if (e.target.closest("a")) e.stopPropagation(); });
  document.querySelector(".tabs").addEventListener("click", function (e) { var b = e.target.closest(".tab"); if (!b) return; cur = b.dataset.p; renderPaket(); });
  if ($("weeks")) $("weeks").addEventListener("click", function (e) {
    var b = e.target.closest(".week"); if (!b) return;
    dokundu = true; hi = +b.dataset.i; sel = coz(cur); selAd = V.paket[cur].ad + " paketinden";
    renderHafta(); renderPaket(); renderBuilder();
  });
  $("edit-pk").addEventListener("click", function () {
    dokundu = true; sel = coz(cur); selAd = V.paket[cur].ad + " paketinden"; renderBuilder();
    $("olustur").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
  $("pdf").addEventListener("click", function () { openSheet(sel, selAd); });
  $("pdf-pk").addEventListener("click", function () { openSheet(coz(cur), V.paket[cur].ad + " paket", cur); });
  $("sheet-x").addEventListener("click", kapat);
  $("sheet").addEventListener("click", function (e) { if (e.target.id === "sheet") kapat(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("sheet").hidden) kapat(); });
  $("pdf-yazdir").addEventListener("click", function () { window.print(); });
  $("copy").addEventListener("click", function () {
    var b = this, link = planLink(false), txt = V.sehir + " planımız: " + $("st-total").textContent + " (" + K + " kişi). Bak: ";
    function done(t) { b.textContent = t; setTimeout(function () { b.textContent = "Arkadaşına gönder"; }, 1800); }
    function copy() { try { navigator.clipboard.writeText(txt + link).then(function () { done("Link kopyalandı"); }, function () { done("Kopyalanamadı"); }); } catch (e) { done("Kopyalanamadı"); } }
    if (navigator.share) { navigator.share({ title: V.ad + " kaçamağı", text: txt, url: link }).then(function () { done("Gönderildi"); }, function (e) { if (!e || e.name !== "AbortError") copy(); }); return; }
    copy();
  });

  /* başlat */
  var gelen = linktenOku();
  if (!gelen) selAd = "Kendi kaçamağın";
  renderHafta(); renderPaket(); renderBuilder();
  var QS = ""; try { QS = new URLSearchParams(location.search).get("pdf") || ""; } catch (e) {}
  if (QS) { /* robot: ?pdf=uygun → yalnızca baskı görünümü */
    var hazir = PAKETLER.indexOf(QS) > -1;
    baskiDoldur(hazir ? coz(QS) : sel, hazir ? V.paket[QS].ad + " paket" : selAd);
    document.body.classList.add("baski-mod"); document.documentElement.setAttribute("data-pdf", "hazir");
  } else if (gelen) setTimeout(function () { $("olustur").scrollIntoView(); }, 300);
})();
