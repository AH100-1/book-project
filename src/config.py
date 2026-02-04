"""설정 관리 모듈"""

import os
from dataclasses import dataclass
from dotenv import load_dotenv, find_dotenv
from pathlib import Path

from src.exceptions import MissingConfigError


def _to_bool(value: str | None, default: bool) -> bool:
    """문자열을 불리언으로 변환"""
    if value is None:
        return default
    v = value.strip().lower()
    return v in ("1", "true", "yes", "y", "on")


@dataclass
class Settings:
    """애플리케이션 설정"""

    # API 설정
    aladin_ttb_key: str
    request_timeout: int

    # 기본 검색 설정
    region_name: str
    school_level: str

    # 브라우저 설정
    headless: bool
    window_width: int
    window_height: int

    # Selenium 설정
    selenium_implicit_wait: int
    selenium_explicit_wait: int
    scroll_repeats: int
    scroll_interval_ms: int

    # 배치 설정
    batch_save_every: int

    # 로그 설정
    log_level: str
    log_dir: str

    @staticmethod
    def load() -> "Settings":
        """환경 변수에서 설정을 로드합니다."""
        # 1) 현재 작업 디렉터리 기준 탐색
        env_path = find_dotenv(filename=".env", usecwd=True)

        # 2) 실패 시 프로젝트 루트 추정 경로 재시도
        if not env_path:
            here = Path(__file__).resolve()
            candidate = (here.parent.parent / ".env").as_posix()
            if Path(candidate).exists():
                env_path = candidate

        # 3) 최종 로드 (UTF-8, .env 값이 우선)
        if env_path:
            load_dotenv(dotenv_path=env_path, override=True, encoding="utf-8")
        else:
            load_dotenv(override=True, encoding="utf-8")

        return Settings(
            # API
            aladin_ttb_key=os.getenv("ALADIN_TTB_KEY", ""),
            request_timeout=int(os.getenv("REQUEST_TIMEOUT", "12")),

            # 기본 검색
            region_name=os.getenv("REGION_NAME", ""),
            school_level=os.getenv("SCHOOL_LEVEL", ""),

            # 브라우저
            headless=_to_bool(os.getenv("HEADLESS", "false"), False),
            window_width=int(os.getenv("WINDOW_WIDTH", "1400")),
            window_height=int(os.getenv("WINDOW_HEIGHT", "900")),

            # Selenium
            selenium_implicit_wait=int(os.getenv("SELENIUM_IMPLICIT_WAIT", "2")),
            selenium_explicit_wait=int(os.getenv("SELENIUM_EXPLICIT_WAIT", "15")),
            scroll_repeats=int(os.getenv("SCROLL_REPEATS", "7")),
            scroll_interval_ms=int(os.getenv("SCROLL_INTERVAL_MS", "400")),

            # 배치
            batch_save_every=int(os.getenv("BATCH_SAVE_EVERY", "10")),

            # 로그
            log_level=os.getenv("LOG_LEVEL", "INFO"),
            log_dir=os.getenv("LOG_DIR", "logs"),
        )

    def validate(self) -> None:
        """필수 설정 검증"""
        if not self.aladin_ttb_key:
            raise MissingConfigError("ALADIN_TTB_KEY")
