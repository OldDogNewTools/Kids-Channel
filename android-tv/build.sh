#!/bin/bash
# Builds kidstv.apk (the Android TV / Google TV shell for Kids TV).
# Needs (Ubuntu): apt-get install aapt apksigner zipalign android-sdk-platform-23 dalvik-exchange, plus a JDK.
# Usage: ./build.sh /path/to/keystore.jks <store-password> [key-alias]
set -euo pipefail
cd "$(dirname "$0")"
KS="$1"; PASS="$2"; ALIAS="${3:-kidstv}"
AJ=/usr/lib/android-sdk/platforms/android-23/android.jar
rm -rf build && mkdir -p build/gen build/classes
aapt package -f -m -J build/gen -M AndroidManifest.xml -S res -I "$AJ"
javac -source 8 -target 8 -bootclasspath "$AJ" -d build/classes \
  build/gen/family/kidstv/app/R.java src/family/kidstv/app/MainActivity.java
dalvik-exchange --dex --min-sdk-version=21 --output=build/classes.dex build/classes
aapt package -f -M AndroidManifest.xml -S res -I "$AJ" -F build/unsigned.apk
(cd build && aapt add unsigned.apk classes.dex >/dev/null)
zipalign -f 4 build/unsigned.apk build/aligned.apk
apksigner sign --ks "$KS" --ks-pass "pass:$PASS" --key-pass "pass:$PASS" --ks-key-alias "$ALIAS" \
  --out build/kidstv.apk build/aligned.apk
echo "Built build/kidstv.apk"
