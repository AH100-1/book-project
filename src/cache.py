"""캐싱 모듈 - ISBN 및 검색 결과 캐싱"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Dict, Tuple
import hashlib

from src.logger import get_logger

logger = get_logger(__name__)


def _normalize_key(text: str) -> str:
    """캐시 키 정규화 - 공백 제거, 소문자 변환"""
    return "".join(text.lower().split())


def _make_isbn_key(title: str, author: str) -> str:
    """ISBN 캐시 키 생성"""
    return f"{_normalize_key(title)}|{_normalize_key(author)}"


def _make_search_key(school: str, isbn: str) -> str:
    """검색 결과 캐시 키 생성"""
    return f"{_normalize_key(school)}|{isbn}"


@dataclass
class ISBNResult:
    """ISBN 검색 결과"""
    isbn13: Optional[str]
    error: Optional[str] = None


@dataclass
class SearchResult:
    """Read365 검색 결과"""
    exists: bool
    item_count: int
    matched_school: Optional[str] = None
    error: Optional[str] = None


@dataclass
class ResultCache:
    """검색 결과 캐시 관리자"""

    _isbn_cache: Dict[str, ISBNResult] = field(default_factory=dict)
    _search_cache: Dict[str, SearchResult] = field(default_factory=dict)
    _stats: Dict[str, int] = field(default_factory=lambda: {
        "isbn_hits": 0,
        "isbn_misses": 0,
        "search_hits": 0,
        "search_misses": 0,
    })

    def get_isbn(self, title: str, author: str) -> Optional[ISBNResult]:
        """캐시에서 ISBN 조회"""
        key = _make_isbn_key(title, author)
        result = self._isbn_cache.get(key)
        if result is not None:
            self._stats["isbn_hits"] += 1
            logger.debug(f"ISBN 캐시 히트: {title[:20]}...")
        else:
            self._stats["isbn_misses"] += 1
        return result

    def set_isbn(self, title: str, author: str, isbn13: Optional[str], error: Optional[str] = None) -> None:
        """ISBN 결과를 캐시에 저장"""
        key = _make_isbn_key(title, author)
        self._isbn_cache[key] = ISBNResult(isbn13=isbn13, error=error)
        logger.debug(f"ISBN 캐시 저장: {title[:20]}... -> {isbn13}")

    def get_search(self, school: str, isbn: str) -> Optional[SearchResult]:
        """캐시에서 검색 결과 조회"""
        key = _make_search_key(school, isbn)
        result = self._search_cache.get(key)
        if result is not None:
            self._stats["search_hits"] += 1
            logger.debug(f"검색 캐시 히트: {school} / {isbn}")
        else:
            self._stats["search_misses"] += 1
        return result

    def set_search(
        self,
        school: str,
        isbn: str,
        exists: bool,
        item_count: int,
        matched_school: Optional[str] = None,
        error: Optional[str] = None,
    ) -> None:
        """검색 결과를 캐시에 저장"""
        key = _make_search_key(school, isbn)
        self._search_cache[key] = SearchResult(
            exists=exists,
            item_count=item_count,
            matched_school=matched_school,
            error=error,
        )
        logger.debug(f"검색 캐시 저장: {school} / {isbn} -> {'✅' if exists else '❌'}")

    def get_stats(self) -> Dict[str, int]:
        """캐시 통계 반환"""
        return {
            **self._stats,
            "isbn_cache_size": len(self._isbn_cache),
            "search_cache_size": len(self._search_cache),
        }

    def clear(self) -> None:
        """캐시 초기화"""
        self._isbn_cache.clear()
        self._search_cache.clear()
        logger.info("캐시 초기화됨")

    def print_stats(self) -> None:
        """캐시 통계 출력"""
        stats = self.get_stats()
        isbn_total = stats["isbn_hits"] + stats["isbn_misses"]
        search_total = stats["search_hits"] + stats["search_misses"]

        isbn_rate = (stats["isbn_hits"] / isbn_total * 100) if isbn_total > 0 else 0
        search_rate = (stats["search_hits"] / search_total * 100) if search_total > 0 else 0

        logger.info(f"=== 캐시 통계 ===")
        logger.info(f"ISBN 캐시: {stats['isbn_hits']}/{isbn_total} 히트 ({isbn_rate:.1f}%)")
        logger.info(f"검색 캐시: {stats['search_hits']}/{search_total} 히트 ({search_rate:.1f}%)")
