#!/usr/bin/env bash
# iOS projesini üretir (app/ios) ve App Store ayarlarını yapar: gizlilik bildirimi, şifreleme beyanı, dil, iPhone + dikey.
# Test (simülatör) ve mağaza (TestFlight) derlemesi ortak kullanır.
set -euo pipefail
cd app
npm install --no-audit --no-fund
npm run www
npx cap add ios
npx capacitor-assets generate --ios --iconBackgroundColor "#0F2A43" --splashBackgroundColor "#0F2A43" --splashBackgroundColorDark "#0F2A43"
npx cap sync ios
xcodebuild -version
cp ios-ek/PrivacyInfo.xcprivacy ios/App/App/PrivacyInfo.xcprivacy
gem list -i xcodeproj >/dev/null || sudo gem install xcodeproj --no-document
ruby ios-ek/ayarla.rb ios/App/App.xcodeproj
P=ios/App/App/Info.plist; PB=/usr/libexec/PlistBuddy
$PB -c "Delete :ITSAppUsesNonExemptEncryption" $P 2>/dev/null || true
$PB -c "Add :ITSAppUsesNonExemptEncryption bool false" $P
$PB -c "Set :CFBundleDevelopmentRegion tr" $P 2>/dev/null || $PB -c "Add :CFBundleDevelopmentRegion string tr" $P
$PB -c "Delete :CFBundleLocalizations" $P 2>/dev/null || true
$PB -c "Add :CFBundleLocalizations array" $P && $PB -c "Add :CFBundleLocalizations:0 string tr" $P
$PB -c "Set :CFBundleDisplayName 72h Getaway" $P 2>/dev/null || $PB -c "Add :CFBundleDisplayName string 72h Getaway" $P
$PB -c "Delete :UISupportedInterfaceOrientations" $P 2>/dev/null || true
$PB -c "Add :UISupportedInterfaceOrientations array" $P && $PB -c "Add :UISupportedInterfaceOrientations:0 string UIInterfaceOrientationPortrait" $P
$PB -c "Delete :UISupportedInterfaceOrientations~ipad" $P 2>/dev/null || true
# Uygulama adresi getaway72h:// (bağlantıyla belirli ekranı açar; ekran görüntüsü robotu da bunu kullanır)
$PB -c "Delete :CFBundleURLTypes" $P 2>/dev/null || true
$PB -c "Add :CFBundleURLTypes array" $P
$PB -c "Add :CFBundleURLTypes:0 dict" $P
$PB -c "Add :CFBundleURLTypes:0:CFBundleURLName string com.getaway72h.app" $P
$PB -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" $P
$PB -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string getaway72h" $P
plutil -lint $P ios/App/App/PrivacyInfo.xcprivacy
plutil -p $P | grep -E "Encryption|Region|Localizations|DisplayName|Orientation|URLSchemes" -A2
