# tool.posselect.com — 빌드 스텝이 없는 순수 정적 사이트.
#
# npm 은 개발용 회귀 테스트(scripts/test/qr-roundtrip.mjs)에만 쓰고 런타임 산출물에는
# 관여하지 않는다. 그래서 멀티스테이지 빌드가 필요 없고, site/ 를 그대로 얹으면 끝이다.
# QR 라이브러리는 site/assets/vendor/ 에 사본으로 들어 있어 빌드 시 네트워크도 타지 않는다.
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY site/ /usr/share/nginx/html/

EXPOSE 80
