"""FastAPI 백엔드 서버 - 독서로 ISBN 검증 API (API 버전)"""

from __future__ import annotations

import asyncio
import uuid
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List
from enum import Enum
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

# 프로젝트 루트를 path에 추가
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.config import Settings
from src.cache import ResultCache
from src.aladin_api import AladinClient
from src.read365_api import Read365APIClient, get_prov_code, REGION_CODE_MAP
from src.excel_io import read_input_excel, init_output_df, write_output_row, save_excel
from src.logger import setup_logging, get_logger

# 로깅 설정
setup_logging(log_dir=str(PROJECT_ROOT / "logs"))
logger = get_logger(__name__)

app = FastAPI(
    title="독서로 ISBN 검증 API",
    description="학교 도서관 도서의 Read365 존재 여부를 검증하는 API (API 버전)",
    version="2.0.0",
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 지역 목록
REGIONS = [
    "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
    "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"
]

# 학교급 목록
SCHOOL_LEVELS = ["초등학교", "중학교", "고등학교"]

# 주요 지역 코드 (전국 검색용)
MAJOR_REGION_CODES = ["B10", "C10", "D10", "E10", "F10", "G10", "H10", "I10",
                      "J10", "K10", "M10", "N10", "P10", "Q10", "R10", "S10", "T10"]

# 작업 상태 저장소
jobs: Dict[str, Dict[str, Any]] = {}

# 업로드 디렉토리
UPLOAD_DIR = PROJECT_ROOT / "uploads"
OUTPUT_DIR = PROJECT_ROOT / "outputs"
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

# ThreadPoolExecutor for blocking I/O
executor = ThreadPoolExecutor(max_workers=4)


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class VerifyRequest(BaseModel):
    region: str
    school_level: str
    headless: bool = True  # API 방식에서는 무시됨


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    progress: int = 0
    total: int = 0
    message: str = ""
    result_file: Optional[str] = None
    created_at: str
    updated_at: str


class ISBNSearchRequest(BaseModel):
    isbn: str
    region: Optional[str] = None


class AladinSearchRequest(BaseModel):
    title: str
    author: Optional[str] = ""


class BookSearchRequest(BaseModel):
    isbn: str
    school: str
    region: Optional[str] = None


@app.get("/")
async def root():
    """API 상태 확인"""
    return {
        "status": "ok",
        "message": "독서로 ISBN 검증 API (API 버전)",
        "version": "2.0.0",
    }


@app.get("/api/regions")
async def get_regions():
    """지역 목록 반환"""
    return {"regions": REGIONS}


@app.get("/api/school-levels")
async def get_school_levels():
    """학교급 목록 반환"""
    return {"school_levels": SCHOOL_LEVELS}


@app.get("/api/settings")
async def get_settings():
    """현재 설정 반환"""
    settings = Settings.load()
    return {
        "region": settings.region_name,
        "school_level": settings.school_level,
        "headless": True,  # API 방식은 항상 headless
        "has_api_key": bool(settings.aladin_ttb_key),
        "mode": "api",  # API 모드 표시
    }


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """엑셀 파일 업로드"""
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="엑셀 파일(.xlsx, .xls)만 업로드 가능합니다")

    # 파일 저장
    file_id = str(uuid.uuid4())[:8]
    filename = f"{file_id}_{file.filename}"
    file_path = UPLOAD_DIR / filename

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # 파일 미리보기
    try:
        df = read_input_excel(str(file_path))
        preview = df.head(5).to_dict(orient="records")
        total_rows = len(df)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"파일 읽기 실패: {str(e)}")

    return {
        "file_id": file_id,
        "filename": filename,
        "total_rows": total_rows,
        "preview": preview,
    }


@app.post("/api/search/isbn")
async def search_isbn_direct(request: ISBNSearchRequest):
    """ISBN으로 직접 검색 (테스트용)"""
    try:
        api_client = Read365APIClient(timeout=30, max_retries=3)

        prov_code = get_prov_code(request.region) if request.region else None

        result = api_client.search_isbn(
            isbn=request.isbn,
            prov_code=prov_code,
            page=1,
            page_size=100,
        )

        api_client.close()

        return {
            "isbn": request.isbn,
            "region": request.region,
            "prov_code": prov_code,
            "total_count": result["total_count"],
            "books": result["books"][:10],  # 처음 10개만
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/search/aladin")
async def search_aladin(request: AladinSearchRequest):
    """알라딘 API로 ISBN 검색"""
    try:
        settings = Settings.load()

        if not settings.aladin_ttb_key:
            raise HTTPException(status_code=500, detail="ALADIN_TTB_KEY가 설정되지 않았습니다")

        aladin = AladinClient(
            ttb_key=settings.aladin_ttb_key,
            request_timeout=settings.request_timeout,
        )

        isbn13, error = await asyncio.get_event_loop().run_in_executor(
            executor,
            lambda: aladin.search_isbn_by_title_author(request.title, request.author or "", threshold=0.6)
        )

        return {
            "title": request.title,
            "author": request.author,
            "isbn13": isbn13,
            "error": error,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"알라딘 검색 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/search/book")
async def search_book(request: BookSearchRequest):
    """ISBN과 학교명으로 도서 검색"""
    try:
        api_client = Read365APIClient(timeout=30, max_retries=3)

        prov_code = get_prov_code(request.region) if request.region else None

        # 여러 주요 지역에서 검색
        all_books = []
        total_items = 0

        search_regions = [prov_code] if prov_code else []
        search_regions.extend([r for r in MAJOR_REGION_CODES if r not in search_regions])

        # 모든 지역 병렬 검색
        tasks = [
            asyncio.get_event_loop().run_in_executor(
                executor,
                lambda rc=region_code: api_client.search_isbn_all_pages(
                    isbn=request.isbn,
                    prov_code=rc,
                )
            )
            for region_code in search_regions
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Exception):
                logger.warning(f"지역 검색 실패: {result}")
                continue
            total_items += len(result)
            all_books.extend(result)

        api_client.close()

        # 특정 학교에서 보유한 도서 찾기
        school_books = []
        matched_school = None

        if all_books:
            school_name_normalized = request.school.replace(" ", "").lower()
            for book in all_books:
                book_school = book.get("schoolName", "") or ""
                book_school_normalized = book_school.replace(" ", "").lower()

                if school_name_normalized in book_school_normalized:
                    school_books.append(book)
                    if not matched_school:
                        matched_school = book_school

        exists = len(school_books) > 0

        return {
            "isbn": request.isbn,
            "school": request.school,
            "exists": exists,
            "school_count": len(school_books),
            "total_count": total_items,
            "matched_school": matched_school,
            "books": school_books[:5],  # 처음 5개만
        }
    except Exception as e:
        logger.error(f"도서 검색 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/verify/{file_id}")
async def start_verification(
    file_id: str,
    request: VerifyRequest,
    background_tasks: BackgroundTasks,
):
    """검증 작업 시작"""
    # 업로드된 파일 찾기
    files = list(UPLOAD_DIR.glob(f"{file_id}_*"))
    if not files:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")

    input_file = files[0]

    # 작업 생성
    job_id = str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()

    jobs[job_id] = {
        "job_id": job_id,
        "status": JobStatus.PENDING,
        "progress": 0,
        "total": 0,
        "message": "작업 대기 중...",
        "result_file": None,
        "input_file": str(input_file),
        "region": request.region,
        "school_level": request.school_level,
        "created_at": now,
        "updated_at": now,
    }

    # 백그라운드에서 실행
    background_tasks.add_task(run_verification_api, job_id)

    return {"job_id": job_id, "message": "작업이 시작되었습니다 (API 모드)"}


async def run_verification_api(job_id: str):
    """백그라운드에서 검증 작업 실행 (API 버전)"""
    job = jobs.get(job_id)
    if not job:
        return

    api_client = None

    try:
        job["status"] = JobStatus.RUNNING
        job["message"] = "초기화 중..."
        job["updated_at"] = datetime.now().isoformat()

        settings = Settings.load()

        if not settings.aladin_ttb_key:
            raise Exception("ALADIN_TTB_KEY가 설정되지 않았습니다")

        # 입력 파일 읽기
        df_in = read_input_excel(job["input_file"])
        n = len(df_in)
        job["total"] = n
        job["message"] = f"총 {n}권 처리 시작 (API 모드)..."

        df_out = init_output_df(n)
        cache = ResultCache()

        aladin = AladinClient(
            ttb_key=settings.aladin_ttb_key,
            request_timeout=settings.request_timeout,
        )

        # Read365 API 클라이언트 생성
        api_client = Read365APIClient(
            timeout=settings.request_timeout,
            max_retries=3,
        )

        # 지역 코드 변환
        region = job["region"]
        prov_code = get_prov_code(region)

        for i in range(n):
            row = df_in.iloc[i]
            school = str(row.get("학교명", "") or "").strip()
            title = str(row.get("도서명", "") or "").strip()
            author = str(row.get("저자", "") or "").strip()
            publisher = str(row.get("출판사", "") or "").strip()

            isbn13 = None
            reason = ""
            exists_mark = "❌"
            matched_school_name = None
            items = 0

            # === 1. ISBN 캐시 확인 ===
            cached_isbn = cache.get_isbn(title, author)
            if cached_isbn is not None:
                isbn13 = cached_isbn.isbn13
                if cached_isbn.error:
                    reason = cached_isbn.error
            else:
                # === 알라딘 API로 ISBN 검색 ===
                try:
                    isbn13, err = aladin.search_isbn_by_title_author(title, author, threshold=0.6)
                    cache.set_isbn(title, author, isbn13, err)
                    if not isbn13:
                        reason = f"알라딘 ISBN 미확인: {err or '알 수 없음'}"
                except Exception as e:
                    reason = f"알라딘 오류: {e}"
                    cache.set_isbn(title, author, None, reason)

            # === 2. Read365 API로 검색 ===
            if isbn13:
                cached_search = cache.get_search(school, isbn13)
                if cached_search is not None:
                    items = cached_search.item_count
                    exists_mark = "✅" if cached_search.exists else "❌"
                    matched_school_name = cached_search.matched_school
                    if cached_search.error:
                        reason = cached_search.error
                else:
                    try:
                        # 여러 주요 지역에서 검색
                        all_books = []
                        total_items = 0

                        # 지정된 지역 우선, 그 다음 주요 지역들
                        search_regions = [prov_code] if prov_code else []
                        search_regions.extend([r for r in MAJOR_REGION_CODES if r not in search_regions][:6])

                        for region_code in search_regions:
                            try:
                                books = await asyncio.get_event_loop().run_in_executor(
                                    executor,
                                    lambda rc=region_code: api_client.search_isbn_all_pages(
                                        isbn=isbn13,
                                        prov_code=rc,
                                    )
                                )
                                total_items += len(books)
                                all_books.extend(books)
                            except Exception as e:
                                logger.warning(f"지역 {region_code} 검색 실패: {e}")
                                continue

                        # 특정 학교에서 보유한 도서 찾기
                        school_books = []
                        if all_books:
                            school_name_normalized = school.replace(" ", "").lower()
                            for book in all_books:
                                book_school = book.get("schoolName", "") or ""
                                book_school_normalized = book_school.replace(" ", "").lower()

                                if school_name_normalized in book_school_normalized:
                                    school_books.append(book)
                                    if not matched_school_name:
                                        matched_school_name = book_school

                        items = len(school_books)
                        exists = items > 0
                        exists_mark = "✅" if exists else "❌"

                        cache.set_search(school, isbn13, exists, items, matched_school_name)

                        if not exists:
                            if total_items == 0:
                                reason = "주요 지역에 등록된 도서 없음"
                            else:
                                reason = f"{school}에 없음 (타 학교 {total_items}권 보유)"

                    except Exception as e:
                        reason = f"Read365 검색 오류: {e}"
                        cache.set_search(school, isbn13, False, 0, error=reason)
                        logger.error(f"Read365 검색 오류: {e}")

            # 결과 기록
            write_output_row(df_out, i, {
                "학교명": school,
                "도서명": title,
                "저자": author,
                "출판사": publisher,
                "ISBN13": isbn13 or "",
                "검색학교": matched_school_name or school,
                "존재여부": exists_mark,
                "사유": reason,
            })

            job["progress"] = i + 1
            job["message"] = f"처리 중: {i + 1}/{n} - {title[:20]}..."
            job["updated_at"] = datetime.now().isoformat()

            # 비동기 yield
            await asyncio.sleep(0.05)

        # 결과 저장
        output_filename = f"result_{job_id}.xlsx"
        output_path = OUTPUT_DIR / output_filename
        save_excel(df_out, str(output_path))

        job["status"] = JobStatus.COMPLETED
        job["message"] = f"완료! {n}권 처리됨 (API 모드)"
        job["result_file"] = output_filename
        job["updated_at"] = datetime.now().isoformat()

        # 캐시 통계
        stats = cache.get_stats()
        logger.info(f"작업 완료: {job_id}, 캐시 통계: {stats}")

    except Exception as e:
        logger.error(f"작업 실패: {job_id} - {e}")
        job["status"] = JobStatus.FAILED
        job["message"] = f"오류: {str(e)}"
        job["updated_at"] = datetime.now().isoformat()

    finally:
        if api_client:
            api_client.close()


@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str):
    """작업 상태 조회"""
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")

    return JobResponse(**{k: v for k, v in job.items() if k in JobResponse.model_fields})


@app.get("/api/jobs")
async def list_jobs():
    """모든 작업 목록"""
    return {
        "jobs": [
            JobResponse(**{k: v for k, v in job.items() if k in JobResponse.model_fields})
            for job in jobs.values()
        ]
    }


@app.delete("/api/jobs/{job_id}")
async def delete_job(job_id: str):
    """작업 삭제"""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")

    del jobs[job_id]
    return {"message": f"작업 {job_id} 삭제됨"}


@app.get("/api/download/{filename}")
async def download_result(filename: str):
    """결과 파일 다운로드"""
    file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")

    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
