/* 72h Getaway telefon uygulaması kabuğu (Capacitor). Sitenin sayfaları olduğu gibi kullanılır; bu dosya üstüne
 * uygulamaya özgü katmanı ekler:
 *  - Fiyat verisi: önce canlı (72hgetaway.com, yedek GitHub), internet yoksa uygulamayla gelen son veri
 *  - Gezinme: sitenin kendi 5 sekmesi (Keşfet, Şehirler, Takvim, Karşılaştır, Biletim) tek alt menüdür;
 *    üst çubukta Turlarım ve Hakkında, alt sayfalarda (Oteller, Hakkında) Geri düğmesi; Android geri tuşu
 *  - Turlarım: kaydedilen turlar (telefonda saklanır), açınca güncel fiyatlarla yeniden hesaplanır
 *  - Telefonun kendi paylaşma menüsü: bağlantı (72hgetaway.com adresiyle), PDF ve hikâye görseli (dosya olarak)
 *  - Dış bağlantılar uygulama içi tarayıcıda; /sehir/ sayfaları uygulamanın kendi Takvim ekranında açılır
 *  - İlk açılış tanıtımı, çevrimdışı uyarısı
 * Head içinde, sayfanın kendi kodundan ÖNCE yüklenir (veri isteklerini yakalayabilmek için). */
(function () {
  "use strict";
  var SITE = "https://72hgetaway.com";
  var BASES = [SITE + "/", "https://raw.githubusercontent.com/atayk-creator/72h-getaway-2/main/"];
  var Cap = window.Capacitor;
  var plugin = function (n) { return Cap && Cap.Plugins && Cap.Plugins[n] ? Cap.Plugins[n] : null; };
  var native = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  var page = /oteller\.html$/.test(location.pathname) ? "oteller" : /hakkinda\.html$/.test(location.pathname) ? "hakkinda" : /(^\/$|index\.html$)/.test(location.pathname) ? "hesapla" : "diger";
  var state = { offline: false, liveOk: false };
  // Sitenin :root çentik boşluğu uygulamada kapatılır; çentik payını üst çubuk karşılar (app.css: html.in-app)
  try { document.documentElement.classList.add("in-app"); } catch (e) {}

  /* ---------------- Depolama (Preferences varsa o, yoksa localStorage) ---------------- */
  var store = {
    get: function (k) {
      var P = plugin("Preferences");
      if (P) return P.get({ key: k }).then(function (r) { return r && r.value != null ? r.value : null; }).catch(function () { return null; });
      try { return Promise.resolve(localStorage.getItem(k)); } catch (e) { return Promise.resolve(null); }
    },
    set: function (k, v) {
      var P = plugin("Preferences");
      try { localStorage.setItem(k, v); } catch (e) {}
      return P ? P.set({ key: k, value: v }).catch(function () {}) : Promise.resolve();
    }
  };

  /* ---------------- Veri: önce canlı, olmazsa uygulamadaki kopya ---------------- */
  var origFetch = window.fetch ? window.fetch.bind(window) : null;
  var isData = function (p) { return /^\/(data\.json|prices\.json|price-status\.json|data\/[\w\-\/]+\.json)$/.test(p); };
  var goodBase = null;
  try { goodBase = sessionStorage.getItem("72h-veri-adresi"); } catch (e) {}
  function withTimeout(p, ms) {
    return new Promise(function (res, rej) { var t = setTimeout(function () { rej(new Error("zaman aşımı")); }, ms); p.then(function (x) { clearTimeout(t); res(x); }, function (e) { clearTimeout(t); rej(e); }); });
  }
  function remoteFirst(u, init) {
    var bases = goodBase ? [goodBase].concat(BASES.filter(function (b) { return b !== goodBase; })) : BASES.slice();
    var path = u.pathname.replace(/^\//, "") + u.search;
    var i = 0;
    var next = function () {
      if (i >= bases.length || state.offline) return local();
      var b = bases[i++];
      return withTimeout(origFetch(b + path, { cache: "no-store", mode: "cors" }), 8000).then(function (r) {
        if (!r.ok) return next();
        if (goodBase !== b) { goodBase = b; try { sessionStorage.setItem("72h-veri-adresi", b); } catch (e) {} }
        state.liveOk = true; return r;
      }, next);
    };
    var local = function () { if (!state.liveOk) state.offline = true; offlineData(); return origFetch(u.pathname, init); };
    return next();
  }
  if (origFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : input && input.url;
      var u; try { u = new URL(url, location.href); } catch (e) { return origFetch(input, init); }
      if (u.origin !== location.origin || !isData(u.pathname)) return origFetch(input, init);
      return remoteFirst(u, init);
    };
  }

  /* ---------------- Paylaşma: telefonun menüsü, adres 72hgetaway.com ---------------- */
  function webUrl(href) {
    try {
      var u = new URL(href, location.href);
      if (u.origin !== location.origin) return u.href;
      return SITE + u.pathname.replace(/^\/index\.html$/, "/") + u.search + u.hash;
    } catch (e) { return href; }
  }
  var origShare = navigator.share ? navigator.share.bind(navigator) : null;
  function appShare(data) {
    var d = { title: data && data.title, text: data && data.text, url: data && data.url ? webUrl(data.url) : undefined };
    var S = plugin("Share");
    if (S) return S.share({ title: d.title, text: d.text, url: d.url, dialogTitle: "Paylaş" }).then(function () {}, function (e) {
      var err = new Error(String((e && e.message) || "iptal")); if (/cancel|iptal/i.test(err.message)) err.name = "AbortError"; throw err;
    });
    if (origShare) return origShare(d);
    return Promise.reject(new Error("paylaşma yok"));
  }
  try { Object.defineProperty(navigator, "share", { configurable: true, value: appShare }); } catch (e) { try { navigator.share = appShare; } catch (e2) {} }

  /* ---------------- PDF: telefona kaydet, paylaş menüsünü aç ---------------- */
  function toBase64(bytes) {
    var s = "", ch = 0x8000;
    for (var i = 0; i < bytes.length; i += ch) s += String.fromCharCode.apply(null, bytes.subarray(i, i + ch));
    return btoa(s);
  }
  window.claude = window.claude || {};
  window.claude.use = function (name) {
    var F = plugin("Filesystem"), S = plugin("Share");
    if (name !== "downloads" || !F || !S) return Promise.resolve(null);
    return Promise.resolve({
      save: function (o) {
        var bytes = o.data instanceof Uint8Array ? o.data : new Uint8Array(o.data);
        return F.writeFile({ path: o.filename, data: toBase64(bytes), directory: "CACHE" }).then(function (w) {
          return S.share({ title: o.filename, files: [w.uri], dialogTitle: "PDF'i kaydet ya da gönder" }).catch(function (e) {
            if (/cancel/i.test(String(e && e.message))) { var x = new Error("vazgeçildi"); x.code = "declined"; throw x; } throw e;
          });
        });
      }
    });
  };

  /* ---------------- Dosya paylaşma (hikâye görseli vb.): telefona yaz, paylaş menüsünü aç ---------------- */
  function shareFile(blob, filename, title) {
    var F = plugin("Filesystem"), S = plugin("Share");
    if (!F || !S || !blob) return Promise.reject(new Error("paylaşma yok"));
    return blob.arrayBuffer().then(function (buf) {
      return F.writeFile({ path: filename, data: toBase64(new Uint8Array(buf)), directory: "CACHE" });
    }).then(function (w) {
      return S.share({ title: title || filename, files: [w.uri], dialogTitle: "Paylaş" }).then(function () { return true; }, function (e) {
        if (/cancel|iptal/i.test(String(e && e.message))) return false; throw e;
      });
    });
  }

  /* ---------------- Arayüz ---------------- */
  var ICON = {
    turlar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
    hakkinda: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></svg>',
    geri: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>'
  };
  var TITLES = { hesapla: "72h Getaway", oteller: "Otel fiyatları", hakkinda: "Hakkında", diger: "72h Getaway" };
  var $ = function (id) { return document.getElementById(id); };
  var trips = [];
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  function toast(t) {
    var el = document.createElement("div"); el.className = "app-toast"; el.setAttribute("role", "status"); el.textContent = t;
    document.body.appendChild(el); setTimeout(function () { el.remove(); }, 2400);
  }
  function offlineData() {
    if (state.shownOffline) return; state.shownOffline = true;
    var show = function () { var b = $("appBanner"); if (b) { $("appBannerText").textContent = "İnternete bağlanamadık. Uygulamayla gelen son fiyatlar gösteriliyor" + (window.APP_BUILD && window.APP_BUILD.veri ? " (" + window.APP_BUILD.veri + ")" : "") + "."; b.hidden = false; } };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show); else show();
  }

  function cityName() { var s = $("city"); return s && s.options && s.selectedIndex >= 0 ? s.options[s.selectedIndex].text.split(" · ")[0].replace(/^[^\wÇĞİÖŞÜçğıöşü]+/, "").trim() : ""; }
  function saveTrips() { return store.set("72h-turlar", JSON.stringify(trips)); }
  function badge() { var b = document.querySelector(".app-bar .badge"); if (b) { b.textContent = trips.length; b.hidden = !trips.length; } }

  function saveCurrent() {
    var q = location.search || "", total = ($("rTotal") || {}).textContent || "", ozet = ($("rSub") || {}).textContent || "", sehir = cityName();
    if (!sehir) return;
    trips = trips.filter(function (x) { return x.q !== q; });
    trips.unshift({ id: Date.now(), sehir: sehir, q: q, toplam: total.trim(), ozet: ozet.trim(), t: new Date().toISOString() });
    trips = trips.slice(0, 50); saveTrips(); badge();
    toast("Tur kaydedildi · ⭐ Turlarım'da");
  }
  function renderTrips() {
    var list = $("tripList");
    if (!trips.length) { list.innerHTML = '<div class="empty"><b>Henüz kayıtlı turun yok</b>Biletim sekmesinde bir tur hesapla, sonra ⭐ Turu kaydet\'e dokun.</div>'; return; }
    list.innerHTML = trips.map(function (x) {
      return '<div class="trip"><button type="button" class="t" data-q="' + esc(x.q) + '"><b>' + esc(x.sehir) + "</b><span>" + esc(x.ozet) + "</span><em>Kaydederken: " + esc(x.toplam) + '</em></button><button type="button" class="del" data-id="' + x.id + '" aria-label="' + esc(x.sehir) + ' turunu sil">✕</button></div>';
    }).join("");
  }
  var lastFocus = null;
  function openSheet() { lastFocus = document.activeElement; renderTrips(); $("appSheet").hidden = false; var c = $("appSheet").querySelector(".close"); if (c) c.focus(); }
  function closeSheet() { $("appSheet").hidden = true; if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {} }
  function goBack() {
    if (history.length > 1) history.back(); else location.href = "/index.html#kesfet";
  }
  // Ana sayfada üst çubuk başlığı açık sekmeyi gösterir (sitenin kendi başlığından)
  function syncTitle() {
    if (page !== "hesapla") return;
    var t = String(document.title || "").split(" · ")[0];
    var el = document.querySelector(".app-bar .title");
    if (el) el.textContent = !t || /^Keşfet$/.test(t) ? "72h Getaway" : t;
  }

  function intro() {
    var S = [
      ["1", "Bu hafta sonu nereye?", "Keşfet'te her hafta değişen 6 şehir, gerçek uçak ve otel fiyatlarıyla hikâye gibi akar. Beğendiğine dokun, takvimini gör."],
      ["2", "Fiyatlar gerçek", "Robotlarımız İstanbul çıkışlı Cuma sabah gidiş, Pazar akşam dönüş uçuşlarını ve otel fiyatlarını düzenli kontrol ediyor. Takvim hangi hafta sonunun ucuz, hangisinin pahalı olduğunu gösterir."],
      ["3", "Biletin hazır", "Biletim'de yemek ve gezi dahil tam bütçeni gör, ⭐ ile kaydet, hikâyende paylaş ya da PDF olarak al. İnternet yokken de son fiyatlarla çalışır."]
    ], i = 0, el = document.createElement("div");
    el.className = "app-intro"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Tanıtım");
    var draw = function () {
      el.innerHTML = '<div class="slide"><div class="num">' + S[i][0] + "</div><h2>" + S[i][1] + "</h2><p>" + S[i][2] + '</p></div><div class="dots">' + S.map(function (_, k) { return '<i class="' + (k === i ? "on" : "") + '"></i>'; }).join("") +
        '</div><button type="button" class="go">' + (i < S.length - 1 ? "Devam" : "Başla") + '</button>' + (i < S.length - 1 ? '<button type="button" class="skipi">Geç</button>' : "");
      el.querySelector(".go").onclick = function () { if (i < S.length - 1) { i++; draw(); } else done(); };
      var sk = el.querySelector(".skipi"); if (sk) sk.onclick = done;
      el.querySelector(".go").focus();
    };
    var done = function () { el.remove(); store.set("72h-tanitim", "1"); };
    draw(); document.body.appendChild(el);
  }

  // Uygulamada olmayan sayfalara giden iç bağlantılar uygulamanın kendi ekranlarına çevrilir
  function mapInternal(u) {
    var p = u.pathname, m = /^\/sehir\/([a-z0-9-]+)\/?(index\.html)?$/.exec(p);
    if (m) return "/index.html#takvim/" + m[1];
    if (/^\/sehir\/?$/.test(p)) return "/index.html#sehirler";
    if (p === "/" || p === "") return "/index.html" + (u.search || "") + (u.hash || "#kesfet");
    return null;
  }

  function build() {
    document.body.classList.add("in-app");
    document.body.classList.add(page === "hesapla" ? "page-main" : "page-sub");
    var bar = document.createElement("div"); bar.className = "app-bar";
    var left = page === "hesapla" ? '<span class="logo" aria-hidden="true">72H</span>' : '<button type="button" class="ab back" aria-label="Geri">' + ICON.geri + "</button>";
    bar.innerHTML = left + '<span class="title">' + TITLES[page] + "</span>" +
      '<button type="button" class="ab trips" aria-label="Turlarım">' + ICON.turlar + '<span class="badge" hidden></span></button>' +
      (page === "hesapla" ? '<button type="button" class="ab info" aria-label="Hakkında ve gizlilik">' + ICON.hakkinda + "</button>" : "");
    bar.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.classList.contains("back")) goBack();
      else if (b.classList.contains("trips")) openSheet();
      else if (b.classList.contains("info")) location.href = "/hakkinda.html";
    });
    document.body.insertBefore(bar, document.body.firstChild);

    var ban = document.createElement("div"); ban.className = "app-banner"; ban.id = "appBanner"; ban.hidden = true; ban.setAttribute("role", "status");
    ban.innerHTML = '<span id="appBannerText"></span><button type="button">Tekrar dene</button>';
    ban.querySelector("button").onclick = function () { location.reload(); };
    bar.insertAdjacentElement("afterend", ban);

    var sh = document.createElement("div"); sh.className = "app-sheet"; sh.id = "appSheet"; sh.hidden = true;
    sh.innerHTML = '<div class="panel" role="dialog" aria-modal="true" aria-labelledby="tripH"><button type="button" class="close" aria-label="Kapat">×</button><h2 id="tripH">Turlarım</h2><p class="lead">Kaydettiğin turlar. Açınca güncel fiyatlarla yeniden hesaplanır.</p><div id="tripList"></div></div>';
    sh.addEventListener("click", function (e) {
      if (e.target === sh || e.target.closest(".close")) return closeSheet();
      var d = e.target.closest(".del");
      if (d) { var id = +d.getAttribute("data-id"); trips = trips.filter(function (x) { return x.id !== id; }); saveTrips(); badge(); renderTrips(); return; }
      var t = e.target.closest(".t"); if (t) { $("appSheet").hidden = true; location.href = "/index.html" + t.getAttribute("data-q") + "#biletim"; }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("appSheet").hidden) closeSheet(); });
    document.body.appendChild(sh);

    // Turu kaydet düğmesi (Biletim)
    var share = $("shareBtn");
    if (share) {
      var sv = document.createElement("button"); sv.type = "button"; sv.className = "btn ghost app-save"; sv.id = "saveTrip"; sv.textContent = "⭐ Turu kaydet";
      sv.addEventListener("click", saveCurrent); share.insertAdjacentElement("afterend", sv);
      $("pdfBtn") && ($("pdfBtn").textContent = "📄 Programı PDF olarak al");
    }
    if (page === "hesapla") {
      window.addEventListener("hashchange", function () { setTimeout(syncTitle, 0); });
      setTimeout(syncTitle, 400);
      if (location.hash === "#turlarim") { history.replaceState(null, "", location.pathname + location.search + "#biletim"); openSheet(); }
    }

    // Bağlantılar: dış siteler uygulama içi tarayıcıda; uygulamada olmayan iç sayfalar kendi ekranlarımıza
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[href]"); if (!a) return;
      var href = a.getAttribute("href"); if (!href || href.charAt(0) === "#") return;
      var u; try { u = new URL(href, location.href); } catch (x) { return; }
      if (u.origin === location.origin || u.hostname === "72hgetaway.com" || u.hostname === "www.72hgetaway.com") {
        var to = mapInternal(u);
        if (to) { e.preventDefault(); location.href = to; return; }
        if (u.origin !== location.origin) { e.preventDefault(); location.href = u.pathname + u.search + u.hash; return; }
        if (a.target === "_blank") { e.preventDefault(); location.href = u.href; }
        return;
      }
      if (!/^https?:$/.test(u.protocol)) return;
      e.preventDefault();
      var B = plugin("Browser");
      if (B) B.open({ url: u.href, presentationStyle: "popover", toolbarColor: "#0F2A43" }); else window.open(u.href, "_blank");
    }, true);

    // Ağ durumu
    var N = plugin("Network");
    if (N) { N.getStatus().then(function (s) { if (s && s.connected === false) { state.offline = true; offlineData(); } }).catch(function () {});
      N.addListener("networkStatusChange", function (s) { if (s.connected && state.shownOffline) { var b = $("appBanner"); if (b) $("appBannerText").textContent = "İnternet geri geldi. Güncel fiyatlar için yenile."; } }); }

    // Android geri tuşu: açık pencere → kapat; alt sayfa → geri; sekmeler arasında geçmişte geri; Keşfet'te uygulamadan çık
    var A = plugin("App");
    if (A) A.addListener("backButton", function (ev) {
      if (!$("appSheet").hidden) return closeSheet();
      if (page !== "hesapla") return goBack();
      var h = location.hash || "#kesfet";
      if (h === "#kesfet") return A.exitApp();
      if (ev && ev.canGoBack) history.back(); else location.hash = "#kesfet";
    });
    var SB = plugin("StatusBar");
    if (SB) { SB.setStyle({ style: "DARK" }).catch(function () {}); if (SB.setBackgroundColor) SB.setBackgroundColor({ color: "#0F2A43" }).catch(function () {}); }
    var SP = plugin("SplashScreen"); if (SP) setTimeout(function () { SP.hide().catch(function () {}); }, 250);

    store.get("72h-turlar").then(function (v) { try { trips = JSON.parse(v || "[]") || []; } catch (e) { trips = []; } badge(); });
    store.get("72h-tanitim").then(function (v) { if (!v && page === "hesapla") intro(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
  window.APP = { native: native, webUrl: webUrl, state: state, shareFile: native ? shareFile : null };
})();
