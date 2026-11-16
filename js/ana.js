/* Ana sayfa (A1 · biniş kartı): hafta sonu çipi değişince en uygun kart ve raf sayfa yenilenmeden yenilenir.
   Veri sayfanın içindeki <script id="ana-veri"> bloğundadır (scripts/ana-sayfa.mjs üretir). */
(function () {
  var el = document.getElementById("ana-veri");
  if (!el) return;
  var V = JSON.parse(el.textContent), hi = 0, secildi = false;
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function tl(n) { return Math.round(n).toLocaleString("tr-TR") + " TL"; }
  function sirali(i) { return V.sehirler.filter(function (s) { return s.t[i] != null; }).sort(function (a, b) { return a.t[i] - b.t[i]; }); }
  function yol(s) { return "/sehir/" + s.slug + "/?h=" + V.haftalar[hi].g; }
  function ciz() {
    var L = sirali(hi), h = V.haftalar[hi], one = null;
    // Açılışta öne çıkan şehir; bir hafta sonu çipine basılınca o hafta sonunun en uygun şehri
    if (!secildi && V.one) L.forEach(function (s) { if (s.slug === V.one) one = s; });
    var ilk = one || L[0], kocan = one ? "ÖNE ÇIKAN" : "EN UYGUN";
    L = L.filter(function (s) { return s !== ilk; });
    var B = ilk ? [ilk].concat(L.slice(0, 5)) : [];
    $("enuygun").innerHTML = ilk
      ? '<div class="bkd" id="bkd" tabindex="0" role="group" aria-label="Öne çıkan şehirler; yana kaydır">' + B.map(function (s, n) { return '<a class="bk" href="' + yol(s) + '"><div class="bk-kocan"><span>' + (n === 0 ? kocan : "72 SAAT") + '</span></div><div class="bk-govde"><img src="' + esc(s.foto) + '" alt="' + esc(s.alt) + '" width="640" height="427"><div class="bk-yazi"><div class="bk-rota"><span>IST → ' + esc(s.iata) + '</span><span>2 KİŞİ · 2 GECE</span></div><div class="bk-alt"><span class="bk-ad"><b>' + esc(s.ad) + "</b><span>" + esc(s.ulke) + ' · uçak + otel</span></span><span class="bk-fiyat"><b>' + tl(s.t[hi]) + "</b><span>kişi başı " + tl(s.t[hi] / 2) + "</span></span></div></div></div></a>"; }).join("") + '</div><div class="bkn" id="bkn" aria-hidden="true">' + B.map(function (_, n) { return "<i" + (n === 0 ? ' class="a"' : "") + "></i>"; }).join("") + "</div>"
      : '<p class="bos">Bu hafta sonu için fiyatlar henüz ölçülmedi; robot kontrol ediyor. Başka bir hafta sonu seç.</p>';
    serit();
    $("raf-baslik").textContent = hi === 0 ? "Bu hafta sonu" : h.kisa + " hafta sonu";
    $("raf").innerHTML = L.slice(5, 11).map(function (s) { return '<a class="rk" href="' + yol(s) + '"><img src="' + esc(s.foto) + '" alt="" loading="lazy" width="640" height="427"><div><b>' + esc(s.ad) + "</b><b>" + tl(s.t[hi]) + "</b></div></a>"; }).join("");
    var c = document.querySelectorAll(".cip");
    for (var i = 0; i < c.length; i++) c[i].setAttribute("aria-pressed", i === hi ? "true" : "false");
  }
  // Büyük kart şeridi: 6 şehir; parmakla ya da okla kayar, dokunulmadıkça 5 saniyede bir kendiliğinden ilerler
  var zaman = null, dokundu = false;
  function serit() {
    var d = $("bkd"), n = $("bkn"); if (!d) return;
    var adim = function () { var k = d.children[1]; return k ? k.offsetLeft - d.children[0].offsetLeft : d.clientWidth; };
    var simdi = function () { return Math.round(d.scrollLeft / (adim() || 1)); };
    var isaret = function () { var c = simdi(); for (var i = 0; i < n.children.length; i++) n.children[i].className = i === c ? "a" : ""; };
    var dur = function () { dokundu = true; clearInterval(zaman); };
    d.addEventListener("scroll", isaret, { passive: true });
    ["pointerdown", "touchstart", "wheel", "keydown", "focusin"].forEach(function (e) { d.addEventListener(e, dur, { passive: true }); });
    clearInterval(zaman);
    var az = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!dokundu && !az && d.children.length > 1) zaman = setInterval(function () {
      if (document.hidden) return;
      var c = simdi() + 1; d.scrollTo({ left: c >= d.children.length ? 0 : c * adim(), behavior: "smooth" });
    }, 5000);
  }
  $("cipler").addEventListener("click", function (e) {
    var b = e.target.closest(".cip"); if (!b) return;
    hi = +b.dataset.i; secildi = true; ciz();
    try { sessionStorage.setItem("72h-hafta", V.haftalar[hi].g); } catch (err) {}
  });
  try { var k = sessionStorage.getItem("72h-hafta"); V.haftalar.forEach(function (h, i) { if (h.g === k) hi = i; }); } catch (err) {}
  if (hi) { secildi = true; ciz(); } else serit();
})();
