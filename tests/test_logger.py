"""로거 모듈 테스트"""

import pytest
import logging
from pathlib import Path
import tempfile

from src.logger import setup_logging, get_logger, LoggerMixin


class TestSetupLogging:
    """setup_logging 함수 테스트"""

    def test_setup_console_logging(self):
        """콘솔 로깅 설정"""
        logger = setup_logging(level=logging.INFO, console=True)

        assert logger is not None
        # 핸들러가 있는지 확인
        assert len(logger.handlers) > 0

    def test_setup_file_logging(self, tmp_path):
        """파일 로깅 설정"""
        log_file = str(tmp_path / "test.log")
        logger = setup_logging(level=logging.DEBUG, log_file=log_file, console=False)

        # 테스트 메시지 기록
        logger.info("테스트 메시지")

        # 파일이 생성되었는지 확인
        assert Path(log_file).exists()

        # 파일 내용 확인
        content = Path(log_file).read_text(encoding="utf-8")
        assert "테스트 메시지" in content

    def test_setup_logging_with_dir(self, tmp_path):
        """로그 디렉토리 지정"""
        log_dir = str(tmp_path / "logs")
        logger = setup_logging(level=logging.INFO, log_dir=log_dir, console=False)

        logger.info("디렉토리 테스트")

        # 디렉토리가 생성되었는지 확인
        assert Path(log_dir).exists()

        # 로그 파일이 생성되었는지 확인
        log_files = list(Path(log_dir).glob("*.log"))
        assert len(log_files) == 1

    def test_setup_different_levels(self, tmp_path):
        """파일/콘솔 다른 로그 레벨"""
        log_file = str(tmp_path / "level_test.log")
        logger = setup_logging(
            level=logging.DEBUG,
            log_file=log_file,
            console=True,
            file_level=logging.WARNING,
            console_level=logging.DEBUG,
        )

        logger.debug("DEBUG 메시지")
        logger.warning("WARNING 메시지")

        content = Path(log_file).read_text(encoding="utf-8")
        # 파일에는 WARNING만 기록됨
        assert "WARNING 메시지" in content
        assert "DEBUG 메시지" not in content


class TestGetLogger:
    """get_logger 함수 테스트"""

    def test_get_logger_by_name(self):
        """이름으로 로거 가져오기"""
        logger = get_logger("test_module")

        assert logger is not None
        assert logger.name == "test_module"

    def test_get_logger_same_instance(self):
        """같은 이름은 같은 로거 인스턴스 반환"""
        logger1 = get_logger("same_name")
        logger2 = get_logger("same_name")

        assert logger1 is logger2


class TestLoggerMixin:
    """LoggerMixin 클래스 테스트"""

    def test_mixin_provides_logger(self):
        """믹스인이 로거를 제공하는지 확인"""

        class TestClass(LoggerMixin):
            def do_something(self):
                self.logger.info("작업 수행")

        obj = TestClass()
        assert obj.logger is not None
        assert obj.logger.name == "TestClass"

    def test_mixin_logger_cached(self):
        """로거가 캐시되는지 확인"""

        class AnotherClass(LoggerMixin):
            pass

        obj = AnotherClass()
        logger1 = obj.logger
        logger2 = obj.logger

        assert logger1 is logger2
