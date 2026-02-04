from __future__ import annotations

import argparse
import sys
from typing import Optional

from tqdm import tqdm

from src.config import Settings
from src.aladin_api import AladinClient
from src.read365_bot import Read365Bot
from src.excel_io import read_input_excel, init_output_df, write_output_row, save_excel


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="독서로 ISBN 존재여부 자동 검증")
    p.add_argument("--input", required=True, help="입력 엑셀 경로(도서견적서.xlsx)")
    p.add_argument("--output", required=True, help="출력 엑셀 경로")
    p.add_argument("--region", default=None, help="지역명 (기본 .env)")
    p.add_argument("--level", default=None, help="학교급 (기본 .env)")
    p.add_argument("--headless", default=None, help="true/false (기본 .env)")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    settings = Settings.load()

    region = args.region or settings.region_name
    level = args.level or settings.school_level
    headless = settings.headless if args.headless is None else str(args.headless).lower() in ("1", "true", "yes", "y", "on")

    if not settings.aladin_ttb_key:
        print("ERROR: ALADIN_TTB_KEY 가 설정되어 있지 않습니다(.env).", file=sys.stderr)
        return 2

    df_in = read_input_excel(args.input)
    n = len(df_in)
    print(f"총 {n}권 처리 시작…")

    df_out = init_output_df(n)

    aladin = AladinClient(ttb_key=settings.aladin_ttb_key, request_timeout=settings.request_timeout)

    bot = Read365Bot(
        headless=headless,
        window_width=settings.window_width,
        window_height=settings.window_height,
        implicit_wait=settings.selenium_implicit_wait,
        explicit_wait=settings.selenium_explicit_wait,
        scroll_repeats=settings.scroll_repeats,
        scroll_interval_ms=settings.scroll_interval_ms,
    )

    try:
        bot.start()
        bot.select_our_school_tab()
        bot.set_region_and_level(region, level)

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

            try:
                isbn13, err = aladin.search_isbn_by_title_author(title, author, threshold=0.6)
                if not isbn13:
                    print(f"{log_prefix} | MISS_ISBN '{title}' / '{author}'")
                    reason = "알라딘 ISBN 미확인" if not err else f"알라딘 ISBN 미확인 ({err})"
                else:
                    print(f"{log_prefix} | ISBN={isbn13}")
            except Exception as e:
                reason = f"알라딘 오류: {e}"
                print(f"{log_prefix} | MISS_ISBN 오류: {e}")

            items = 0
            exists_mark = "❌"
            matched_school_name: Optional[str] = None

            if isbn13:
                try:
                    current_url, matched_school_name = bot.search_school(school, school_level=level)
                    bot.search_isbn(isbn13)
                    bot.scroll_results()
                    items = bot.count_items()
                    exists_mark = "✅" if items > 0 else "❌"
                    print(f"{log_prefix} | ISBN={isbn13} -> items={items} {exists_mark}")
                except Exception as e:
                    reason = f"검색 오류/미로딩: {e}"
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

        save_excel(df_out, args.output)
        print(f"완료. 결과 파일 → {args.output}")
        return 0
    finally:
        bot.close()


if __name__ == "__main__":
    raise SystemExit(main())

