from __future__ import annotations

import typing as t
import requests
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from rapidfuzz import fuzz


class AladinApiError(Exception):
    pass


class AladinClient:
    BASE_URL = "https://www.aladin.co.kr/ttb/api/ItemSearch.aspx"

    def __init__(self, ttb_key: str, request_timeout: int = 12):
        self.ttb_key = ttb_key
        self.request_timeout = request_timeout

    @retry(
        reraise=True,
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=6),
        retry=retry_if_exception_type((requests.RequestException,)),
    )
    def search_isbn_by_title_author(
        self, title: str, author: str, threshold: float = 0.6
    ) -> tuple[t.Optional[str], t.Optional[str]]:
        if not title:
            return None, "빈 제목"
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
        resp = requests.get(self.BASE_URL, params=params, timeout=self.request_timeout)
        if resp.status_code != 200:
            raise AladinApiError(f"HTTP {resp.status_code}")
        data = resp.json()
        items = data.get("item", []) if isinstance(data, dict) else []
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
            score = 0.7 * title_score + 0.3 * author_score
            if score > best_score:
                best_score = score
                best = it
        if best and best_score >= threshold:
            isbn13 = (best.get("isbn13") or "").strip()
            if isbn13:
                return isbn13, None
            return None, "isbn 비어있음"
        return None, f"유사도 미달({best_score:.2f})"

