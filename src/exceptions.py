"""프로젝트 전용 예외 클래스 정의"""

from __future__ import annotations


class BookProjectError(Exception):
    """프로젝트 기본 예외 클래스"""
    pass


# === 알라딘 API 관련 예외 ===

class AladinError(BookProjectError):
    """알라딘 API 관련 기본 예외"""
    pass


class AladinApiError(AladinError):
    """알라딘 API HTTP 오류"""
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class ISBNNotFoundError(AladinError):
    """ISBN을 찾을 수 없음"""
    def __init__(self, title: str, author: str, reason: str = ""):
        self.title = title
        self.author = author
        self.reason = reason
        msg = f"ISBN 미확인: '{title}' / '{author}'"
        if reason:
            msg += f" ({reason})"
        super().__init__(msg)


class SimilarityThresholdError(AladinError):
    """유사도 기준 미달"""
    def __init__(self, title: str, score: float, threshold: float):
        self.title = title
        self.score = score
        self.threshold = threshold
        super().__init__(f"유사도 미달: {score:.2f} < {threshold:.2f} for '{title}'")


# === Read365 (독서로) 관련 예외 ===

class Read365Error(BookProjectError):
    """Read365 웹 자동화 관련 기본 예외"""
    pass


class BrowserInitError(Read365Error):
    """브라우저 초기화 실패"""
    def __init__(self, message: str = "브라우저 초기화 실패"):
        super().__init__(message)


class SchoolNotFoundError(Read365Error):
    """학교 검색 실패"""
    def __init__(self, school_name: str, region: str = "", level: str = ""):
        self.school_name = school_name
        self.region = region
        self.level = level
        msg = f"학교 미발견: '{school_name}'"
        if region or level:
            msg += f" ({region} {level})"
        super().__init__(msg)


class ISBNSearchError(Read365Error):
    """ISBN 검색 실패"""
    def __init__(self, isbn: str, message: str = ""):
        self.isbn = isbn
        msg = f"ISBN 검색 실패: {isbn}"
        if message:
            msg += f" - {message}"
        super().__init__(msg)


class PageLoadError(Read365Error):
    """페이지 로드 실패/타임아웃"""
    def __init__(self, url: str = "", message: str = "페이지 로드 실패"):
        self.url = url
        msg = message
        if url:
            msg += f": {url}"
        super().__init__(msg)


class ElementNotFoundError(Read365Error):
    """웹 요소를 찾을 수 없음"""
    def __init__(self, selector: str, element_type: str = "element"):
        self.selector = selector
        self.element_type = element_type
        super().__init__(f"{element_type} 미발견: {selector}")


# === 엑셀 관련 예외 ===

class ExcelError(BookProjectError):
    """엑셀 처리 관련 기본 예외"""
    pass


class ExcelReadError(ExcelError):
    """엑셀 읽기 실패"""
    def __init__(self, path: str, message: str = ""):
        self.path = path
        msg = f"엑셀 읽기 실패: {path}"
        if message:
            msg += f" - {message}"
        super().__init__(msg)


class ExcelWriteError(ExcelError):
    """엑셀 쓰기 실패"""
    def __init__(self, path: str, message: str = ""):
        self.path = path
        msg = f"엑셀 쓰기 실패: {path}"
        if message:
            msg += f" - {message}"
        super().__init__(msg)


class MissingColumnError(ExcelError):
    """필수 열 누락"""
    def __init__(self, columns: list[str]):
        self.columns = columns
        super().__init__(f"필수 열 누락: {', '.join(columns)}")


# === 설정 관련 예외 ===

class ConfigError(BookProjectError):
    """설정 관련 예외"""
    pass


class MissingConfigError(ConfigError):
    """필수 설정 누락"""
    def __init__(self, key: str):
        self.key = key
        super().__init__(f"필수 설정 누락: {key}")
