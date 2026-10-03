#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-artifacts/hsme-physical-android-preflight}"
TARGET_PROCESS="${HSME_ANDROID_PROCESS:-}"
SELECTED_SERIAL="${ANDROID_SERIAL:-}"

command -v adb >/dev/null 2>&1 || { echo "adb is required" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq is required" >&2; exit 1; }
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum is required" >&2; exit 1; }

if [[ -z "$TARGET_PROCESS" ]]; then
  echo "HSME_ANDROID_PROCESS must name the exact Android application process/package" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
adb devices -l | tr -d '\r' >"$OUT_DIR/adb-devices.txt"

mapfile -t attached < <(awk 'NR>1 && $2=="device" {print $1}' "$OUT_DIR/adb-devices.txt")
if [[ -n "$SELECTED_SERIAL" ]]; then
  if ! printf '%s\n' "${attached[@]}" | grep -Fxq "$SELECTED_SERIAL"; then
    echo "ANDROID_SERIAL is not one attached ready device" >&2
    exit 1
  fi
  serial="$SELECTED_SERIAL"
else
  if [[ "${#attached[@]}" -ne 1 ]]; then
    echo "Expected exactly one attached ready Android device; set ANDROID_SERIAL to select one explicitly" >&2
    exit 1
  fi
  serial="${attached[0]}"
fi

ADB=(adb -s "$serial")
"${ADB[@]}" wait-for-device

boot_completed=""
for _ in $(seq 1 60); do
  boot_completed="$("${ADB[@]}" shell getprop sys.boot_completed | tr -d '\r')"
  [[ "$boot_completed" == "1" ]] && break
  sleep 2
done
if [[ "$boot_completed" != "1" ]]; then
  echo "Android device did not finish booting" >&2
  exit 1
fi

sdk="$("${ADB[@]}" shell getprop ro.build.version.sdk | tr -d '\r')"
model="$("${ADB[@]}" shell getprop ro.product.model | tr -d '\r')"
product="$("${ADB[@]}" shell getprop ro.product.name | tr -d '\r')"
manufacturer="$("${ADB[@]}" shell getprop ro.product.manufacturer | tr -d '\r')"
abi="$("${ADB[@]}" shell getprop ro.product.cpu.abi | tr -d '\r')"
qemu_kernel="$("${ADB[@]}" shell getprop ro.kernel.qemu | tr -d '\r')"
qemu_boot="$("${ADB[@]}" shell getprop ro.boot.qemu | tr -d '\r')"

case "$serial" in
  emulator-*|localhost:*|127.0.0.1:*)
    echo "Virtual/emulator serial is forbidden for physical HSME capture preflight" >&2
    exit 1
    ;;
esac

lower_model="$(printf '%s' "$model" | tr '[:upper:]' '[:lower:]')"
lower_product="$(printf '%s' "$product" | tr '[:upper:]' '[:lower:]')"
if [[ "$qemu_kernel" == "1" || "$qemu_boot" == "1" || "$lower_model" == *sdk_gphone* || "$lower_product" == *sdk_gphone* || "$lower_model" == *emulator* || "$lower_product" == *emulator* ]]; then
  echo "QEMU/emulator identity is forbidden for physical HSME capture preflight" >&2
  exit 1
fi

if [[ "$abi" != "arm64-v8a" ]]; then
  echo "HSME physical Android preflight currently requires ARM64 (arm64-v8a), got: $abi" >&2
  exit 1
fi

"${ADB[@]}" shell dumpsys battery | tr -d '\r' >"$OUT_DIR/battery.txt"
ac_powered="$(awk -F': ' '/AC powered:/ {print $2}' "$OUT_DIR/battery.txt")"
usb_powered="$(awk -F': ' '/USB powered:/ {print $2}' "$OUT_DIR/battery.txt")"
wireless_powered="$(awk -F': ' '/Wireless powered:/ {print $2}' "$OUT_DIR/battery.txt")"
status_code="$(awk -F': ' '/^[[:space:]]*status:/ {print $2}' "$OUT_DIR/battery.txt")"
level="$(awk -F': ' '/^[[:space:]]*level:/ {print $2}' "$OUT_DIR/battery.txt")"
scale="$(awk -F': ' '/^[[:space:]]*scale:/ {print $2}' "$OUT_DIR/battery.txt")"

for value in "$level" "$scale" "$status_code"; do
  [[ "$value" =~ ^[0-9]+$ ]] || { echo "Invalid battery telemetry" >&2; exit 1; }
done
if [[ "$ac_powered" != "false" || "$usb_powered" != "false" || "$wireless_powered" != "false" ]]; then
  echo "Physical HSME capture must start on battery power with AC/USB/wireless charging disabled" >&2
  exit 1
fi
if [[ "$status_code" != "3" && "$status_code" != "4" ]]; then
  echo "Physical HSME capture must start in DISCHARGING or NOT_CHARGING state; Android status=$status_code" >&2
  exit 1
fi
if (( scale <= 0 || level < 0 || level > scale )); then
  echo "Battery level/scale is invalid" >&2
  exit 1
fi
battery_bps=$(( level * 10000 / scale ))

pid="$("${ADB[@]}" shell pidof "$TARGET_PROCESS" | tr -d '\r' | awk '{print $1}')"
if ! [[ "$pid" =~ ^[0-9]+$ ]] || (( pid <= 0 )); then
  echo "Target Android process is not running: $TARGET_PROCESS" >&2
  exit 1
fi
"${ADB[@]}" shell cat "/proc/$pid/status" | tr -d '\r' >"$OUT_DIR/process-status.txt"
rss_kb="$(awk '/^VmRSS:/ {print $2}' "$OUT_DIR/process-status.txt")"
if ! [[ "$rss_kb" =~ ^[0-9]+$ ]] || (( rss_kb <= 0 )); then
  echo "Could not obtain positive VmRSS for target process" >&2
  exit 1
fi
rss_bytes=$(( rss_kb * 1024 ))

if ! "${ADB[@]}" shell dumpsys thermalservice | tr -d '\r' >"$OUT_DIR/thermalservice.txt" 2>"$OUT_DIR/thermalservice.err"; then
  echo "Android thermalservice is unavailable; trusted thermal capture cannot proceed" >&2
  exit 1
fi
if [[ ! -s "$OUT_DIR/thermalservice.txt" ]]; then
  echo "Android thermalservice returned no data" >&2
  exit 1
fi

airplane_mode="$("${ADB[@]}" shell settings get global airplane_mode_on | tr -d '\r')"
if [[ "$airplane_mode" != "0" && "$airplane_mode" != "1" ]]; then
  airplane_mode="UNKNOWN"
fi

serial_sha256="$(printf '%s' "$serial" | sha256sum | awk '{print $1}')"
process_sha256="$(printf '%s' "$TARGET_PROCESS" | sha256sum | awk '{print $1}')"

jq -n \
  --arg serialSha256 "$serial_sha256" \
  --arg processIdentitySha256 "$process_sha256" \
  --arg sdk "$sdk" \
  --arg model "$model" \
  --arg product "$product" \
  --arg manufacturer "$manufacturer" \
  --arg abi "$abi" \
  --arg statusCode "$status_code" \
  --arg airplaneMode "$airplane_mode" \
  --argjson batteryStartBps "$battery_bps" \
  --argjson processResidentSetBytes "$rss_bytes" \
  '{
    schemaVersion:"BERS_HSME_PHYSICAL_ANDROID_PREFLIGHT_V1",
    state:"PHYSICAL_ANDROID_PREFLIGHT_READY_NOT_EVIDENCE",
    evidenceClass:"PHYSICAL_DEVICE_PREFLIGHT_ONLY",
    platform:"ANDROID",
    deviceClass:"MOBILE",
    physicalDeviceDetected:true,
    virtualDevice:false,
    serialSha256:$serialSha256,
    targetProcessIdentitySha256:$processIdentitySha256,
    androidApiLevel:$sdk,
    productModel:$model,
    productName:$product,
    manufacturer:$manufacturer,
    cpuAbi:$abi,
    battery:{
      powerSource:"BATTERY",
      androidStatusCode:$statusCode,
      startBps:$batteryStartBps,
      charging:false
    },
    processResidentSetBytes:$processResidentSetBytes,
    workingSetMetricKind:"PROCESS_RESIDENT_SET_RSS_BYTES",
    thermalServiceAvailable:true,
    airplaneMode:$airplaneMode,
    qualificationReady:false,
    realPhysicalMobileDeviceMeasurement:false,
    physicalDeviceAttestationSha256:null,
    nativeTelemetryAttestationSha256:null,
    energyMicroJoulesPerRun:null,
    productionAuthorityGranted:false,
    mobileBackendAdmissionAllowed:false,
    winnerSelectionAllowed:false
  }' >"$OUT_DIR/preflight.json"

test "$(jq -r '.state' "$OUT_DIR/preflight.json")" = "PHYSICAL_ANDROID_PREFLIGHT_READY_NOT_EVIDENCE"
test "$(jq -r '.physicalDeviceDetected' "$OUT_DIR/preflight.json")" = "true"
test "$(jq -r '.virtualDevice' "$OUT_DIR/preflight.json")" = "false"
test "$(jq -r '.qualificationReady' "$OUT_DIR/preflight.json")" = "false"
test "$(jq -r '.realPhysicalMobileDeviceMeasurement' "$OUT_DIR/preflight.json")" = "false"
test "$(jq -r '.energyMicroJoulesPerRun' "$OUT_DIR/preflight.json")" = "null"
test "$(jq -r '.productionAuthorityGranted' "$OUT_DIR/preflight.json")" = "false"
test "$(jq -r '.mobileBackendAdmissionAllowed' "$OUT_DIR/preflight.json")" = "false"
test "$(jq -r '.winnerSelectionAllowed' "$OUT_DIR/preflight.json")" = "false"

cat "$OUT_DIR/preflight.json"
