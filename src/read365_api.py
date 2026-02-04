"""Read365 (독서로) API 클라이언트 - requests 기반"""

from __future__ import annotations

import time
from typing import Optional, List, Dict, Any
from urllib.parse import urljoin

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from src.logger import get_logger
from src.exceptions import (
    SchoolNotFoundError,
    ISBNSearchError,
    PageLoadError,
)

logger = get_logger(__name__)


# 지역명 → 지역 코드 매핑
REGION_CODE_MAP = {
    "서울": "B10",
    "서울특별시": "B10",
    "부산": "C10",
    "부산광역시": "C10",
    "대구": "D10",
    "대구광역시": "D10",
    "인천": "E10",
    "인천광역시": "E10",
    "광주": "F10",
    "광주광역시": "F10",
    "대전": "G10",
    "대전광역시": "G10",
    "울산": "H10",
    "울산광역시": "H10",
    "세종": "I10",
    "세종특별자치시": "I10",
    "경기": "G10",
    "경기도": "G10",
    "강원": "K10",
    "강원도": "K10",
    "충북": "M10",
    "충청북도": "M10",
    "충남": "N10",
    "충청남도": "N10",
    "전북": "P10",
    "전라북도": "P10",
    "전남": "Q10",
    "전라남도": "Q10",
    "경북": "R10",
    "경상북도": "R10",
    "경남": "S10",
    "경상남도": "S10",
    "제주": "T10",
    "제주특별자치도": "T10",
}


def get_prov_code(region_name: str) -> Optional[str]:
    """지역명을 지역 코드로 변환합니다."""
    return REGION_CODE_MAP.get(region_name)


class Read365APIClient:
    """Read365 API 클라이언트 (requests 기반 - 빠르고 가벼움)"""

    BASE_URL = "https://read365.edunet.net"
    
    # API 엔드포인트
    SEARCH_ENDPOINT = "/alpasq/api/search"
    
    def __init__(
        self,
        timeout: int = 30,
        max_retries: int = 3,
        backoff_factor: float = 0.5,
    ) -> None:
        """
        Args:
            timeout: 요청 타임아웃 (초)
            max_retries: 최대 재시도 횟수
            backoff_factor: 재시도 간격 배수
        """
        self.timeout = timeout
        self.session = self._create_session(max_retries, backoff_factor)
        
        logger.debug(
            f"Read365APIClient 초기화 (timeout={timeout}s, retries={max_retries})"
        )
    
    def _create_session(self, max_retries: int, backoff_factor: float) -> requests.Session:
        """재시도 로직이 포함된 세션 생성"""
        session = requests.Session()
        
        # 재시도 전략 설정
        retry_strategy = Retry(
            total=max_retries,
            backoff_factor=backoff_factor,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "POST", "PUT", "DELETE", "OPTIONS", "TRACE"]
        )
        
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        
        # 기본 헤더 설정
        session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
        })
        
        return session
    
    def close(self) -> None:
        """세션 종료"""
        if self.session:
            self.session.close()
            logger.info("API 세션 종료됨")
    
    def search_school(
        self,
        region_name: str,
        school_level: str,
        school_name: str,
    ) -> List[Dict[str, Any]]:
        """
        학교를 검색합니다.
        
        Args:
            region_name: 지역명 (예: "경기도", "서울")
            school_level: 학교급 (예: "초등학교")
            school_name: 학교명 (예: "샘골초등학교")
        
        Returns:
            학교 목록 (빈 리스트 가능)
        
        Raises:
            SchoolNotFoundError: 검색 실패 시
        """
        logger.debug(f"학교 검색: {region_name} {school_level} {school_name}")
        
        try:
            url = urljoin(self.BASE_URL, self.SEARCH_ENDPOINT)
            
            # 학교 검색 파라미터 (실제 스펙에 맞게 조정 필요)
            payload = {
                "searchType": "school",  # 또는 다른 타입
                "region": region_name,
                "level": school_level,
                "schoolName": school_name,
            }
            
            response = self.session.post(
                url,
                json=payload,
                timeout=self.timeout
            )
            response.raise_for_status()
            
            data = response.json()
            
            if data.get("status") == "OK" and data.get("data"):
                schools = data["data"].get("schoolList", [])
                logger.info(f"학교 검색 완료: {school_name} - {len(schools)}개 발견")
                return schools
            
            logger.warning(f"학교 검색 결과 없음: {school_name}")
            return []
            
        except requests.exceptions.RequestException as e:
            logger.error(f"학교 검색 실패: {school_name} - {e}")
            raise SchoolNotFoundError(school_name)
    
    def search_isbn(
        self,
        isbn: str,
        prov_code: Optional[str] = None,
        page: int = 1,
        page_size: int = 100,
    ) -> Dict[str, Any]:
        """
        ISBN으로 도서를 검색합니다.
        
        Args:
            isbn: ISBN-13
            prov_code: 지역 코드 (예: "B10"=서울, "C10"=부산, "G10"=경기도)
            page: 페이지 번호 (1부터 시작)
            page_size: 페이지당 결과 수
        
        Returns:
            검색 결과 딕셔너리
            {
                "total_count": int,
                "total_pages": int,
                "books": List[Dict],
            }
        
        Raises:
            ISBNSearchError: 검색 실패 시
        """
        logger.debug(f"ISBN 검색: {isbn} (provCode={prov_code}, page={page})")
        
        try:
            url = urljoin(self.BASE_URL, self.SEARCH_ENDPOINT)
            
            # ISBN 검색 파라미터
            payload = {
                "searchKeyword": isbn,
                "coverYn": "Y",
                "facet": "Y",
            }
            
            if prov_code:
                payload["provCode"] = prov_code
            
            # 페이징 파라미터 (필요시)
            if page > 1:
                payload["page"] = page
            if page_size != 100:
                payload["rows"] = page_size
            
            response = self.session.post(
                url,
                json=payload,
                timeout=self.timeout
            )
            response.raise_for_status()
            
            data = response.json()
            
            if data.get("status") == "OK" and data.get("data"):
                result_data = data["data"]
                result = {
                    "total_count": result_data.get("allTotalCount", 0),
                    "total_pages": result_data.get("totalPage", 0),
                    "books": result_data.get("bookList", []),
                }
                
                logger.info(
                    f"ISBN 검색 완료: {isbn} - {result['total_count']}권 발견"
                )
                return result
            
            logger.warning(f"ISBN 검색 결과 없음: {isbn}")
            return {
                "total_count": 0,
                "total_pages": 0,
                "books": [],
            }
            
        except requests.exceptions.RequestException as e:
            logger.error(f"ISBN 검색 실패: {isbn} - {e}")
            raise ISBNSearchError(isbn, str(e))
    
    def search_isbn_all_pages(
        self,
        isbn: str,
        prov_code: Optional[str] = None,
        page_size: int = 100,
    ) -> List[Dict[str, Any]]:
        """
        ISBN으로 모든 페이지를 검색하여 전체 결과를 반환합니다.
        
        Args:
            isbn: ISBN-13
            prov_code: 지역 코드 (예: "G10"=경기도)
            page_size: 페이지당 결과 수
        
        Returns:
            전체 도서 목록
        """
        logger.debug(f"ISBN 전체 검색 시작: {isbn}")
        
        all_books = []
        page = 1
        
        while True:
            result = self.search_isbn(
                isbn=isbn,
                prov_code=prov_code,
                page=page,
                page_size=page_size,
            )
            
            books = result["books"]
            if not books:
                break
            
            all_books.extend(books)
            
            # 마지막 페이지인지 확인
            if page >= result["total_pages"]:
                break
            
            page += 1
            time.sleep(0.1)  # API 부하 방지
        
        logger.info(f"ISBN 전체 검색 완료: {isbn} - 총 {len(all_books)}권")
        return all_books
    
    def __enter__(self):
        """컨텍스트 매니저 진입"""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """컨텍스트 매니저 종료"""
        self.close()
        return False
