/* 72h Getaway: ziyaretçi ölçümü ve ortaklık bağlantıları (tek ayar dosyası)
 *
 * ÖLÇÜM (GoatCounter, çerezsiz, kişisel veri yok)
 *   goatcounter.com'da hesap açınca seçtiğin kodu aşağıya yaz (örnek "72hgetaway").
 *   Boş bırakılırsa hiçbir şey yüklenmez, hiçbir şey gönderilmez.
 *   Sayılanlar: sayfa görüntüleme; şehir seçimi, PDF, Paylaş, Booking/uçak/harita ve kanal bağlantısı tıklamaları.
 *   Videodan gelenler için bağlantıya ?k=yt-paris (ya da utm_source=youtube) ekle; kaynak olarak görünür.
 *
 * ORTAKLIK (Awin üzerinden Booking.com)
 *   Awin onayı gelince yayıncı kimliğini (awinaffid) ve Booking'in Awin reklamveren kimliğini (awinmid) yaz.
 *   Boşken Booking bağlantıları olduğu gibi kalır ve ortaklık bildirimi gösterilmez.
 */
(function (root) {
  "use strict";
  var AYAR = {
    goatcounter: "72hgetaway", //   →  https://72hgetaway.goatcounter.com
    awinaffid: "",            // Awin yayıncı kimliği (sayı)
    awinmid: ""               // Booking.com'un Awin reklamveren kimliği (sayı)
  };

  // ---------- saf yardımcılar (testlerde de kullanılır) ----------
  function ortaklikAcik(a) { return /^\d+$/.test(String(a.awinaffid || "")) && /^\d+$/.test(String(a.awinmid || "")); }

  function bookingMu(href) {
    try { var u = new URL(href, "https://72hgetaway.com/"); return /(^|\.)booking\.com$/i.test(u.hostname); } catch (e) { return false; }
  }

  function awinBaglanti(href, a, kaynak) {
    if (!ortaklikAcik(a) || !bookingMu(href)) return href;
    var s = "https://www.awin1.com/cread.php?awinmid=" + a.awinmid + "&awinaffid=" + a.awinaffid;
    if (kaynak) s += "&clickref=" + encodeURIComponent(String(kaynak).slice(0, 50));
    return s + "&ued=" + encodeURIComponent(href);
  }

  // Tıklanan bağlantı ya da düğme için olay adı; ölçülmeyecekse null
  function olayAdi(el) {
    if (!el) return null;
    var id = el.id || "";
    if (id === "pdfBtn") return "pdf-indir";
    if (id === "shareBtn") return "paylas";
    var href = el.getAttribute && el.getAttribute("href");
    if (!href) return null;
    if (bookingMu(href)) return "cikis-booking";
    if (/google\.[a-z.]+\/travel\/flights|skyscanner|enuygun|aviasales/i.test(href)) return "cikis-ucak";
    if (/google\.[a-z.]+\/maps/i.test(href)) return "cikis-harita";
    if (/youtube\.com|youtu\.be/i.test(href)) return "kanal-youtube";
    if (/instagram\.com/i.test(href)) return "kanal-instagram";
    if (/tiktok\.com/i.test(href)) return "kanal-tiktok";
    if (/^\/?(\?|index\.html\?).*sehir=/i.test(href) || /bütçe hesapla/i.test(el.textContent || "")) return "hesapla-bagla";
    return null;
  }

  // Sayfa yolu: yalnızca şehir parametresi kalsın (tarih, kişi sayısı gönderilmez)
  function sayfaYolu(loc) {
    var p = loc.pathname || "/";
    try { var s = new URLSearchParams(loc.search).get("sehir"); if (s) p += "?sehir=" + encodeURIComponent(s.toLocaleLowerCase("tr-TR")); } catch (e) {}
    return p;
  }

  function kaynakEtiketi(loc) {
    try { var q = new URLSearchParams(loc.search); return q.get("k") || q.get("utm_source") || q.get("ref") || ""; } catch (e) { return ""; }
  }

  var api = { AYAR: AYAR, ortaklikAcik: ortaklikAcik, bookingMu: bookingMu, awinBaglanti: awinBaglanti, olayAdi: olayAdi, sayfaYolu: sayfaYolu, kaynakEtiketi: kaynakEtiketi };
  if (typeof module === "object" && module.exports) { module.exports = api; return; }
  root.Olcum72 = api;

  // ---------- tarayıcıda çalışan kısım ----------
  var doc = root.document; if (!doc) return;
  var kaynak = kaynakEtiketi(root.location);

  function say(path, title, olay) {
    try { if (root.goatcounter && root.goatcounter.count) root.goatcounter.count({ path: path, title: title || path, event: !!olay }); } catch (e) {}
  }

  // Telefon uygulamasında (window.APP_BUILD) ölçüm yapılmaz: mağaza gizlilik formunda "veri toplanmıyor" beyan edildi
  if (AYAR.goatcounter && !root.APP_BUILD && /^[a-z0-9-]+$/.test(AYAR.goatcounter)) {
    root.goatcounter = root.goatcounter || {};
    root.goatcounter.path = function () { return sayfaYolu(root.location); };
    if (kaynak) root.goatcounter.referrer = function () { return kaynak; };
    var sc = doc.createElement("script");
    sc.async = true; sc.src = "https://gc.zgo.at/count.js";
    sc.setAttribute("data-goatcounter", "https://" + AYAR.goatcounter + ".goatcounter.com/count");
    doc.head.appendChild(sc);
  }

  // Şehir seçimi (hesaplayıcı)
  doc.addEventListener("change", function (e) {
    var t = e.target; if (!t || t.id !== "city") return;
    var ad = t.options && t.selectedIndex >= 0 ? t.options[t.selectedIndex].text.split("·")[0].trim() : "";
    if (ad) say("sehir-sec/" + ad.toLocaleLowerCase("tr-TR"), "Şehir seçildi: " + ad, true);
  }, true);

  // Tıklamalar: ölçüm + Booking bağlantısını ortaklık bağlantısına çevirme (yalnızca ayar doluysa)
  function tik(e) {
    var el = e.target && e.target.closest ? e.target.closest("a,button") : null; if (!el) return;
    var ad = olayAdi(el);
    if (ad) say(ad + "/" + sayfaYolu(root.location).replace(/^\//, ""), ad, true);
    if (el.tagName === "A" && ortaklikAcik(AYAR) && bookingMu(el.href) && el.href.indexOf("awin1.com") < 0) {
      el.href = awinBaglanti(el.href, AYAR, kaynak || sayfaYolu(root.location));
      var rel = (el.getAttribute("rel") || "") + " sponsored"; el.setAttribute("rel", rel.trim());
    }
  }
  doc.addEventListener("click", tik, true);
  doc.addEventListener("auxclick", tik, true); // orta tıkla yeni sekme

  // Ortaklık bildirimi: yalnızca ortaklık açıksa göster
  function bildirim() {
    if (!ortaklikAcik(AYAR)) return;
    var els = doc.querySelectorAll("[data-ortaklik-bildirim]");
    for (var i = 0; i < els.length; i++) els[i].hidden = false;
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", bildirim); else bildirim();
})(typeof window !== "undefined" ? window : globalThis);
