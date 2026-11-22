/* Ana sayfadaki uçuş haritası: seçili hafta sonunun fiyatlarıyla şehirler, uçuş yayları ve şehir durakları.
   Şehir fiyatları #ana-veri, noktalar #harita-veri bloğundan; duraklar yalnız istenince /sehirler/harita.json'dan gelir. */
(function () {
  var a = document.getElementById("ana-veri"), b = document.getElementById("harita-veri"), kutu = document.getElementById("hr-harita");
  if (!a || !b || !kutu) return;
  var V = JSON.parse(a.textContent), N = JSON.parse(b.textContent), $ = function (id) { return document.getElementById(id); };
  var S = V.sehirler.filter(function (s) { return N[s.slug]; }), hi = 0, sec = "", mod = "ag", gun = 0, durak = -1, D = null, hata = false;
  var R = Math.PI / 180, IST = [41.01, 28.95];
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function tl(n) { return Math.round(n).toLocaleString("tr-TR") + " TL"; }
  function sure(dk) { var s = Math.floor(dk / 60), d = dk % 60; return ((s ? s + " sa " : "") + (d ? d + " dk" : "")).trim(); }
  function merc(la) { return Math.log(Math.tan(Math.PI / 4 + la * R / 2)) / R; }
  function X(lon) { return (lon + 12) * 10; }
  function Y(la) { return (merc(62.3) - merc(la)) * 10; }
  function bul(slug) { for (var i = 0; i < S.length; i++) if (S[i].slug === slug) return S[i]; return null; }
  function km(p, q) { var x = Math.sin((q[0] - p[0]) * R / 2), y = Math.sin((q[1] - p[1]) * R / 2); return 12742 * Math.asin(Math.sqrt(x * x + Math.cos(p[0] * R) * Math.cos(q[0] * R) * y * y)); }
  function yay(p) { var x1 = X(IST[1]), y1 = Y(IST[0]), x2 = X(p[1]), y2 = Y(p[0]), d = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)); return "M" + x1.toFixed(1) + " " + y1.toFixed(1) + "Q" + ((x1 + x2) / 2).toFixed(1) + " " + ((y1 + y2) / 2 - d * 0.2).toFixed(1) + " " + x2.toFixed(1) + " " + y2.toFixed(1); }
  function pinler() { return S.map(function (s) { return { s: s, x: X(N[s.slug][1]), y: Y(N[s.slug][0]), t: s.t[hi] }; }); }

  function agCiz() {
    var w = kutu.clientWidth || 343, k = w / 440, P = pinler().sort(function (p, q) { return (p.t == null) - (q.t == null) || p.t - q.t; }), yer = [], h = "";
    $("hr-yay").setAttribute("d", P.filter(function (p) { return p.t != null; }).map(function (p) { return yay(N[p.s.slug]); }).join(""));
    $("hr-sec").setAttribute("d", N[sec] ? yay(N[sec]) : "");
    // etiketler: önce seçili şehir, sonra en uygundan başlayarak; birbirinin üstüne binen yazılmaz
    P.sort(function (p, q) { return (q.s.slug === sec) - (p.s.slug === sec); });
    function bos(e) { return e[0] >= 2 && e[1] >= 2 && e[2] <= w - 2 && e[3] <= w * 430 / 440 - 2 && !yer.some(function (o) { return e[0] < o[2] && e[2] > o[0] && e[1] < o[3] && e[3] > o[1]; }); }
    var ix = X(IST[1]) * k, iy = Y(IST[0]) * k;
    yer.push([ix - 62, iy + 5, ix + 24, iy + 27]);
    // etiketler başka şehrin noktasını kapatmasın
    var nokta = P.map(function (p) { var r = p.t == null ? 4 : 7; return { s: p.s.slug, e: [p.x * k - r, p.y * k - r, p.x * k + r, p.y * k + r] }; });
    function acik(e, slug) { return bos(e) && !nokta.some(function (o) { return o.s !== slug && e[0] < o.e[2] && e[2] > o.e[0] && e[1] < o.e[3] && e[3] > o.e[1]; }); }
    P.forEach(function (p) {
      var x = p.x * k, y = p.y * k, on = p.s.slug === sec, yaz = p.t == null ? (on ? "fiyat yok" : "") : tl(p.t).replace(" TL", ""), gen = Math.max(p.s.ad.length * 7.2, yaz.length * 7.2) + 14, et = "";
      if (yaz) [[x - gen / 2, y - 44], [x - gen / 2, y + 9], [x + 10, y - 18], [x - 10 - gen, y - 18], [x - gen + 6, y + 9], [x - 6, y + 9], [x - gen + 6, y - 44], [x - 6, y - 44]].some(function (c) {
        var e = [c[0], c[1], c[0] + gen, c[1] + 35];
        if (on) { e[0] = Math.min(Math.max(2, e[0]), w - gen - 2); e[2] = e[0] + gen; }
        if (!(on ? bos(e) : acik(e, p.s.slug))) return false;
        yer.push(e); et = '<span class="hr-et" style="left:' + (e[0] - x).toFixed(1) + "px;top:" + (e[1] - y).toFixed(1) + "px;width:" + gen.toFixed(0) + 'px"><b>' + esc(p.s.ad) + "</b><i>" + yaz + "</i></span>"; return true;
      });
      h += '<button type="button" class="hr-p' + (p.t == null ? " yok" : "") + (on ? " on" : "") + '" data-slug="' + esc(p.s.slug) + '" aria-pressed="' + on + '" aria-label="' + esc(p.s.ad + ", " + (p.t == null ? "fiyat henüz yok" : "2 kişi " + tl(p.t))) + '" style="left:' + (p.x / 4.4).toFixed(2) + "%;top:" + (p.y / 4.3).toFixed(2) + '%"><em></em>' + et + "</button>";
    });
    $("hr-pin").innerHTML = h + '<span class="hr-ist" style="left:' + (X(IST[1]) / 4.4).toFixed(2) + "%;top:" + (Y(IST[0]) / 4.3).toFixed(2) + '%"><em></em><b>İSTANBUL</b></span>';
    $("hr-olcek").textContent = "";
  }
  function sehirCiz() {
    var G = D && D[sec] || [], g = G[gun], h = "";
    $("hr-yuru").setAttribute("d", ""); $("hr-olcek").textContent = "";
    if (g) {
      var la = g.d.map(function (d) { return d[2]; }), lo = g.d.map(function (d) { return d[3]; }), c = Math.cos(la[0] * R);
      var a0 = Math.min.apply(null, la), a1 = Math.max.apply(null, la), o0 = Math.min.apply(null, lo), o1 = Math.max.apply(null, lo);
      var ol = Math.min(320 / Math.max((o1 - o0) * c, 0.004), 310 / Math.max(a1 - a0, 0.004));
      var P = g.d.map(function (d) { return [220 + (d[3] - (o0 + o1) / 2) * c * ol, 215 - (d[2] - (a0 + a1) / 2) * ol]; });
      $("hr-yuru").setAttribute("d", "M" + P.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("L"));
      h = P.map(function (p, i) { return '<button type="button" class="hr-n' + (i === durak ? " on" : "") + '" data-d="' + i + '" aria-pressed="' + (i === durak) + '" aria-label="' + (i + 1) + ". durak: " + esc(g.d[i][1]) + '" style="left:' + (p[0] / 4.4).toFixed(2) + "%;top:" + (p[1] / 4.3).toFixed(2) + '%"><span>' + (i + 1) + "</span></button>"; }).join("");
      var m = 88 / ol * 111320, w5 = (kutu.clientWidth || 343) / 5;
      $("hr-olcek").textContent = m >= 1000 ? "≈ " + (m / 1000).toFixed(1).replace(".", ",") + " km" : "≈ " + Math.round(m / 10) * 10 + " m"; $("hr-olcek").style.width = w5 + "px";
    }
    $("hr-pin").innerHTML = h;
  }
  function panelCiz() {
    var s = bul(sec), t, h;
    if (!s) { $("hr-panel").innerHTML = ""; return; }
    t = s.t[hi];
    h = '<div class="hr-bas"><div><b>' + esc(s.ad) + "</b><span>" + esc(s.ulke) + (s.dk ? " · " + sure(s.dk) + " uçuş" : "") + '</span></div><div class="hr-fy"><b>' + (t == null ? "Fiyat henüz yok" : tl(t)) + "</b><span>" + (t == null ? "robot kontrol ediyor" : "2 kişi uçak + otel · kişi başı " + tl(t / 2)) + "</span></div></div>";
    if (mod === "sehir") {
      var G = D && D[sec], g = G && G[gun];
      if (hata) h += '<p class="hr-not">Duraklar yüklenemedi. Biraz sonra yeniden dene.</p>';
      else if (!D) h += '<p class="hr-not">Duraklar yükleniyor.</p>';
      else if (!G || !G.length) h += '<p class="hr-not">Bu şehrin durakları henüz hazır değil.</p>';
      else {
        h += '<div class="hr-gun" role="group" aria-label="Gün">' + G.map(function (x, i) { return '<button type="button" data-g="' + i + '" aria-pressed="' + (i === gun) + '">' + esc(x.g.split(" · ")[0]) + "</button>"; }).join("") + '</div><ol class="hr-liste">' + g.d.map(function (d, i) {
          var n = g.d[i + 1], y = "";
          if (n) { var u = km([d[2], d[3]], [n[2], n[3]]) * 1.3, dk = Math.max(1, Math.round(u * 1000 / 75)); y = dk > 35 ? "≈ " + u.toFixed(1).replace(".", ",") + " km · toplu taşıma" : "≈ " + dk + " dk yürüme"; }
          return '<li><button type="button" data-d="' + i + '" aria-pressed="' + (i === durak) + '"><i>' + (i + 1) + "</i><b>" + esc(d[1]) + "</b><span>" + esc(d[0]) + "</span></button>" + (y ? "<small>" + y + "</small>" : "") + "</li>";
        }).join("") + '</ol><p class="hr-not">Örnek akış. Harita şematik; yürüme süreleri kuş uçuşu mesafeden tahmindir.</p>';
      }
    } else h += '<p class="hr-not">Haritada bir şehre dokun. Rakamlar seçili hafta sonu için 2 kişi toplamıdır.</p>';
    h += '<div class="hr-dg"><a href="/sehir/' + esc(s.slug) + "/?h=" + V.haftalar[hi].g + '">Planı aç</a><button type="button" data-m="' + (mod === "ag" ? "sehir" : "ag") + '">' + (mod === "ag" ? "Durakları gör" : "Uçuş ağına dön") + "</button></div>";
    $("hr-panel").innerHTML = h;
  }
  function ciz() {
    $("harita").setAttribute("data-mod", mod);
    Array.prototype.forEach.call(document.querySelectorAll(".hr-mod button"), function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-m") === mod ? "true" : "false"); });
    if (mod === "ag") agCiz(); else sehirCiz();
    panelCiz();
  }
  function modSec(m) {
    mod = m; gun = 0; durak = -1;
    if (m === "sehir" && !D) {
      hata = false;
      fetch("/sehirler/harita.json").then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) { D = j; ciz(); }, function () { hata = true; ciz(); });
    }
    ciz();
  }
  function sehirSec(slug) { if (!bul(slug)) return; sec = slug; gun = 0; durak = -1; ciz(); }
  function ilk() {
    var one = bul(V.one), L = S.filter(function (s) { return s.t[hi] != null; }).sort(function (p, q) { return p.t[hi] - q.t[hi]; });
    return (hi === 0 && one && one.t[0] != null ? one : L[0] || S[0] || { slug: "" }).slug;
  }
  function odak(sorgu) { var e = document.querySelector(sorgu); if (e) e.focus({ preventScroll: true }); }

  // Sık bölgelerde (Viyana, Bratislava) noktaya değil en yakın şehre bakılır
  kutu.addEventListener("click", function (e) {
    if (mod === "sehir") { var n = e.target.closest("[data-d]"); if (n) { durak = +n.getAttribute("data-d"); ciz(); odak('.hr-n[data-d="' + durak + '"]'); } return; }
    if (e.detail === 0) { var p = e.target.closest(".hr-p"); if (p) { var sl = p.getAttribute("data-slug"); sehirSec(sl); odak('.hr-p[data-slug="' + sl + '"]'); } return; }
    var et = e.target.closest(".hr-et"); if (et) { sehirSec(et.parentNode.getAttribute("data-slug")); return; }
    var r = kutu.getBoundingClientRect(), k = r.width / 440, x = (e.clientX - r.left) / k, y = (e.clientY - r.top) / k, en = null, m = 40 / k;
    pinler().forEach(function (p) { var d = Math.sqrt((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y)); if (d < m) { m = d; en = p; } });
    if (en) sehirSec(en.s.slug);
  });
  $("harita").addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t || kutu.contains(t)) return;
    if (t.hasAttribute("data-m")) { modSec(t.getAttribute("data-m")); if (!document.contains(t)) odak(".hr-dg button"); }
    else if (t.hasAttribute("data-g")) { gun = +t.getAttribute("data-g"); durak = -1; ciz(); odak('.hr-gun [data-g="' + gun + '"]'); }
    else if (t.hasAttribute("data-d")) { durak = +t.getAttribute("data-d"); ciz(); odak('.hr-liste [data-d="' + durak + '"]'); }
  });
  document.addEventListener("72h-hafta", function (e) { hi = e.detail; if (!bul(sec) || bul(sec).t[hi] == null) sec = ilk(); ciz(); });
  var zm; window.addEventListener("resize", function () { clearTimeout(zm); zm = setTimeout(function () { if (mod === "ag") agCiz(); }, 150); });
  // ana.js önce çalışır: hafta sonu başka sayfadan taşındıysa çip zaten basılıdır
  var c = document.querySelector('.cip[aria-pressed="true"]'); if (c) hi = +c.dataset.i || 0;
  sec = ilk(); ciz();
})();
