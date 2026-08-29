#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/assets/wasm"
clang++ --target=wasm32 -O3 -flto -nostdlib -fno-exceptions -fno-rtti -fno-builtin \
  -Wl,--no-entry \
  -Wl,--export-all \
  -Wl,--export-memory \
  -Wl,--initial-memory=262144 \
  -Wl,--max-memory=262144 \
  -Wl,--strip-all \
  -o "$ROOT/assets/wasm/hanafuda_engine.wasm" \
  "$ROOT/src/core/hanafuda_core.cpp" \
  "$ROOT/src/core/hanafuda_game.cpp"
