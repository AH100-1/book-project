"""엑셀 I/O 유틸리티 모듈"""

from __future__ import annotations

import pandas as pd
from pathlib import Path

from src.logger import get_logger
from src.exceptions import ExcelReadError, ExcelWriteError, MissingColumnError

logger = get_logger(__name__)

INPUT_COLUMNS = ["학교명", "도서명", "저자", "출판사"]
OUTPUT_COLUMNS = [
    "학교명",
    "도서명",
    "저자",
    "출판사",
    "ISBN13",
    "검색학교",
    "존재여부",
    "사유",
]


def read_input_excel(path: str) -> pd.DataFrame:
    """
    입력 엑셀 파일을 읽습니다.

    Args:
        path: 엑셀 파일 경로

    Returns:
        도서 정보가 담긴 DataFrame

    Raises:
        ExcelReadError: 파일 읽기 실패 시
    """
    logger.info(f"입력 파일 읽기: {path}")

    if not Path(path).exists():
        raise ExcelReadError(path, "파일이 존재하지 않습니다")

    try:
        df = pd.read_excel(path, dtype=str, engine="openpyxl")
    except Exception as e:
        logger.error(f"엑셀 읽기 실패: {path} - {e}")
        raise ExcelReadError(path, str(e))

    # 누락된 열 확인 및 추가
    missing_cols = [col for col in INPUT_COLUMNS if col not in df.columns]
    if missing_cols:
        logger.warning(f"누락된 열 (빈 값으로 추가됨): {missing_cols}")
        for col in missing_cols:
            df[col] = ""

    df = df[INPUT_COLUMNS].fillna("")
    logger.info(f"읽기 완료: {len(df)}행")
    return df


def init_output_df(rows: int) -> pd.DataFrame:
    """
    출력용 빈 DataFrame을 생성합니다.

    Args:
        rows: 행 개수

    Returns:
        빈 출력 DataFrame
    """
    df = pd.DataFrame(columns=OUTPUT_COLUMNS)
    df = df.reindex(range(rows))
    logger.debug(f"출력 DataFrame 초기화: {rows}행")
    return df


def write_output_row(df: pd.DataFrame, idx: int, row: dict) -> None:
    """
    출력 DataFrame에 한 행을 기록합니다.

    Args:
        df: 출력 DataFrame
        idx: 행 인덱스
        row: 열 이름을 키로 하는 딕셔너리
    """
    for col in OUTPUT_COLUMNS:
        df.at[idx, col] = row.get(col, "")


def save_excel(df: pd.DataFrame, path: str) -> None:
    """
    DataFrame을 엑셀 파일로 저장합니다.

    Args:
        df: 저장할 DataFrame
        path: 출력 파일 경로

    Raises:
        ExcelWriteError: 파일 쓰기 실패 시
    """
    try:
        # 부모 디렉토리 생성
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        df.to_excel(path, index=False, engine="openpyxl")
        logger.info(f"엑셀 저장 완료: {path}")
    except Exception as e:
        logger.error(f"엑셀 저장 실패: {path} - {e}")
        raise ExcelWriteError(path, str(e))
