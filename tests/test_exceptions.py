"""예외 클래스 테스트"""

import pytest
from src.exceptions import (
    BookProjectError,
    AladinError,
    AladinApiError,
    ISBNNotFoundError,
    SimilarityThresholdError,
    Read365Error,
    BrowserInitError,
    SchoolNotFoundError,
    ISBNSearchError,
    PageLoadError,
    ElementNotFoundError,
    ExcelError,
    ExcelReadError,
    ExcelWriteError,
    MissingColumnError,
    ConfigError,
    MissingConfigError,
)


class TestExceptionHierarchy:
    """예외 클래스 계층 구조 테스트"""

    def test_base_exception(self):
        """기본 예외 클래스 테스트"""
        exc = BookProjectError("test error")
        assert str(exc) == "test error"
        assert isinstance(exc, Exception)

    def test_aladin_errors_inherit_from_base(self):
        """알라딘 예외가 기본 예외를 상속하는지 확인"""
        assert issubclass(AladinError, BookProjectError)
        assert issubclass(AladinApiError, AladinError)
        assert issubclass(ISBNNotFoundError, AladinError)
        assert issubclass(SimilarityThresholdError, AladinError)

    def test_read365_errors_inherit_from_base(self):
        """Read365 예외가 기본 예외를 상속하는지 확인"""
        assert issubclass(Read365Error, BookProjectError)
        assert issubclass(BrowserInitError, Read365Error)
        assert issubclass(SchoolNotFoundError, Read365Error)
        assert issubclass(ISBNSearchError, Read365Error)
        assert issubclass(PageLoadError, Read365Error)
        assert issubclass(ElementNotFoundError, Read365Error)

    def test_excel_errors_inherit_from_base(self):
        """엑셀 예외가 기본 예외를 상속하는지 확인"""
        assert issubclass(ExcelError, BookProjectError)
        assert issubclass(ExcelReadError, ExcelError)
        assert issubclass(ExcelWriteError, ExcelError)
        assert issubclass(MissingColumnError, ExcelError)

    def test_config_errors_inherit_from_base(self):
        """설정 예외가 기본 예외를 상속하는지 확인"""
        assert issubclass(ConfigError, BookProjectError)
        assert issubclass(MissingConfigError, ConfigError)


class TestAladinExceptions:
    """알라딘 API 예외 테스트"""

    def test_aladin_api_error(self):
        """AladinApiError 테스트"""
        exc = AladinApiError("HTTP 500", status_code=500)
        assert "HTTP 500" in str(exc)
        assert exc.status_code == 500

    def test_aladin_api_error_without_status(self):
        """상태 코드 없는 AladinApiError 테스트"""
        exc = AladinApiError("Connection failed")
        assert exc.status_code is None

    def test_isbn_not_found_error(self):
        """ISBNNotFoundError 테스트"""
        exc = ISBNNotFoundError("해리포터", "J.K. 롤링", "유사도 미달")
        assert exc.title == "해리포터"
        assert exc.author == "J.K. 롤링"
        assert exc.reason == "유사도 미달"
        assert "해리포터" in str(exc)
        assert "유사도 미달" in str(exc)

    def test_similarity_threshold_error(self):
        """SimilarityThresholdError 테스트"""
        exc = SimilarityThresholdError("테스트 도서", 0.45, 0.6)
        assert exc.title == "테스트 도서"
        assert exc.score == 0.45
        assert exc.threshold == 0.6
        assert "0.45" in str(exc)
        assert "0.60" in str(exc)


class TestRead365Exceptions:
    """Read365 예외 테스트"""

    def test_browser_init_error(self):
        """BrowserInitError 테스트"""
        exc = BrowserInitError()
        assert "브라우저 초기화 실패" in str(exc)

        exc_custom = BrowserInitError("Chrome not found")
        assert "Chrome not found" in str(exc_custom)

    def test_school_not_found_error(self):
        """SchoolNotFoundError 테스트"""
        exc = SchoolNotFoundError("금남초등학교", "경기", "초등학교")
        assert exc.school_name == "금남초등학교"
        assert exc.region == "경기"
        assert exc.level == "초등학교"
        assert "금남초등학교" in str(exc)

    def test_isbn_search_error(self):
        """ISBNSearchError 테스트"""
        exc = ISBNSearchError("9788983920997", "타임아웃")
        assert exc.isbn == "9788983920997"
        assert "9788983920997" in str(exc)
        assert "타임아웃" in str(exc)

    def test_page_load_error(self):
        """PageLoadError 테스트"""
        exc = PageLoadError("https://example.com")
        assert exc.url == "https://example.com"
        assert "https://example.com" in str(exc)

    def test_element_not_found_error(self):
        """ElementNotFoundError 테스트"""
        exc = ElementNotFoundError("#submit-btn", "버튼")
        assert exc.selector == "#submit-btn"
        assert exc.element_type == "버튼"
        assert "버튼" in str(exc)


class TestExcelExceptions:
    """엑셀 예외 테스트"""

    def test_excel_read_error(self):
        """ExcelReadError 테스트"""
        exc = ExcelReadError("/path/to/file.xlsx", "파일 없음")
        assert exc.path == "/path/to/file.xlsx"
        assert "/path/to/file.xlsx" in str(exc)
        assert "파일 없음" in str(exc)

    def test_excel_write_error(self):
        """ExcelWriteError 테스트"""
        exc = ExcelWriteError("/path/to/output.xlsx")
        assert exc.path == "/path/to/output.xlsx"
        assert "/path/to/output.xlsx" in str(exc)

    def test_missing_column_error(self):
        """MissingColumnError 테스트"""
        exc = MissingColumnError(["학교명", "도서명"])
        assert exc.columns == ["학교명", "도서명"]
        assert "학교명" in str(exc)
        assert "도서명" in str(exc)


class TestConfigExceptions:
    """설정 예외 테스트"""

    def test_missing_config_error(self):
        """MissingConfigError 테스트"""
        exc = MissingConfigError("ALADIN_TTB_KEY")
        assert exc.key == "ALADIN_TTB_KEY"
        assert "ALADIN_TTB_KEY" in str(exc)
