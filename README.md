# tool.front

**[tool.posselect.com](https://tool.posselect.com)** — PosSelect 개발자 도구 모음.

개발에 쓰는 도구·콘솔·문서 링크를 카드로 정리한 인덱스와, 그 안에서 도는 소도구들.

## 도구

| 도구 | 경로 | 설명 |
|------|------|------|
| QR 코드 생성기 | `/qr/` | URL 을 넣으면 그 주소로 연결되는 QR 코드를 만든다. PNG/SVG 저장, 이미지 복사 지원 |

생성은 전부 브라우저 안에서 처리된다 — 입력한 URL 이 서버로 전송되지 않는다.

## 로컬에서 보기

빌드 스텝이 없으므로 `site/` 를 아무 정적 서버로 띄우면 된다.

```bash
python3 -m http.server 8080 --directory site
```

## 검증

```bash
npm ci && bash scripts/verify.sh
```

- **QR 왕복 검증** — 생성한 QR 을 실제 디코더(jsQR)로 다시 읽어 원문과 일치하는지 본다.
  "화면에는 QR 처럼 보이는데 폰으로는 안 찍히는" 버그가 눈으로는 안 잡히기 때문이다.
- **죽은 링크 검사** — 페이지가 참조하는 로컬 자산이 실제로 있는지 본다.

## 구성

```
site/            정적 사이트 (이게 그대로 배포된다)
scripts/test/    검증 스크립트
nginx.conf       정적 서빙 설정
Dockerfile       nginx:alpine + site/
```

K8s 매니페스트는 이 저장소가 아니라 `~/msa/tool/posselect-tool-deployment.yaml` 에 있다.

## 배포

`main` push → 테스트 → Docker Hub → self-hosted runner 가 K3s `tool` 네임스페이스의
`posselect-tool` Deployment 를 갱신한다. **main push 는 곧 프로덕션 배포다.**

도구를 추가하거나 고칠 때 지켜야 할 것은 [AGENTS.md](AGENTS.md) 에 있다.
