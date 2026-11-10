#!/usr/bin/env bash
# Sanal iPhone'da (6,9 inç Pro Max) uygulamayı kurar, açar ve ekran görüntüleri alır (ekran/ klasörüne).
#  - ios-1-tanitim.png: ilk açılış (tanıtım)
#  - ios-magaza-1..5-*.png: App Store için 6,9 inç (1320x2868 ya da 1290x2796) mağaza sahneleri
# Sahne seçimi: getaway72h://ac#<ekran> adresi (app/shell/app.js > acAdres).
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
xcrun simctl spawn "$UDID" defaults write "$APP_ID" "CapacitorStorage.72h-tanitim" -string 1

# Uygulamayı bir kez aç; sahneleri getaway72h:// adresiyle değiştir (app/shell/app.js > acAdres)
xcrun simctl terminate "$UDID" "$APP_ID" 2>/dev/null || true
xcrun simctl launch "$UDID" "$APP_ID"; sleep 25
sahne() { # sahne <dosya> <adres> <bekleme sn>
  xcrun simctl openurl "$UDID" "getaway72h://ac$2"; sleep "$3"
  xcrun simctl io "$UDID" screenshot "ekran/$1.png"
}
sahne ios-magaza-2-takvim "#takvim/paris" 8
sahne ios-magaza-3-biletim "#biletim" 10
sahne ios-magaza-4-karsilastir "#karsilastir" 8
sahne ios-magaza-5-noel "#takvim/noel" 10
sahne ios-magaza-1-kesfet "#kesfet" 10
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
