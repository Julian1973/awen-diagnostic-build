#!/bin/bash
# Meditation Studio installer for macOS. Run it once on each Mac (MacBook and iMac):
#
#   1. Open Terminal (press Cmd+Space, type Terminal, press Return).
#   2. Type   bash   and a space, drag this file into the Terminal window, press Return.
#
# Run it again any time to update. Your library and keys are kept.
#
# What it does:
#   - installs Node.js if this Mac does not have it (asks for your Mac password, checks the download)
#   - copies the studio to ~/Library/Application Support/MeditationStudio/app
#   - keeps the library in iCloud Drive (Meditation Studio folder) so both Macs share it
#   - makes "Meditation Studio" in your Applications folder, ready to drag to the Dock
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_MODE="${STUDIO_INSTALL_TEST:-0}"
NODE_LINE="latest-v24.x"
PORT=4100

say() { printf '\n\033[1;33m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

if [[ "$TEST_MODE" != "1" && "$(uname)" != "Darwin" ]]; then
  fail "This installer is for a Mac."
fi
[[ -f "$SRC/server.js" && -f "$SRC/package.json" ]] || fail "Run this from inside the meditation-studio folder."

SUPPORT="$HOME/Library/Application Support/MeditationStudio"
CODE_DIR="$SUPPORT/app"
APP="$HOME/Applications/Meditation Studio.app"
LOG_DIR="$HOME/Library/Logs"
ICLOUD="$HOME/Library/Mobile Documents/com~apple~CloudDocs"

say "Meditation Studio: setting up this Mac"

# ---------- 1. Node.js ----------
find_node() {
  local c
  for c in "$(command -v node 2>/dev/null || true)" /usr/local/bin/node /opt/homebrew/bin/node; do
    if [[ -n "$c" && -x "$c" ]]; then
      local major
      major="$("$c" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
      if [[ "$major" -ge 20 ]]; then echo "$c"; return 0; fi
    fi
  done
  return 1
}

NODE="$(find_node || true)"
if [[ -z "$NODE" ]]; then
  [[ "$TEST_MODE" == "1" ]] && fail "Node.js 20 or newer is needed."
  say "Installing Node.js. Your Mac will ask for your password."
  BASE="https://nodejs.org/dist/$NODE_LINE"
  SUMS="$(curl -fsSL "$BASE/SHASUMS256.txt")" || fail "Could not reach nodejs.org. Check the internet connection."
  PKG="$(printf '%s\n' "$SUMS" | awk '$2 ~ /\.pkg$/ {print $2; exit}')"
  WANT="$(printf '%s\n' "$SUMS" | awk '$2 ~ /\.pkg$/ {print $1; exit}')"
  [[ -n "$PKG" ]] || fail "Could not find the Node.js installer."
  TMP_PKG="$(mktemp -d)/$PKG"
  curl -fL --progress-bar -o "$TMP_PKG" "$BASE/$PKG"
  GOT="$(shasum -a 256 "$TMP_PKG" | awk '{print $1}')"
  [[ "$GOT" == "$WANT" ]] || fail "The Node.js download did not match its checksum. Nothing was installed."
  sudo installer -pkg "$TMP_PKG" -target /
  rm -f "$TMP_PKG"
  NODE="$(find_node || true)"
  [[ -n "$NODE" ]] || fail "Node.js did not install. Download it from https://nodejs.org and run this again."
fi
NODE_BIN_DIR="$(dirname "$NODE")"
export PATH="$NODE_BIN_DIR:$PATH"
NPM="$NODE_BIN_DIR/npm"
[[ -x "$NPM" ]] || NPM="$(command -v npm)"
echo "Node.js $("$NODE" -v) at $NODE"

# ---------- 2. Stop a running studio before updating ----------
if curl -fs "http://localhost:$PORT/api/ping" >/dev/null 2>&1; then
  echo "Stopping the running studio for the update"
  curl -fs -X POST -H 'X-Studio: 1' "http://localhost:$PORT/api/shutdown" >/dev/null 2>&1 || true
  sleep 1
fi

# ---------- 3. Copy the studio ----------
say "Copying the studio"
mkdir -p "$CODE_DIR" "$LOG_DIR" "$HOME/Applications"
rsync -a --delete \
  --exclude node_modules --exclude storage --exclude .env --exclude '.DS_Store' \
  "$SRC/" "$CODE_DIR/"
if [[ "$(uname)" == "Darwin" ]]; then
  xattr -dr com.apple.quarantine "$CODE_DIR" 2>/dev/null || true
fi

say "Installing the parts it needs (a minute or two)"
(cd "$CODE_DIR" && "$NPM" install --omit=dev --no-audit --no-fund --no-update-notifier --loglevel=error)
FFMPEG_BIN="$(STUDIO_DIR="$CODE_DIR" "$NODE" -e "try{const p=require(process.env.STUDIO_DIR+'/node_modules/ffmpeg-static');if(p&&require('fs').existsSync(p))process.stdout.write(p)}catch{}" 2>/dev/null || true)"
FFMPEG_OK="no"; [[ -n "$FFMPEG_BIN" ]] && FFMPEG_OK="yes"
if [[ "$FFMPEG_OK" != "yes" ]] && ! command -v ffmpeg >/dev/null 2>&1; then
  say "Warning: the audio engine (ffmpeg) did not download. Run this installer again, or install ffmpeg."
fi

# ---------- 4. The shared library ----------
if [[ -d "$ICLOUD" ]]; then
  DATA="$ICLOUD/Meditation Studio"
  SHARED="iCloud Drive"
else
  DATA="$HOME/Documents/Meditation Studio"
  SHARED="Documents (iCloud Drive is off on this Mac, so this library is not shared)"
fi
mkdir -p "$DATA"
# First time only: bring over a library made by running the studio straight from the download.
if [[ -f "$SRC/storage/db.json" && ! -e "$DATA/db.json" && ! -e "$DATA/.db.json.icloud" ]]; then
  echo "Moving your existing library into $SHARED"
  rsync -a "$SRC/storage/" "$DATA/"
fi

# Keep keys already saved on this Mac; point the studio at the shared library.
ENV_FILE="$CODE_DIR/.env" DATA_DIR="$DATA" "$NODE" -e '
  const fs = require("fs");
  const file = process.env.ENV_FILE;
  let lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean) : [];
  lines = lines.filter((l) => !l.startsWith("STUDIO_STORAGE_DIR="));
  lines.push("STUDIO_STORAGE_DIR=" + process.env.DATA_DIR);
  fs.writeFileSync(file, lines.join("\n") + "\n", { mode: 0o600 });
'

# ---------- 5. The app ----------
say "Making the Meditation Studio app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Meditation Studio</string>
  <key>CFBundleDisplayName</key><string>Meditation Studio</string>
  <key>CFBundleIdentifier</key><string>uk.co.lightandharmony.meditationstudio</string>
  <key>CFBundleExecutable</key><string>Meditation Studio</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
</dict>
</plist>
PLIST

printf -v Q_CODE '%q' "$CODE_DIR"
printf -v Q_NODE '%q' "$NODE"
printf -v Q_LOG '%q' "$LOG_DIR/Meditation Studio.log"
cat > "$APP/Contents/MacOS/Meditation Studio" <<LAUNCH
#!/bin/bash
# Starts Meditation Studio in the background if it is not already running, then opens it.
CODE_DIR=$Q_CODE
NODE=$Q_NODE
LOG=$Q_LOG
URL="http://localhost:$PORT"
if ! curl -fs "\$URL/api/ping" >/dev/null 2>&1; then
  cd "\$CODE_DIR" || exit 1
  nohup "\$NODE" server.js >>"\$LOG" 2>&1 </dev/null &
  disown
  for _ in \$(seq 1 60); do
    curl -fs "\$URL/api/ping" >/dev/null 2>&1 && break
    sleep 0.25
  done
fi
if curl -fs "\$URL/api/ping" >/dev/null 2>&1; then
  open "\$URL"
else
  osascript -e 'display dialog "Meditation Studio did not start. Run the installer again, or look at Meditation Studio.log in your Logs folder." buttons {"OK"} default button "OK" with title "Meditation Studio"' >/dev/null 2>&1
fi
LAUNCH
chmod +x "$APP/Contents/MacOS/Meditation Studio"

# Icon: a gold circle and cross on Living Awake navy, drawn with the studio's own audio engine.
if [[ "$(uname)" == "Darwin" && -x "$FFMPEG_BIN" ]]; then
  ICON_TMP="$(mktemp -d)"
  if "$FFMPEG_BIN" -hide_banner -loglevel error -f lavfi -i "color=c=0x0a1525:s=1024x1024,format=rgba" -frames:v 1 \
      -vf "geq=r='if(lt(abs(hypot(X-512,Y-512)-300),22)+lt(abs(X-512),20)*lt(abs(Y-512),360)+lt(abs(Y-470),20)*lt(abs(X-512),360),212,10)':g='if(lt(abs(hypot(X-512,Y-512)-300),22)+lt(abs(X-512),20)*lt(abs(Y-512),360)+lt(abs(Y-470),20)*lt(abs(X-512),360),165,21)':b='if(lt(abs(hypot(X-512,Y-512)-300),22)+lt(abs(X-512),20)*lt(abs(Y-512),360)+lt(abs(Y-470),20)*lt(abs(X-512),360),116,37)':a=255" \
      "$ICON_TMP/icon.png" 2>/dev/null; then
    mkdir -p "$ICON_TMP/AppIcon.iconset"
    for s in 16 32 128 256 512; do
      sips -z $s $s "$ICON_TMP/icon.png" --out "$ICON_TMP/AppIcon.iconset/icon_${s}x${s}.png" >/dev/null 2>&1 || true
      sips -z $((s*2)) $((s*2)) "$ICON_TMP/icon.png" --out "$ICON_TMP/AppIcon.iconset/icon_${s}x${s}@2x.png" >/dev/null 2>&1 || true
    done
    iconutil -c icns "$ICON_TMP/AppIcon.iconset" -o "$APP/Contents/Resources/AppIcon.icns" 2>/dev/null || true
  fi
  rm -rf "$ICON_TMP"
  touch "$APP"
fi

# ---------- 6. Done ----------
say "Done. Meditation Studio is in your Applications folder."
echo "Library: $DATA ($SHARED)"
echo "Keys: paste your Claude and ElevenLabs keys in Settings once on this Mac."
echo "Tip: drag Meditation Studio from Applications to your Dock."
if [[ "$TEST_MODE" != "1" ]]; then
  open "$APP"
  open -R "$APP"
fi
