"""독서로 ISBN 존재여부 자동 검증 메인 모듈 - API 버전"""

from __future__ import annotations

import argparse
import sys
import logging
from typing import Optional

from tqdm import tqdm

from src.config import Settings
from src.logger import setup_logging, get_logger
from src.cache import ResultCache
from src.aladin_api import AladinClient
from src.read365_api import Read365APIClient, get_prov_code
from src.excel_io import read_input_excel, init_output_df, write_output_row, save_excel
from src.exceptions import (
    BookProjectError,
    ISBNSearchError,
    MissingConfigError,
)

logger = get_logger(__name__)


def parse_args() -> argparse.Namespace:
    """커맨드라인 인수를 파싱합니다."""
    p = argparse.ArgumentParser(description="독서로 ISBN 존재여부 자동 검증 (API 버전)")
    p.add_argument("--input", required=True, help="입력 엑셀 경로(도서견적서.xlsx)")
    p.add_argument("--output", required=True, help="출력 엑셀 경로")
    p.add_argument("--region", default=None, help="지역명 (기본 .env)")
    p.add_argument("--level", default=None, help="학교급 (기본 .env)")
    p.add_argument("--log-file", default=None, help="로그 파일 경로")
    p.add_argument("--log-dir", default="logs", help="로그 디렉토리 (기본: logs)")
    p.add_argument("--verbose", "-v", action="store_true", help="상세 로그 출력")
    return p.parse_args()


def main() -> int:
    """메인 실행 함수"""
    args = parse_args()
    settings = Settings.load()

    # 로깅 설정
    log_level = logging.DEBUG if args.verbose else logging.INFO
    setup_logging(
        level=log_level,
        log_file=args.log_file,
        log_dir=args.log_dir if not args.log_file else None,
        console=True,
    )

    logger.info("=== 독서로 ISBN 검증 시작 (API 버전) ===")

    region = args.region or settings.region_name
    level = args.level or settings.school_level

    if not settings.aladin_ttb_key:
        logger.error("ALADIN_TTB_KEY가 설정되어 있지 않습니다(.env)")
        print("ERROR: ALADIN_TTB_KEY 가 설정되어 있지 않습니다(.env).", file=sys.stderr)
        return 2

    # 지역 코드 변환
    prov_code = get_prov_code(region)
    if not prov_code:
        logger.warning(f"지역 코드를 찾을 수 없음: {region}, 전국 검색으로 진행")
        prov_code = None

    logger.info(f"설정: region={region} (code={prov_code}), level={level}")

    df_in = read_input_excel(args.input)
    n = len(df_in)
    logger.info(f"입력 파일: {args.input} ({n}권)")
    print(f"총 {n}권 처리 시작…")

    df_out = init_output_df(n)
    cache = ResultCache()

    aladin = AladinClient(
        ttb_key=settings.aladin_ttb_key,
        request_timeout=settings.request_timeout
    )

    api_client = Read365APIClient(
        timeout=settings.request_timeout,
        max_retries=3,
    )

    try:
        batch_every = settings.batch_save_every

        for i in tqdm(range(n), desc="Processing", unit="book"):
            row = df_in.iloc[i]
            school = str(row.get("학교명", "") or "").strip()
            title = str(row.get("도서명", "") or "").strip()
            author = str(row.get("저자", "") or "").strip()
            publisher = str(row.get("출판사", "") or "").strip()

            log_prefix = f"[{i+1}/{n}] {school} | {title}"

            isbn13: Optional[str] = None
            reason: str = ""

            # === ISBN 캐시 확인 ===
            cached_isbn = cache.get_isbn(title, author)
            if cached_isbn is not None:
                isbn13 = cached_isbn.isbn13
                if cached_isbn.error:
                    reason = cached_isbn.error
                logger.debug(f"{log_prefix} | ISBN 캐시 히트: {isbn13}")
            else:
                # === 알라딘 API로 ISBN 검색 ===
                try:
                    isbn13, err = aladin.search_isbn_by_title_author(title, author, threshold=0.6)
                    cache.set_isbn(title, author, isbn13, err)
                    if not isbn13:
                        print(f"{log_prefix} | MISS_ISBN '{title}' / '{author}'")
                        reason = "알라딘 ISBN 미확인" if not err else f"알라딘 ISBN 미확인 ({err})"
                    else:
                        print(f"{log_prefix} | ISBN={isbn13}")
                except Exception as e:
                    reason = f"알라딘 오류: {e}"
                    cache.set_isbn(title, author, None, reason)
                    logger.error(f"{log_prefix} | 알라딘 오류: {e}")
                    print(f"{log_prefix} | MISS_ISBN 오류: {e}")

            items = 0
            exists_mark = "❌"
            matched_school_name: Optional[str] = None

            if isbn13:
                # === 검색 결과 캐시 확인 ===
                cached_search = cache.get_search(school, isbn13)
                if cached_search is not None:
                    items = cached_search.item_count
                    exists_mark = "✅" if cached_search.exists else "❌"
                    matched_school_name = cached_search.matched_school
                    if cached_search.error:
                        reason = cached_search.error
                    logger.debug(f"{log_prefix} | 검색 캐시 히트: {exists_mark}")
                    print(f"{log_prefix} | ISBN={isbn13} -> items={items} {exists_mark} (캐시)")
                else:
                    # === Read365 API 검색 (여러 지역) ===
                    try:
                        # 주요 지역 코드 리스트 (전국 검색은 지원 안 됨)
                        major_regions = ["B10", "C10", "D10", "E10", "F10", "G10", "G10"]  # 서울, 부산, 대구, 인천, 광주, 대전, 경기
                        
                        all_books = []
                        total_items = 0
                        
                        # 여러 지역에서 검색 (모든 페이지)
                        for region_code in major_regions:
                            books = api_client.search_isbn_all_pages(
                                isbn=isbn13,
                                prov_code=region_code,
                            )

                            total_items += len(books)
                            all_books.extend(books)
                        
                        # 특정 학교에서 보유한 도서 찾기
                        school_books = []
                        if all_books:
                            school_name_normalized = school.replace(" ", "").lower()
                            for book in all_books:
                                book_school = book.get("schoolName", "")
                                book_school_normalized = book_school.replace(" ", "").lower()
                                
                                # 학교명이 포함되어 있는지 확인
                                if school_name_normalized in book_school_normalized:
                                    school_books.append(book)
                                    if not matched_school_name:
                                        matched_school_name = book_school
                        
                        school_items = len(school_books)
                        exists = school_items > 0
                        exists_mark = "✅" if exists else "❌"
                        
                        cache.set_search(school, isbn13, exists, school_items, matched_school_name)
                        
                        if exists:
                            print(f"{log_prefix} | ISBN={isbn13} -> {matched_school_name}에 {school_items}권 보유 ✅")
                        else:
                            print(f"{log_prefix} | ISBN={isbn13} -> {school}에 없음 (주요지역 {total_items}권) ❌")
                            if total_items == 0:
                                reason = "주요 지역에 등록된 도서 없음"
                            else:
                                reason = f"{school}에 없음 (타 학교 {total_items}권 보유)"
                        
                    except ISBNSearchError as e:
                        reason = f"ISBN 검색 실패: {e}"
                        cache.set_search(school, isbn13, False, 0, error=reason)
                        logger.warning(f"{log_prefix} | {reason}")
                        print(f"{log_prefix} | ISBN={isbn13} -> items=0 ❌ (검색 오류)")
                    except Exception as e:
                        reason = f"검색 오류: {e}"
                        cache.set_search(school, isbn13, False, 0, error=reason)
                        logger.error(f"{log_prefix} | 예외: {e}")
                        print(f"{log_prefix} | ISBN={isbn13} -> items=0 ❌ (오류: {e})")
            else:
                exists_mark = "❌"

            write_output_row(
                df_out,
                i,
                {
                    "학교명": school,
                    "도서명": title,
                    "저자": author,
                    "출판사": publisher,
                    "ISBN13": isbn13 or "",
                    "검색학교": matched_school_name or school,
                    "존재여부": exists_mark,
                    "사유": reason,
                },
            )

            if (i + 1) % batch_every == 0:
                mid_path = args.output.replace('.xlsx', '') + "_중간.xlsx"
                save_excel(df_out, mid_path)
                logger.debug(f"중간 저장: {mid_path}")

        save_excel(df_out, args.output)
        logger.info(f"완료. 결과 파일: {args.output}")
        print(f"완료. 결과 파일 → {args.output}")

        # 캐시 통계 출력
        cache.print_stats()

        return 0

    except KeyboardInterrupt:
        logger.warning("사용자에 의해 중단됨")
        print("\n중단됨.")
        return 130

    except BookProjectError as e:
        logger.error(f"오류: {e}")
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    except Exception as e:
        logger.exception(f"예상치 못한 오류: {e}")
        print(f"UNEXPECTED ERROR: {e}", file=sys.stderr)
        return 1

    finally:
        api_client.close()


if __name__ == "__main__":
    raise SystemExit(main())
