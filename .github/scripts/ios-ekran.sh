#!/usr/bin/env bash
# Sanal iPhone'da uygulamayı kurar, açar ve ekran görüntüleri alır (ekran/ klasörüne).
set -u
APP="$1"; mkdir -p ekran
UDID=$(xcrun simctl list devices available -j | python3 -c '
import json,sys
d=json.load(sys.stdin)["devices"]
c=[(k,x) for k,v in d.items() if "iOS" in k for x in v if x["name"].startswith("iPhone") and "Pro" in x["name"] and "Max" not in x["name"]]
c=c or [(k,x) for k,v in d.items() if "iOS" in k for x in v if x["name"].startswith("iPhone")]
c.sort(key=lambda t:t[0]); print(c[-1][1]["udid"]); print(c[-1][1]["name"], c[-1][0], file=sys.stderr)')
echo "Cihaz: $UDID"
xcrun simctl boot "$UDID" || true
xcrun simctl bootstatus "$UDID" -b
xcrun simctl install "$UDID" "$APP"
xcrun simctl launch "$UDID" "$APP_ID"; sleep 25
xcrun simctl io "$UDID" screenshot ekran/ios-1-tanitim.png
xcrun simctl terminate "$UDID" "$APP_ID" || true
xcrun simctl spawn "$UDID" defaults write "$APP_ID" "CapacitorStorage.72h-tanitim" -string 1
xcrun simctl launch "$UDID" "$APP_ID"; sleep 20
xcrun simctl io "$UDID" screenshot ekran/ios-2-kesfet.png
xcrun simctl spawn "$UDID" log show --last 2m --predicate 'process == "App"' --style compact 2>/dev/null | grep -iE "error|⚡️|capacitor|js" | tail -n 80 > ekran/ios-log.txt || true
ls -la ekran
