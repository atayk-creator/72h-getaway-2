/* Şehirler sayfası (/sehirler/): konulara göre raflar (Ş3) + biniş kartı listesi (Ş1), arama ve süzgeçler.
   Veri sayfanın içindeki <script id="ana-veri"> bloğundadır (scripts/ana-sayfa.mjs üretir). */
(function () {
  var el = document.getElementById("ana-veri");
  if (!el) return;
  var V = JSON.parse(el.textContent), hi = 0, suz = "hepsi", ara = "";
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function tl(n) { return Math.round(n).toLocaleString("tr-TR") + " TL"; }
  function sade(s) { return String(s).toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c"); }
  function yol(s) { return "/sehir/" + s.slug + "/?h=" + V.haftalar[hi].g; }
  var SUZGEC = {
    hepsi: { ad: "En uygun", f: function () { return true; } },
    vizesiz: { ad: "Vizesiz", alt: "Pasaportla git", f: function (s) { return s.v === 1; } },
    alti40: { ad: "40 bin altı", alt: "2 kişi, uçak + otel", f: function (s) { return s.t[hi] != null && s.t[hi] < 40000; } },
    normal: { ad: "Normal fiyatında", alt: "Şehrin olağan fiyatından en fazla %10 yukarıda", f: function (s) { return s.t[hi] != null && s.f[hi] != null && s.f[hi] <= 10; } },
    uzak: { ad: "Biraz uzak, değer", alt: "Aktarmasız uçuş 3 saatten uzun", f: function (s) { return s.dk > 180; } }
  };
  var RAFLAR = [["alti40", "40 bin altı"], ["normal", "Bu hafta sonu normal fiyatında"], ["vizesiz", "Vizesiz"], ["uzak", "Biraz uzak, değer"]];
  function sirali(f) {
    return V.sehirler.filter(f).sort(function (a, b) { return (a.t[hi] == null) - (b.t[hi] == null) || a.t[hi] - b.t[hi] || a.ad.localeCompare(b.ad, "tr"); });
  }
  function durum(s) {
    var e = s.e[hi], f = s.f[hi];
    if (e === "u") return '<span class="dc u">Uygun hafta</span>';
    if (e === "p" && f != null) return '<span class="dc p">Normalden +%' + f + "</span>";
    return e ? '<span class="dc n">Normal fiyat</span>' : "";
  }
  function cizRaflar() {
    $("raflar").innerHTML = RAFLAR.map(function (r) {
      var S = SUZGEC[r[0]], L = sirali(S.f);
      if (!L.length) return "";
      return '<section><div class="raf-bas"><span><h2>' + r[1] + '</h2><span class="alt">' + S.alt + '</span></span><button type="button" data-suz="' + r[0] + '" aria-label="' + r[1] + ': tümünü listele">Tümü</button></div><div class="raf">' +
        L.map(function (s) { return '<a class="rk c" href="' + yol(s) + '"><img src="' + esc(s.foto) + '" alt="" loading="lazy" width="640" height="427"><div><b>' + esc(s.ad) + "</b>" + (s.t[hi] != null ? "<b>" + tl(s.t[hi]) + "</b>" : '<b class="yok">kontrol ediliyor</b>') + "</div></a>"; }).join("") + "</div></section>";
    }).join("");
  }
  function cizListe() {
    $("suzgec").innerHTML = Object.keys(SUZGEC).map(function (k) { return '<button type="button" data-suz="' + k + '" aria-pressed="' + (k === suz) + '">' + SUZGEC[k].ad + "</button>"; }).join("");
    var q = sade(ara.trim());
    var L = sirali(function (s) { return SUZGEC[suz].f(s) && (!q || sade(s.ad).indexOf(q) > -1 || sade(s.ulke).indexOf(q) > -1); });
    var var_ = L.filter(function (s) { return s.t[hi] != null; }), yok = L.filter(function (s) { return s.t[hi] == null; });
    var h = var_.map(function (s, i) {
      return '<a class="sat" href="' + yol(s) + '"><span class="sat-no' + (i === 0 ? " ilk" : "") + '"><span>' + (i < 9 ? "0" : "") + (i + 1) + '</span></span><img src="' + esc(s.foto) + '" alt="" loading="lazy" width="64" height="72"><span class="sat-yazi"><span><b class="ad">' + esc(s.ad) + '</b><b class="fy">' + tl(s.t[hi]) + '</b></span><span><span class="ulke">' + esc(s.ulke) + " · uçak + otel</span>" + durum(s) + "</span></span></a>";
    }).join("");
    if (yok.length) h += '<div class="bekleyen"><i></i><span>' + yok.map(function (s) { return '<a href="' + yol(s) + '">' + esc(s.ad) + "</a>"; }).join(", ") + ": robot bu hafta sonunu kontrol ediyor</span></div>";
    if (!L.length) h = '<p class="bos">' + (q ? '"' + esc(ara.trim()) + '" için şehir bulunamadı.' : "Bu hafta sonu bu süzgece uyan şehir yok. Başka bir hafta sonu ya da süzgeç seç.") + "</p>";
    $("satirlar").innerHTML = h;
  }
  function goster(liste) {
    $("liste").hidden = !liste; $("raflar").hidden = liste; $("hepsi").hidden = liste;
    if (liste) cizListe(); else cizRaflar();
  }
  function listede() { return location.hash === "#liste" || !!ara.trim(); }
  function ciz() {
    var c = document.querySelectorAll(".cip");
    for (var i = 0; i < c.length; i++) c[i].setAttribute("aria-pressed", i === hi ? "true" : "false");
    goster(listede());
  }
  $("cipler").addEventListener("click", function (e) {
    var b = e.target.closest(".cip"); if (!b) return;
    hi = +b.dataset.i; ciz();
    try { sessionStorage.setItem("72h-hafta", V.haftalar[hi].g); } catch (err) {}
  });
  $("raflar").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-suz]"); if (!b) return;
    suz = b.dataset.suz; location.hash = "liste"; ciz(); window.scrollTo(0, 0);
  });
  $("suzgec").addEventListener("click", function (e) { var b = e.target.closest("button[data-suz]"); if (!b) return; suz = b.dataset.suz; cizListe(); });
  $("hepsi").addEventListener("click", function () { suz = "hepsi"; });
  $("raflara").addEventListener("click", function () { ara = ""; $("ara").value = ""; suz = "hepsi"; if (location.hash) history.replaceState(null, "", location.pathname); ciz(); window.scrollTo(0, 0); });
  $("ara").addEventListener("input", function () { ara = this.value; if (ara.trim()) suz = "hepsi"; ciz(); }); // arama bütün şehirlerde yapılır
  window.addEventListener("hashchange", ciz);
  try { var k = sessionStorage.getItem("72h-hafta"); V.haftalar.forEach(function (h, i) { if (h.g === k) hi = i; }); } catch (err) {}
  ciz();
  var sc = document.querySelector('.cip[aria-pressed="true"]');
  if (sc && hi) $("cipler").scrollLeft = Math.max(0, sc.offsetLeft - 16);
})();
