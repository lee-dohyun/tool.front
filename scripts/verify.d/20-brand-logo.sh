#!/usr/bin/env bash
# 브랜드 워드마크가 텍스트 흉내가 아니라 정식 CDN 로고 이미지를 쓰는지 검사한다.
# 근거: scripts/test/check-brand-logo.mjs 상단 주석(2026-08-23 사고, posselect #216 재발).
set -uo pipefail
ROOT=$(git rev-parse --show-toplevel) || exit 1
exec node "$ROOT/scripts/test/check-brand-logo.mjs"
