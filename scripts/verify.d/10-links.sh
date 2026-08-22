#!/usr/bin/env bash
# 정적 사이트 무결성 검사 — 페이지가 참조하는 로컬 파일이 실제로 있는지 본다.
#
# 이 저장소는 링크를 모아 두는 게 존재 이유라, 오타 하나가 곧 죽은 링크다. 빌드 스텝이
# 없어서 번들러가 대신 잡아 주지도 않는다(참조가 틀려도 그냥 404 로 배포된다).
# 네트워크는 쓰지 않는다 — 외부 링크 생존 확인은 결정적이지 않아 검증에 넣지 않는다.
set -uo pipefail
ROOT=$(git rev-parse --show-toplevel) || exit 1
exec node "$ROOT/scripts/test/check-links.mjs"
