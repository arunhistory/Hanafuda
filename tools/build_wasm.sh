#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/assets/wasm"
clang++ --target=wasm32 -O3 -flto -nostdlib -fno-exceptions -fno-rtti -fno-builtin \
  -Wl,--no-entry \
  -Wl,--export=core_version \
  -Wl,--export=get_buffer \
  -Wl,--export=get_last_yaku_mask \
  -Wl,--export=card_month \
  -Wl,--export=card_flags \
  -Wl,--export=score_captured \
  -Wl,--export=special_hand \
  -Wl,--export=matching_field_mask \
  -Wl,--export=choose_hand_index \
  -Wl,--export=choose_capture_index \
  -Wl,--export=choose_koi_decision \
  -Wl,--export-memory \
  -Wl,--initial-memory=131072 \
  -Wl,--max-memory=131072 \
  -Wl,--strip-all \
  -o "$ROOT/assets/wasm/hanafuda_core.wasm" \
  "$ROOT/src/core/wasm_runtime.cpp" \
  "$ROOT/src/core/hanafuda_core.cpp"
