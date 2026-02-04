"""캐시 모듈 테스트"""

import pytest
from src.cache import ResultCache, ISBNResult, SearchResult


class TestISBNResult:
    """ISBNResult 데이터클래스 테스트"""

    def test_isbn_result_with_isbn(self):
        """ISBN이 있는 결과 테스트"""
        result = ISBNResult(isbn13="9788983920997")
        assert result.isbn13 == "9788983920997"
        assert result.error is None

    def test_isbn_result_with_error(self):
        """에러가 있는 결과 테스트"""
        result = ISBNResult(isbn13=None, error="유사도 미달")
        assert result.isbn13 is None
        assert result.error == "유사도 미달"


class TestSearchResult:
    """SearchResult 데이터클래스 테스트"""

    def test_search_result_exists(self):
        """존재하는 검색 결과 테스트"""
        result = SearchResult(exists=True, item_count=3, matched_school="금남초등학교")
        assert result.exists is True
        assert result.item_count == 3
        assert result.matched_school == "금남초등학교"
        assert result.error is None

    def test_search_result_not_exists(self):
        """존재하지 않는 검색 결과 테스트"""
        result = SearchResult(exists=False, item_count=0, error="학교 미발견")
        assert result.exists is False
        assert result.item_count == 0
        assert result.error == "학교 미발견"


class TestResultCache:
    """ResultCache 클래스 테스트"""

    @pytest.fixture
    def cache(self):
        """테스트용 캐시 인스턴스"""
        return ResultCache()

    def test_isbn_cache_miss(self, cache):
        """ISBN 캐시 미스 테스트"""
        result = cache.get_isbn("해리포터", "J.K. 롤링")
        assert result is None

    def test_isbn_cache_set_and_get(self, cache):
        """ISBN 캐시 저장 및 조회 테스트"""
        cache.set_isbn("해리포터", "J.K. 롤링", "9788983920997")
        result = cache.get_isbn("해리포터", "J.K. 롤링")

        assert result is not None
        assert result.isbn13 == "9788983920997"
        assert result.error is None

    def test_isbn_cache_with_error(self, cache):
        """에러가 있는 ISBN 캐시 테스트"""
        cache.set_isbn("없는책", "홍길동", None, "유사도 미달")
        result = cache.get_isbn("없는책", "홍길동")

        assert result is not None
        assert result.isbn13 is None
        assert result.error == "유사도 미달"

    def test_isbn_cache_normalization(self, cache):
        """ISBN 캐시 키 정규화 테스트 (공백, 대소문자)"""
        cache.set_isbn("해리포터", "J.K. 롤링", "9788983920997")

        # 공백이 다른 경우에도 동일하게 조회
        result = cache.get_isbn("해리 포터", "J.K.롤링")
        assert result is not None
        assert result.isbn13 == "9788983920997"

    def test_search_cache_miss(self, cache):
        """검색 캐시 미스 테스트"""
        result = cache.get_search("금남초등학교", "9788983920997")
        assert result is None

    def test_search_cache_set_and_get(self, cache):
        """검색 캐시 저장 및 조회 테스트"""
        cache.set_search(
            school="금남초등학교",
            isbn="9788983920997",
            exists=True,
            item_count=2,
            matched_school="금남초등학교"
        )
        result = cache.get_search("금남초등학교", "9788983920997")

        assert result is not None
        assert result.exists is True
        assert result.item_count == 2
        assert result.matched_school == "금남초등학교"

    def test_search_cache_with_error(self, cache):
        """에러가 있는 검색 캐시 테스트"""
        cache.set_search(
            school="없는학교",
            isbn="9788983920997",
            exists=False,
            item_count=0,
            error="학교 미발견"
        )
        result = cache.get_search("없는학교", "9788983920997")

        assert result is not None
        assert result.exists is False
        assert result.error == "학교 미발견"

    def test_cache_stats(self, cache):
        """캐시 통계 테스트"""
        # 초기 상태
        stats = cache.get_stats()
        assert stats["isbn_hits"] == 0
        assert stats["isbn_misses"] == 0

        # 미스 발생
        cache.get_isbn("테스트", "저자")
        stats = cache.get_stats()
        assert stats["isbn_misses"] == 1

        # 저장 후 히트
        cache.set_isbn("테스트", "저자", "1234567890123")
        cache.get_isbn("테스트", "저자")
        stats = cache.get_stats()
        assert stats["isbn_hits"] == 1
        assert stats["isbn_cache_size"] == 1

    def test_cache_clear(self, cache):
        """캐시 초기화 테스트"""
        cache.set_isbn("테스트", "저자", "1234567890123")
        cache.set_search("학교", "1234567890123", True, 1)

        stats = cache.get_stats()
        assert stats["isbn_cache_size"] == 1
        assert stats["search_cache_size"] == 1

        cache.clear()

        stats = cache.get_stats()
        assert stats["isbn_cache_size"] == 0
        assert stats["search_cache_size"] == 0

    def test_different_schools_same_isbn(self, cache):
        """같은 ISBN, 다른 학교 캐시 테스트"""
        cache.set_search("학교A", "1234567890123", True, 2)
        cache.set_search("학교B", "1234567890123", False, 0)

        result_a = cache.get_search("학교A", "1234567890123")
        result_b = cache.get_search("학교B", "1234567890123")

        assert result_a.exists is True
        assert result_b.exists is False
