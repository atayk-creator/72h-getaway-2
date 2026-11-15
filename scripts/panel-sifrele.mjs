// Yönetici panelini şifreler (iş emri: yonetim/is-emri-yonetici-paneli.md). Depo herkese açık olduğu için yayınlanan
// panel/index.html yalnızca şifre kutusu + şifreli blok + çözücü betikten oluşur; düz içerik depoya hiç girmez.
// Yöntem: içerik gzip'lenir, AES-256-GCM ile şifrelenir; anahtar şifreden PBKDF2-SHA256 (600.000 tur) ile türetilir.
// Tuz gizli değildir ve sabittir (yonetim/panel/tuz.txt): böylece telefonda hatırlanan anahtar her saatlik yenilemede geçerli kalır.
// Kullanım (yalnızca iş akışında): PANEL_SIFRE=... node scripts/panel-sifrele.mjs <düz-panel.html> panel/index.html
// Şifre ve düz içerik hiçbir yere yazdırılmaz.
import { readFileSync, writeFileSync } from "node:fs";
import { pbkdf2Sync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
export const TUR = 600000;
export const tuzOku = () => Buffer.from(readFileSync(join(root, "yonetim/panel/tuz.txt"), "utf8").trim(), "base64");
export const anahtar = (sifre, tuz) => pbkdf2Sync(Buffer.from(String(sifre).normalize("NFC"), "utf8"), tuz, TUR, 32, "sha256");

/** Düz HTML → { iv, ct } (base64). ct = şifreli gzip + 16 baytlık doğrulama etiketi (WebCrypto'nun beklediği biçim). */
export function sifrele(html, key) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(gzipSync(Buffer.from(html, "utf8"), { level: 9 })), c.final(), c.getAuthTag()]);
  return { iv: iv.toString("base64"), ct: ct.toString("base64") };
}
export function coz({ iv, ct }, key) {
  const b = Buffer.from(ct, "base64"), d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  d.setAuthTag(b.subarray(b.length - 16));
  return gunzipSync(Buffer.concat([d.update(b.subarray(0, b.length - 16)), d.final()])).toString("utf8");
}

/** Yayınlanan kabuk sayfa: şifre kutusu + şifreli blok + çözücü. İçinde düz veri yoktur. */
export function kabuk({ tuz, iv, ct }) {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<title>72h Panel</title>
<meta name="theme-color" content="#0F2A43">
<link rel="manifest" href="/panel/manifest.webmanifest">
<link rel="apple-touch-icon" href="/img/icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="72h Panel">
<link rel="stylesheet" href="/fonts/fonts.css">
<style>
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;background:#0F2A43;color:#FBF6EC;font-family:Figtree,Arial,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px;padding-top:calc(24px + env(safe-area-inset-top,0px))}
form{width:100%;max-width:360px;display:flex;flex-direction:column;gap:14px}
.logo{display:flex;font-family:Archivo,Arial,sans-serif;font-weight:800;font-size:17px;align-self:flex-start}
.logo .a{background:#F4A62A;color:#0F2A43;padding:5px 9px;border-radius:6px 0 0 6px}.logo .b{background:#FBF6EC;color:#0F2A43;padding:5px 10px 5px 8px;border-radius:0 6px 6px 0;border-left:2px dashed #0F2A43}
h1{margin:6px 0 0;font-family:Archivo,Arial,sans-serif;font-weight:800;font-size:26px}
label{font-size:14px;color:#A9B8C7;display:flex;flex-direction:column;gap:6px}
input[type=password]{height:52px;border-radius:12px;border:1px solid #2F506D;background:#153552;color:#FBF6EC;font:500 17px Figtree,Arial,sans-serif;padding:0 14px}
input[type=password]:focus{outline:3px solid #F4A62A;outline-offset:2px}
.h{flex-direction:row;align-items:center;gap:10px;min-height:44px;color:#FBF6EC}.h input{width:22px;height:22px;accent-color:#F4A62A}
button{height:52px;border-radius:12px;border:0;background:#F4A62A;color:#0F2A43;font:700 16px Figtree,Arial,sans-serif;cursor:pointer}
button[disabled]{opacity:.6}
#msg{min-height:22px;font-size:14px;color:#F4A62A;margin:0}
</style>
</head>
<body>
<form id="f" autocomplete="off">
  <span class="logo"><span class="a">72h</span><span class="b">panel</span></span>
  <h1>Yönetici paneli</h1>
  <label>Şifre<input id="s" type="password" autocomplete="current-password" required autofocus></label>
  <label class="h"><input id="h" type="checkbox" checked>Bu cihazda hatırla</label>
  <button id="b" type="submit">Aç</button>
  <p id="msg" role="alert"></p>
</form>
<script>
(function () {
  var P = { tuz: "${tuz}", iv: "${iv}", tur: ${TUR} }, CT = "${ct}", AD = "72h-panel-anahtar";
  var $ = function (i) { return document.getElementById(i); };
  function b64(s) { var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function b64yaz(a) { var s = ""; for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function hatirla(raw) { try { if (raw) localStorage.setItem(AD, raw); else localStorage.removeItem(AD); } catch (e) {} }
  function turet(sifre) {
    return crypto.subtle.importKey("raw", new TextEncoder().encode(sifre.normalize("NFC")), "PBKDF2", false, ["deriveBits"])
      .then(function (k) { return crypto.subtle.deriveBits({ name: "PBKDF2", salt: b64(P.tuz), iterations: P.tur, hash: "SHA-256" }, k, 256); })
      .then(function (bits) { return new Uint8Array(bits); });
  }
  function ac(raw) {
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"])
      .then(function (k) { return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(P.iv) }, k, b64(CT)); })
      .then(function (gz) { return new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"))).text(); });
  }
  function goster(html) { window.PANEL_CIKIS = function () { hatirla(null); location.reload(); }; document.open(); document.write(html); document.close(); }
  if (!window.crypto || !crypto.subtle || !window.DecompressionStream) { $("msg").textContent = "Bu tarayıcı paneli açamıyor; telefonu ya da tarayıcıyı güncelle."; return; }
  var kayit = null; try { kayit = localStorage.getItem(AD); } catch (e) {}
  if (kayit) ac(b64(kayit)).then(goster, function () { hatirla(null); $("msg").textContent = "Şifre değişmiş; yeniden gir."; });
  $("f").addEventListener("submit", function (e) {
    e.preventDefault();
    var b = $("b"); b.disabled = true; $("msg").textContent = "Açılıyor…";
    turet($("s").value).then(function (raw) {
      return ac(raw).then(function (html) { if ($("h").checked) hatirla(b64yaz(raw)); goster(html); });
    }).catch(function () { b.disabled = false; $("msg").textContent = "Şifre yanlış."; $("s").select(); });
  });
})();
</script>
</body>
</html>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [girdi, cikti] = process.argv.slice(2), sifre = process.env.PANEL_SIFRE;
  if (!girdi || !cikti || !sifre) { console.error("Kullanım: PANEL_SIFRE=… node scripts/panel-sifrele.mjs <düz.html> <panel/index.html>"); process.exit(2); }
  if (sifre.length < 16) console.log("::warning::PANEL_SIFRE 16 karakterden kısa; çevrimdışı deneme-yanılmaya karşı daha uzun bir şifre seç.");
  const tuz = tuzOku(), k = anahtar(sifre, tuz), s = sifrele(readFileSync(girdi, "utf8"), k);
  writeFileSync(cikti, kabuk({ tuz: tuz.toString("base64"), ...s }));
  console.log("Panel şifrelendi.");
}
