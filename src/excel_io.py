from __future__ import annotations

import pandas as pd
from typing import Iterable

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
    df = pd.read_excel(path, dtype=str, engine="openpyxl")
    for col in INPUT_COLUMNS:
        if col not in df.columns:
            df[col] = ""
    df = df[INPUT_COLUMNS].fillna("")
    return df


def init_output_df(rows: int) -> pd.DataFrame:
    df = pd.DataFrame(columns=OUTPUT_COLUMNS)
    df = df.reindex(range(rows))
    return df


def write_output_row(df: pd.DataFrame, idx: int, row: dict) -> None:
    for col in OUTPUT_COLUMNS:
        df.at[idx, col] = row.get(col, "")


def save_excel(df: pd.DataFrame, path: str) -> None:
    df.to_excel(path, index=False, engine="openpyxl")

