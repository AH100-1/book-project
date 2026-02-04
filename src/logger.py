"""로깅 설정 모듈 - 파일 및 콘솔 동시 로깅 지원"""

from __future__ import annotations

import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional


_LOGGER_INITIALIZED = False
_DEFAULT_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def setup_logging(
    level: int = logging.INFO,
    log_file: Optional[str] = None,
    log_dir: Optional[str] = None,
    console: bool = True,
    file_level: Optional[int] = None,
    console_level: Optional[int] = None,
) -> logging.Logger:
    """
    로깅 설정을 초기화합니다.

    Args:
        level: 기본 로그 레벨
        log_file: 로그 파일 경로 (지정 시 해당 경로에 저장)
        log_dir: 로그 디렉토리 (log_file 미지정 시 자동 생성 파일명 사용)
        console: 콘솔 출력 여부
        file_level: 파일 로그 레벨 (None이면 level 사용)
        console_level: 콘솔 로그 레벨 (None이면 level 사용)

    Returns:
        루트 로거
    """
    global _LOGGER_INITIALIZED

    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    # 기존 핸들러 제거 (중복 방지)
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    formatter = logging.Formatter(_DEFAULT_FORMAT, datefmt=_DATE_FORMAT)

    # 콘솔 핸들러
    if console:
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(console_level or level)
        console_handler.setFormatter(formatter)
        root_logger.addHandler(console_handler)

    # 파일 핸들러
    if log_file or log_dir:
        if log_file:
            file_path = Path(log_file)
        else:
            log_dir_path = Path(log_dir) if log_dir else Path("logs")
            log_dir_path.mkdir(parents=True, exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            file_path = log_dir_path / f"book_project_{timestamp}.log"

        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(file_path, encoding="utf-8")
        file_handler.setLevel(file_level or level)
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)

        root_logger.info(f"로그 파일: {file_path}")

    _LOGGER_INITIALIZED = True
    return root_logger


def get_logger(name: str) -> logging.Logger:
    """
    모듈별 로거를 가져옵니다.

    Args:
        name: 로거 이름 (보통 __name__ 사용)

    Returns:
        해당 이름의 로거
    """
    return logging.getLogger(name)


class LoggerMixin:
    """로깅 기능을 클래스에 추가하는 믹스인"""

    @property
    def logger(self) -> logging.Logger:
        if not hasattr(self, "_logger"):
            self._logger = get_logger(self.__class__.__name__)
        return self._logger
