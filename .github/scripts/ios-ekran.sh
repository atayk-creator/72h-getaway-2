#!/usr/bin/env bash
# Sanal iPhone'da (6,9 inç Pro Max) uygulamayı kurar, açar ve ekran görüntüleri alır (ekran/ klasörüne).
#  - ios-1-tanitim.png: ilk açılış (tanıtım)
#  - ios-magaza-1..5-*.png: App Store için 6,9 inç (1320x2868 ya da 1290x2796) mağaza sahneleri
# Sahne seçimi: uygulamanın "72h-ekran" ayarı (app/shell/app.js > acAdres). getaway72h:// adresi iOS onay kutusu açtığı için robotta kullanılmaz.
set -u
APP="$1"; mkdir -p ekran
UDID=$(xcrun simctl list devices available -j | python3 -c '
import json,sys
d=json.load(sys.stdin)["devices"]
c=[(k,x) for k,v in d.items() if "iOS" in k for x in v if x["name"].startswith("iPhone") and "Pro Max" in x["name"]]
c.sort(key=lambda t:(t[0],t[1]["name"])); print(c[-1][1]["udid"] if c else ""); print(c[-1][1]["name"] if c else "-", c[-1][0] if c else "", file=sys.stderr)')
if [ -z "$UDID" ]; then
  # Hazır Pro Max yoksa en yeni Pro Max tipinden bir tane oluştur
  DT=$(xcrun simctl list devicetypes -j | python3 -c 'import json,sys;t=[x["identifier"] for x in json.load(sys.stdin)["devicetypes"] if "Pro-Max" in x["identifier"]];print(sorted(t)[-1])')
  RT=$(xcrun simctl list runtimes available -j | python3 -c 'import json,sys;r=[x["identifier"] for x in json.load(sys.stdin)["runtimes"] if "iOS" in x["identifier"]];print(sorted(r)[-1])')
  UDID=$(xcrun simctl create "72h Pro Max" "$DT" "$RT")
fi
echo "Cihaz: $UDID"
xcrun simctl boot "$UDID" || true
xcrun simctl bootstatus "$UDID" -b
# Mağaza görüntüsü için temiz durum çubuğu (9:41, tam pil, tam çekim)
xcrun simctl status_bar "$UDID" override --time 9:41 --dataNetwork wifi --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100 || true
xcrun simctl install "$UDID" "$APP"
xcrun simctl launch "$UDID" "$APP_ID"; sleep 25
xcrun simctl io "$UDID" screenshot ekran/ios-1-tanitim.png
# Ayarlar uygulamanın kendi kabındaki dosyaya yazılır (Capacitor Preferences = UserDefaults, "CapacitorStorage." önekiyle)
PREF="$(xcrun simctl get_app_container "$UDID" "$APP_ID" data)/Library/Preferences/$APP_ID"
ayar() { xcrun simctl spawn "$UDID" defaults write "$PREF" "CapacitorStorage.$1" -string "$2"; }
xcrun simctl terminate "$UDID" "$APP_ID" 2>/dev/null || true
ayar 72h-tanitim 1

sahne() { # sahne <dosya> <ekran> <bekleme sn>: uygulamayı kapat, açılış ekranını yaz, aç, görüntü al
  xcrun simctl terminate "$UDID" "$APP_ID" 2>/dev/null || true
  ayar 72h-ekran "$2"
  { echo "== $1"; xcrun simctl spawn "$UDID" defaults read "$PREF" 2>&1; } >> ekran/ios-ayar.txt
  xcrun simctl launch "$UDID" "$APP_ID"; sleep "$3"
  xcrun simctl io "$UDID" screenshot "ekran/$1.png"
}
sahne ios-magaza-1-kesfet "#kesfet" 22
sahne ios-magaza-2-takvim "#takvim/paris" 20
sahne ios-magaza-3-biletim "#biletim" 22
sahne ios-magaza-4-karsilastir "#karsilastir" 20
sahne ios-magaza-5-noel "#takvim/noel" 20
cp ekran/ios-magaza-1-kesfet.png ekran/ios-2-kesfet.png

# Boyut kontrolü: App Store 6,9 inç = 1320x2868 ya da 1290x2796
: > ekran/ios-boyut.txt
for f in ekran/ios-magaza-*.png; do
  W=$(sips -g pixelWidth "$f" | awk '/pixelWidth/{print $2}'); H=$(sips -g pixelHeight "$f" | awk '/pixelHeight/{print $2}')
  case "${W}x${H}" in 1320x2868|1290x2796) d="uygun" ;; *) d="UYGUN DEĞİL" ;; esac
  echo "$(basename "$f") ${W}x${H} $d" | tee -a ekran/ios-boyut.txt
done
xcrun simctl spawn "$UDID" log show --last 4m --predicate 'process == "App"' --style compact 2>/dev/null | grep -iE "error|⚡️|capacitor|js" | tail -n 80 > ekran/ios-log.txt || true
ls -la ekran
