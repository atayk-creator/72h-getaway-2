// Yönetici panelini üretir ve şifreli olarak panel/index.html'e yazar (saatlik iş akışı: .github/workflows/panel.yml).
// Düz veri yalnızca bellekte durur: diske, loga ya da depoya yazılmaz. Secrets ortam değişkenlerinden okunur:
//   PANEL_SIFRE (zorunlu), METRICOOL_TOKEN + METRICOOL_USER_ID (yayın ve sosyal medya verisi), PANEL_NOT_ANAHTARI (kurul notları).
// PANEL_SIFRE yoksa hiçbir şey üretmeden, hata vermeden çıkar. Diğerleri eksikse panel yine üretilir; o bölümler
// "yüklenemedi / henüz yüklenmedi" yazar.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { panelHtml } from "./panel.mjs";
import { metricoolVerisi } from "./panel-veri.mjs";
import { notCoz, SIFRELI } from "./panel-not.mjs";
import { tuzOku, anahtar, sifrele, kabuk } from "./panel-sifrele.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const E = process.env, sifre = E.PANEL_SIFRE;
if (!sifre) { console.log("Panel üretilmedi: PANEL_SIFRE tanımlı değil (Settings → Secrets)."); process.exit(0); }
if (sifre.length < 16) console.log("::warning::PANEL_SIFRE 16 karakterden kısa. Şifreli sayfa herkese açık olduğu için daha uzun bir şifre önerilir.");

const hatalar = {};
let M = { yayinlar: null, etkilesim: null, takipci: null, hatalar: [] };
if (E.METRICOOL_TOKEN && E.METRICOOL_USER_ID) {
  try { M = await metricoolVerisi({ token: E.METRICOOL_TOKEN, userId: E.METRICOOL_USER_ID, blogId: E.METRICOOL_BLOG_ID || "", tanilama: E.PANEL_TANILAMA === "1" }); }
  catch (e) { M.hatalar = ["Metricool bağlantısı"]; }
  if (M.hatalar.length) { hatalar.metricool = M.hatalar; console.log(`Metricool'dan alınamayan bölüm sayısı: ${M.hatalar.length} (${M.hatalar.join("; ")}).`); }
} else { hatalar.metricool = ["Sosyal medya verisi kurulun şifreli dosyasından okunur; dosya henüz yok ya da açılamadı"]; console.log("Metricool Secrets yok: veri kurulun şifreli dosyasından okunacak (yedek yol)."); }

let notlar = null, program = [], kurul = null;
if (!existsSync(SIFRELI)) hatalar.notlar = "Kurul notları henüz yüklenmedi (yonetim/panel/notlar.enc yok).";
else if (!E.PANEL_NOT_ANAHTARI) hatalar.notlar = "Kurul notları açılamadı: PANEL_NOT_ANAHTARI girilmedi.";
else {
  try { const v = notCoz(JSON.parse(readFileSync(SIFRELI, "utf8")), E.PANEL_NOT_ANAHTARI); kurul = v; notlar = Array.isArray(v.notlar) ? v.notlar : []; program = Array.isArray(v.program) ? v.program : []; }
  catch { hatalar.notlar = "Kurul notları açılamadı: anahtar ile dosya uyuşmuyor."; }
}

// Yedek yol (Metricool planı API'ye izin vermiyor, 16 Kas 2026): kurul Metricool verisini de şifreli dosyaya koyar.
// Metricool Secrets yoksa yayın takvimi, etkileşim ve takipçi verisi oradan okunur; "Veri" saati dosyadaki veriSaati olur.
let veriSaati = null;
if (!(E.METRICOOL_TOKEN && E.METRICOOL_USER_ID) && kurul) {
  for (const k of ["yayinlar", "etkilesim", "takipci"]) if (Array.isArray(kurul[k])) M[k] = kurul[k];
  if (M.yayinlar || M.etkilesim || M.takipci) {
    const eksik = [["yayinlar", "yayın takvimi"], ["etkilesim", "etkileşim"], ["takipci", "takipçi"]].filter(([k]) => !M[k]).map(([, ad]) => ad);
    if (eksik.length) hatalar.metricool = [`kurul dosyasında eksik: ${eksik.join(", ")}`]; else delete hatalar.metricool;
    const t = Date.parse(kurul.veriSaati || ""); if (!Number.isNaN(t)) veriSaati = t;
  } else hatalar.metricool = ["Sosyal medya verisi kurulun şifreli dosyasında henüz yok"];
}

const html = panelHtml({ ...M, notlar, program, hatalar, veriSaati });
const tuz = tuzOku();
writeFileSync(join(root, "panel/index.html"), kabuk({ tuz: tuz.toString("base64"), ...sifrele(html, anahtar(sifre, tuz)) }));
console.log(`Panel üretildi ve şifrelendi (${new Date().toISOString()}).`);
