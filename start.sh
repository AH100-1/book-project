#!/bin/bash

# 독서로 ISBN 검증 시스템 실행 스크립트

echo "🚀 독서로 ISBN 검증 시스템 시작..."

# 프로젝트 루트 디렉토리
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

# 필요한 디렉토리 생성
mkdir -p uploads outputs logs

# 백엔드 서버 시작 (포트 8000)
echo "📦 백엔드 서버 시작 (포트 8000)..."
cd "$PROJECT_ROOT"
python3 -m uvicorn web.backend.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# 프론트엔드 서버 시작 (포트 3000)
echo "🎨 프론트엔드 서버 시작 (포트 3000)..."
cd "$PROJECT_ROOT/web/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ 서버가 시작되었습니다!"
echo ""
echo "📍 프론트엔드: http://localhost:3000"
echo "📍 백엔드 API: http://localhost:8000"
echo "📍 API 문서: http://localhost:8000/docs"
echo ""
echo "종료하려면 Ctrl+C를 누르세요."

# 종료 시그널 처리
trap "echo '서버 종료 중...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM

# 대기
wait
