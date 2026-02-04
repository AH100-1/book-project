"""엑셀 I/O 모듈 테스트"""

import pytest
import pandas as pd
from pathlib import Path
import tempfile
import os

from src.excel_io import (
    read_input_excel,
    init_output_df,
    write_output_row,
    save_excel,
    INPUT_COLUMNS,
    OUTPUT_COLUMNS,
)
from src.exceptions import ExcelReadError


class TestReadInputExcel:
    """read_input_excel 함수 테스트"""

    @pytest.fixture
    def sample_excel(self, tmp_path):
        """테스트용 샘플 엑셀 파일 생성"""
        df = pd.DataFrame({
            "학교명": ["금남초등학교", "서울중학교"],
            "도서명": ["해리포터", "반지의 제왕"],
            "저자": ["J.K. 롤링", "톨킨"],
            "출판사": ["문학수첩", "시공사"],
        })
        path = tmp_path / "test_input.xlsx"
        df.to_excel(path, index=False, engine="openpyxl")
        return str(path)

    def test_read_valid_excel(self, sample_excel):
        """정상적인 엑셀 파일 읽기"""
        df = read_input_excel(sample_excel)

        assert len(df) == 2
        assert list(df.columns) == INPUT_COLUMNS
        assert df.iloc[0]["학교명"] == "금남초등학교"
        assert df.iloc[0]["도서명"] == "해리포터"

    def test_read_nonexistent_file(self):
        """존재하지 않는 파일 읽기 시 에러"""
        with pytest.raises(ExcelReadError) as exc_info:
            read_input_excel("/nonexistent/path/file.xlsx")

        assert "파일이 존재하지 않습니다" in str(exc_info.value)

    def test_read_excel_with_missing_columns(self, tmp_path):
        """일부 열이 누락된 엑셀 파일 읽기"""
        df = pd.DataFrame({
            "학교명": ["테스트학교"],
            "도서명": ["테스트도서"],
            # 저자, 출판사 열 누락
        })
        path = tmp_path / "missing_cols.xlsx"
        df.to_excel(path, index=False, engine="openpyxl")

        result = read_input_excel(str(path))

        assert len(result) == 1
        assert result.iloc[0]["저자"] == ""
        assert result.iloc[0]["출판사"] == ""

    def test_read_excel_fills_na(self, tmp_path):
        """NaN 값이 빈 문자열로 채워지는지 확인"""
        df = pd.DataFrame({
            "학교명": ["학교1", None],
            "도서명": ["도서1", "도서2"],
            "저자": [None, "저자2"],
            "출판사": ["출판사1", None],
        })
        path = tmp_path / "with_na.xlsx"
        df.to_excel(path, index=False, engine="openpyxl")

        result = read_input_excel(str(path))

        assert result.iloc[0]["저자"] == ""
        assert result.iloc[1]["학교명"] == ""


class TestInitOutputDf:
    """init_output_df 함수 테스트"""

    def test_create_output_df(self):
        """출력 DataFrame 생성"""
        df = init_output_df(5)

        assert len(df) == 5
        assert list(df.columns) == OUTPUT_COLUMNS

    def test_output_df_empty_values(self):
        """생성된 DataFrame의 값이 비어있는지 확인"""
        df = init_output_df(3)

        # 모든 값이 NaN인지 확인
        assert df.isna().all().all()


class TestWriteOutputRow:
    """write_output_row 함수 테스트"""

    def test_write_row(self):
        """한 행 쓰기"""
        df = init_output_df(2)

        write_output_row(df, 0, {
            "학교명": "금남초등학교",
            "도서명": "해리포터",
            "저자": "J.K. 롤링",
            "출판사": "문학수첩",
            "ISBN13": "9788983920997",
            "검색학교": "금남초등학교",
            "존재여부": "✅",
            "사유": "",
        })

        assert df.iloc[0]["학교명"] == "금남초등학교"
        assert df.iloc[0]["ISBN13"] == "9788983920997"
        assert df.iloc[0]["존재여부"] == "✅"

    def test_write_row_partial_data(self):
        """일부 데이터만 있는 행 쓰기"""
        df = init_output_df(1)

        write_output_row(df, 0, {
            "학교명": "테스트학교",
            "도서명": "테스트도서",
        })

        assert df.iloc[0]["학교명"] == "테스트학교"
        assert df.iloc[0]["ISBN13"] == ""


class TestSaveExcel:
    """save_excel 함수 테스트"""

    def test_save_excel(self, tmp_path):
        """엑셀 파일 저장"""
        df = init_output_df(2)
        write_output_row(df, 0, {
            "학교명": "학교1",
            "도서명": "도서1",
            "저자": "저자1",
            "출판사": "출판사1",
            "ISBN13": "1234567890123",
            "검색학교": "학교1",
            "존재여부": "✅",
            "사유": "",
        })
        write_output_row(df, 1, {
            "학교명": "학교2",
            "도서명": "도서2",
            "저자": "저자2",
            "출판사": "출판사2",
            "ISBN13": "",
            "검색학교": "학교2",
            "존재여부": "❌",
            "사유": "테스트",
        })

        output_path = str(tmp_path / "output.xlsx")
        save_excel(df, output_path)

        assert Path(output_path).exists()

        # 저장된 파일 다시 읽기
        loaded = pd.read_excel(output_path, engine="openpyxl")
        assert len(loaded) == 2
        assert loaded.iloc[0]["학교명"] == "학교1"
        assert loaded.iloc[1]["학교명"] == "학교2"

    def test_save_creates_parent_dirs(self, tmp_path):
        """부모 디렉토리 자동 생성"""
        df = init_output_df(1)
        output_path = str(tmp_path / "subdir" / "deep" / "output.xlsx")

        save_excel(df, output_path)

        assert Path(output_path).exists()


class TestIntegration:
    """통합 테스트"""

    def test_full_workflow(self, tmp_path):
        """전체 워크플로우 테스트: 읽기 -> 처리 -> 저장"""
        # 1. 입력 파일 생성
        input_df = pd.DataFrame({
            "학교명": ["학교A", "학교B"],
            "도서명": ["도서1", "도서2"],
            "저자": ["저자1", "저자2"],
            "출판사": ["출판사1", "출판사2"],
        })
        input_path = str(tmp_path / "input.xlsx")
        input_df.to_excel(input_path, index=False, engine="openpyxl")

        # 2. 입력 읽기
        df_in = read_input_excel(input_path)
        assert len(df_in) == 2

        # 3. 출력 DataFrame 초기화
        df_out = init_output_df(len(df_in))

        # 4. 각 행 처리
        for i in range(len(df_in)):
            row = df_in.iloc[i]
            write_output_row(df_out, i, {
                "학교명": row["학교명"],
                "도서명": row["도서명"],
                "저자": row["저자"],
                "출판사": row["출판사"],
                "ISBN13": f"ISBN{i}",
                "검색학교": row["학교명"],
                "존재여부": "✅" if i == 0 else "❌",
                "사유": "" if i == 0 else "테스트 사유",
            })

        # 5. 저장
        output_path = str(tmp_path / "output.xlsx")
        save_excel(df_out, output_path)

        # 6. 결과 확인
        result = pd.read_excel(output_path, engine="openpyxl")
        assert len(result) == 2
        assert result.iloc[0]["존재여부"] == "✅"
        assert result.iloc[1]["존재여부"] == "❌"
        assert result.iloc[1]["사유"] == "테스트 사유"
