#!/bin/bash

# 프론트엔드 빌드 스크립트
# 사용법: ./build.sh [환경]
#   환경: dev (기본값), prod, staging

set -e

# 환경 설정
ENV=${1:-prod}

echo "=========================================="
echo "Frontend Build Script"
echo "=========================================="
echo ""
echo "Environment: $ENV"
echo ""

# 프로젝트 디렉토리로 이동
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 환경별 API URL 설정
case $ENV in
  dev)
    export VITE_API_BASE_URL="http://localhost:8000"
    echo "API URL: http://localhost:8000 (개발 환경)"
    ;;
  prod)
    export VITE_API_BASE_URL="/api"
    echo "API URL: /api (프로덕션 - nginx proxy 사용)"
    ;;
  staging)
    export VITE_API_BASE_URL="https://api-staging.example.com"
    echo "API URL: https://api-staging.example.com"
    ;;
  *)
    echo "지원하지 않는 환경입니다: $ENV"
    echo "사용 가능한 환경: dev, prod, staging"
    exit 1
    ;;
esac

echo ""

# Node.js 버전 확인
if ! command -v node &> /dev/null; then
    echo "오류: Node.js가 설치되어 있지 않습니다."
    echo "Node.js 설치: https://nodejs.org/"
    exit 1
fi

echo "[1/4] Node.js 버전 확인"
echo "Node.js: $(node -v)"
echo "npm: $(npm -v)"
echo ""

# 의존성 설치
echo "[2/4] 의존성 설치"
if [ ! -d "node_modules" ]; then
    echo "node_modules가 없습니다. npm install 실행..."
    npm install
else
    echo "node_modules가 이미 존재합니다. (스킵)"
    echo "새로 설치하려면: rm -rf node_modules && npm install"
fi
echo ""

# 기존 빌드 삭제
echo "[3/4] 기존 빌드 파일 삭제"
if [ -d "dist" ]; then
    rm -rf dist
    echo "기존 dist/ 폴더 삭제 완료"
else
    echo "기존 빌드 파일 없음"
fi
echo ""

# 빌드 실행
echo "[4/4] 빌드 실행"
npm run build

if [ ! -d "dist" ]; then
    echo ""
    echo "오류: 빌드 실패 - dist/ 폴더가 생성되지 않았습니다."
    exit 1
fi

# 빌드 결과 확인
echo ""
echo "=========================================="
echo "빌드 완료!"
echo "=========================================="
echo ""
echo "빌드 결과: $(pwd)/dist"
echo ""
echo "빌드된 파일 목록:"
ls -lh dist/
echo ""
echo "다음 단계:"
echo ""

case $ENV in
  dev)
    echo "  로컬에서 테스트:"
    echo "  $ npm run preview"
    ;;
  prod)
    echo "  1. 서버에 배포:"
    echo "     $ tar -czf photo-frontend.tar.gz dist/ nginx.conf deploy.sh"
    echo "     $ scp photo-frontend.tar.gz user@server:/opt/photo-frontend/"
    echo ""
    echo "  2. 또는 CDN에 업로드:"
    echo "     $ cd dist && [CDN 업로드 명령]"
    echo ""
    echo "  3. 로컬에서 미리 확인:"
    echo "     $ npm run preview"
    ;;
  staging)
    echo "  스테이징 서버에 배포"
    ;;
esac

echo ""
