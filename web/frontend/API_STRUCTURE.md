# API 구조 문서

## 개요

Next.js API Routes를 사용하여 프론트엔드와 백엔드를 단일 애플리케이션으로 통합.
별도의 백엔드 서버 없이 `pnpm dev` 하나로 실행.

---

## 디렉토리 구조

```
src/
├── app/
│   ├── api/                          # API 엔드포인트
│   │   ├── regions/route.ts          # GET  /api/regions
│   │   ├── school-levels/route.ts    # GET  /api/school-levels
│   │   ├── settings/route.ts         # GET  /api/settings
│   │   ├── upload/route.ts           # POST /api/upload
│   │   ├── verify/[fileId]/route.ts  # POST /api/verify/:fileId
│   │   ├── jobs/
│   │   │   ├── route.ts              # GET  /api/jobs
│   │   │   └── [jobId]/route.ts      # GET  /api/jobs/:jobId
│   │   ├── download/[filename]/route.ts  # GET /api/download/:filename
│   │   └── search/
│   │       ├── aladin/route.ts       # POST /api/search/aladin
│   │       ├── book/route.ts         # POST /api/search/book
│   │       └── isbn/route.ts         # POST /api/search/isbn
│   └── page.tsx                      # 메인 UI
│
└── lib/                              # 공통 비즈니스 로직
    ├── aladin.ts                     # 알라딘 API 클라이언트
    ├── read365.ts                    # 독서로 API 클라이언트
    ├── cache.ts                      # ISBN 캐시
    ├── excel.ts                      # 엑셀 처리
    └── store.ts                      # 메모리 저장소
```

---

## API 엔드포인트

### 1. 설정 관련

#### GET /api/regions
지역 목록 조회

**Response:**
```json
{
  "regions": ["전체", "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]
}
```

#### GET /api/school-levels
학교급 목록 조회

**Response:**
```json
{
  "school_levels": ["초등학교", "중학교", "고등학교"]
}
```

#### GET /api/settings
기본 설정 조회

**Response:**
```json
{
  "default_region": "경기",
  "default_school_level": "초등학교"
}
```

---

### 2. 파일 업로드/검증 (파일 모드)

#### POST /api/upload
엑셀 파일 업로드

**Request:** `multipart/form-data`
- `file`: xlsx 파일

**Response:**
```json
{
  "file_id": "uuid-string",
  "filename": "도서목록.xlsx",
  "row_count": 150,
  "preview": [
    {"학교명": "OO초등학교", "도서명": "책제목", "저자": "저자명", "출판사": "출판사"}
  ]
}
```

#### POST /api/verify/:fileId
업로드된 파일 검증 시작

**Request:**
```json
{
  "region": "경기",
  "school_level": "초등학교"
}
```

**Response:**
```json
{
  "job_id": "uuid-string",
  "status": "processing",
  "message": "검증 작업이 시작되었습니다"
}
```

#### GET /api/jobs/:jobId
작업 상태 조회

**Response (진행 중):**
```json
{
  "job_id": "uuid-string",
  "status": "processing",
  "progress": 45,
  "total": 150,
  "current_book": "현재 처리 중인 책 제목"
}
```

**Response (완료):**
```json
{
  "job_id": "uuid-string",
  "status": "completed",
  "progress": 150,
  "total": 150,
  "result_file": "result_uuid-string",
  "summary": {
    "total": 150,
    "found": 120,
    "not_found": 30
  }
}
```

#### GET /api/download/:filename
결과 엑셀 파일 다운로드

**Response:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

### 3. 검색 관련 (수동 입력 모드)

#### POST /api/search/aladin
알라딘에서 제목/저자로 ISBN 검색

**Request:**
```json
{
  "title": "책 제목",
  "author": "저자명"
}
```

**Response:**
```json
{
  "isbn13": "9788901234567",
  "error": null
}
```

#### POST /api/search/isbn
독서로에서 ISBN으로 도서 검색

**Request:**
```json
{
  "isbn": "9788901234567",
  "region": "경기"
}
```

**Response:**
```json
{
  "total_count": 25,
  "books": [
    {
      "title": "책 제목",
      "author": "저자명",
      "schoolName": "OO초등학교",
      "provName": "경기도"
    }
  ]
}
```

#### POST /api/search/book
도서명으로 통합 검색 (알라딘 ISBN 조회 → 독서로 검색)

**Request:**
```json
{
  "title": "책 제목",
  "author": "저자명",
  "school_name": "OO초등학교",
  "region": "경기"
}
```

**Response:**
```json
{
  "isbn13": "9788901234567",
  "found": true,
  "matched_school": "OO초등학교",
  "total_count": 25,
  "error": null
}
```

---

## Lib 모듈 설명

### aladin.ts
알라딘 Open API를 사용하여 도서 정보 검색

```typescript
// 제목과 저자로 ISBN 검색 (유사도 매칭 사용)
searchISBNByTitleAuthor(ttbKey, title, author, threshold)
```

- `fuzzball` 라이브러리로 유사도 계산
- 제목 70%, 저자 30% 가중치
- threshold (기본 0.6) 이상일 때만 결과 반환

### read365.ts
독서로(Read365) API 클라이언트

```typescript
// 지역 코드 매핑
REGION_CODE_MAP: { '서울': 'B10', '경기': 'J10', ... }

// ISBN으로 검색
searchISBN(isbn, provCode, page, pageSize)

// 여러 지역 동시 검색
searchISBNMultiRegion(isbn, primaryRegion, maxRegions)

// 학교별 도서 필터링
findSchoolBooks(books, schoolName)
```

### cache.ts
메모리 기반 캐시 (TTL: 1시간)

```typescript
// ISBN 검색 결과 캐싱
setISBNCache(title, author, isbn)
getISBNCache(title, author)

// 독서로 검색 결과 캐싱
setSearchCache(isbn, region, result)
getSearchCache(isbn, region)
```

### excel.ts
엑셀 파일 처리

```typescript
// 엑셀 파일 읽기
readExcelBuffer(buffer): BookRow[]

// 결과 엑셀 생성
createResultExcel(results): Uint8Array

// 미리보기 데이터 추출
getPreview(rows, limit)
```

**입력 컬럼:** 학교명, 도서명, 저자, 출판사
**출력 컬럼:** 학교명, 도서명, 저자, 출판사, ISBN13, 검색학교, 존재여부, 사유

### store.ts
메모리 저장소 (업로드 파일, 작업 상태)

```typescript
// 파일 저장/조회
saveFile(fileId, data)
getFile(fileId)

// 작업 저장/조회/업데이트
createJob(jobId, fileId, settings)
getJob(jobId)
updateJob(jobId, updates)
```

---

## 프론트엔드 API 호출

```typescript
// page.tsx
const API_URL = "";  // 같은 origin (Next.js API Routes)

// 설정 로드
const [regions, schoolLevels, settings] = await Promise.all([
  fetch(`${API_URL}/api/regions`).then(r => r.json()),
  fetch(`${API_URL}/api/school-levels`).then(r => r.json()),
  fetch(`${API_URL}/api/settings`).then(r => r.json()),
]);

// 파일 업로드
const formData = new FormData();
formData.append('file', file);
const res = await fetch(`${API_URL}/api/upload`, {
  method: 'POST',
  body: formData,
});

// 검증 시작
await fetch(`${API_URL}/api/verify/${fileId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ region, school_level }),
});

// 작업 상태 폴링
const jobRes = await fetch(`${API_URL}/api/jobs/${jobId}`);

// 결과 다운로드
window.open(`${API_URL}/api/download/${resultFile}`, '_blank');
```

---

## 환경 변수

`.env.local`:
```
ALADIN_TTB_KEY=ttbxxxxxx    # 알라딘 API 키 (필수)
DEFAULT_REGION=경기          # 기본 지역
DEFAULT_SCHOOL_LEVEL=초등학교  # 기본 학교급
```

---

## 실행 방법

```bash
cd web/frontend
pnpm install
pnpm dev        # 개발 모드 (http://localhost:3000)
pnpm build      # 프로덕션 빌드
pnpm start      # 프로덕션 실행
```

---

## 배포 (Vercel)

1. GitHub 저장소 연결
2. Root Directory: `web/frontend`
3. 환경 변수 설정: `ALADIN_TTB_KEY`
4. 자동 배포
