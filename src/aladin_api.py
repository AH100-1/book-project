"""알라딘 API 클라이언트 - ISBN 검색"""

from __future__ import annotations

import typing as t
import requests
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from rapidfuzz import fuzz

from src.logger import get_logger
from src.exceptions import AladinApiError, ISBNNotFoundError, SimilarityThresholdError

logger = get_logger(__name__)


class AladinClient:
    """알라딘 도서 검색 API 클라이언트"""

    BASE_URL = "https://www.aladin.co.kr/ttb/api/ItemSearch.aspx"

    def __init__(self, ttb_key: str, request_timeout: int = 12):
        self.ttb_key = ttb_key
        self.request_timeout = request_timeout
        logger.debug(f"AladinClient 초기화 (timeout={request_timeout}s)")

    @retry(
        reraise=True,
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=6),
        retry=retry_if_exception_type((requests.RequestException,)),
    )
    def search_isbn_by_title_author(
        self, title: str, author: str, threshold: float = 0.6
    ) -> tuple[t.Optional[str], t.Optional[str]]:
        """
        제목과 저자로 ISBN13을 검색합니다.

        Args:
            title: 도서 제목
            author: 저자명
            threshold: 유사도 임계값 (0.0 ~ 1.0)

        Returns:
            (isbn13, error_message) 튜플
            - 성공: (isbn13, None)
            - 실패: (None, 오류 메시지)
        """
        if not title:
            logger.warning("빈 제목으로 ISBN 검색 시도")
            return None, "빈 제목"

        logger.debug(f"ISBN 검색: '{title}' / '{author}'")

        params = {
            "TTBKey": self.ttb_key,
            "Query": title,
            "QueryType": "Title",
            "MaxResults": 20,
            "start": 1,
            "SearchTarget": "Book",
            "output": "JS",
            "Version": "20131101",
        }

        try:
            resp = requests.get(self.BASE_URL, params=params, timeout=self.request_timeout)
        except requests.RequestException as e:
            logger.error(f"알라딘 API 요청 실패: {e}")
            raise

        if resp.status_code != 200:
            logger.error(f"알라딘 API HTTP 오류: {resp.status_code}")
            raise AladinApiError(f"HTTP {resp.status_code}", status_code=resp.status_code)

        data = resp.json()
        items = data.get("item", []) if isinstance(data, dict) else []

        if not items:
            logger.debug(f"검색 결과 없음: '{title}'")
            return None, "검색 결과 없음"

        best: dict[str, t.Any] | None = None
        best_score = -1.0
        needle_author = (author or "").strip()
        needle_title = (title or "").strip()

        for it in items:
            cand_title = (it.get("title") or "").strip()
            cand_author = (it.get("author") or "").strip()

            title_score = fuzz.token_set_ratio(needle_title, cand_title) / 100.0
            author_score = (
                fuzz.token_set_ratio(needle_author, cand_author) / 100.0 if needle_author else 0.0
            )

            # 가중치: 제목 70%, 저자 30%
            score = 0.7 * title_score + 0.3 * author_score

            if score > best_score:
                best_score = score
                best = it

        if best and best_score >= threshold:
            isbn13 = (best.get("isbn13") or "").strip()
            if isbn13:
                logger.info(f"ISBN 발견: '{title}' -> {isbn13} (유사도: {best_score:.2f})")
                return isbn13, None
            logger.warning(f"ISBN 비어있음: '{title}'")
            return None, "isbn 비어있음"

        logger.debug(f"유사도 미달: '{title}' (최고: {best_score:.2f} < {threshold})")
        return None, f"유사도 미달({best_score:.2f})"
