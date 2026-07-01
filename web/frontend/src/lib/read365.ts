/**
 * Read365 (독서로) API 클라이언트
 */

const READ365_BASE_URL = 'https://read365.edunet.net';
const SEARCH_ENDPOINT = '/alpasq/api/search';

// 지역명 → 지역 코드 매핑
export const REGION_CODE_MAP: Record<string, string> = {
  '서울': 'B10',
  '서울특별시': 'B10',
  '부산': 'C10',
  '부산광역시': 'C10',
  '대구': 'D10',
  '대구광역시': 'D10',
  '인천': 'E10',
  '인천광역시': 'E10',
  '광주': 'F10',
  '광주광역시': 'F10',
  '대전': 'G10',
  '대전광역시': 'G10',
  '울산': 'H10',
  '울산광역시': 'H10',
  '세종': 'I10',
  '세종특별자치시': 'I10',
  '경기': 'J10',
  '경기도': 'J10',
  '강원': 'K10',
  '강원도': 'K10',
  '충북': 'M10',
  '충청북도': 'M10',
  '충남': 'N10',
  '충청남도': 'N10',
  '전북': 'P10',
  '전라북도': 'P10',
  '전남': 'Q10',
  '전라남도': 'Q10',
  '경북': 'R10',
  '경상북도': 'R10',
  '경남': 'S10',
  '경상남도': 'S10',
  '제주': 'T10',
  '제주특별자치도': 'T10',
};

// 지역 목록
export const REGIONS = [
  '전체',
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'
];

// 학교급 목록
export const SCHOOL_LEVELS = ['초등학교', '중학교', '고등학교'];

// 주요 지역 코드 (전국 검색용)
export const MAJOR_REGION_CODES = [
  'B10', 'C10', 'D10', 'E10', 'F10', 'G10', 'H10', 'I10',
  'J10', 'K10', 'M10', 'N10', 'P10', 'Q10', 'R10', 'S10', 'T10'
];

export function getProvCode(regionName: string): string | null {
  return REGION_CODE_MAP[regionName] || null;
}

interface Read365Book {
  title?: string;
  author?: string;
  schoolName?: string;
  provName?: string;
  isbn?: string;
  _page?: number;
  _provCode?: string;
}

interface Read365SearchResult {
  totalCount: number;
  totalPages: number;
  books: Read365Book[];
}

interface Read365ApiResponse {
  status: string;
  message?: string;
  data?: {
    allTotalCount?: number;
    totalPage?: number;
    bookList?: Read365Book[];
  };
}

// 일시적 장애로 간주하고 재시도할 HTTP 상태 코드
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function searchISBN(
  isbn: string,
  provCode?: string | null,
  page: number = 1,
  pageSize: number = 100
): Promise<Read365SearchResult> {
  const url = `${READ365_BASE_URL}${SEARCH_ENDPOINT}`;

  const payload: Record<string, unknown> = {
    searchKeyword: isbn,
    coverYn: 'Y',
    facet: 'Y',
  };

  if (provCode) {
    payload.provCode = provCode;
  }

  if (page > 1) {
    payload.page = page;
  }

  // read365는 페이지 크기 파라미터로 'display'를 사용한다 ('rows'는 무시되어 항상 10개만 반환됨).
  // display의 유효 최대값은 50 — 그 이상 값(60/80/100)은 서버가 BAD_REQUEST로 거부한다
  // ("페이지 당 출력건수 값이 유효하지 않습니다"). 100으로 두면 모든 검색이 실패한다.
  payload.display = Math.min(pageSize, 50);

  let lastError: unknown;

  // 429/5xx 및 네트워크 오류는 지수 백오프로 재시도 (조용한 지역 누락 방지)
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        // 재시도 가능한 상태면 백오프 후 재시도, 그 외엔 즉시 실패
        if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_RETRIES) {
          lastError = new Error(`HTTP ${response.status}`);
          await sleep(300 * 2 ** attempt + Math.floor(Math.random() * 200));
          continue;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data: Read365ApiResponse = await response.json();

      if (data.status === 'OK' && data.data) {
        return {
          totalCount: data.data.allTotalCount || 0,
          totalPages: data.data.totalPage || 0,
          books: data.data.bookList || [],
        };
      }

      // BAD_REQUEST는 파라미터 오류이므로 재시도해도 동일 실패 — 즉시 throw.
      // (예전엔 여기서 "0건"으로 조용히 반환해 잘못된 display 값 때문에 모든 검색이 "없음"으로
      // 나오는 사고가 있었다. 진짜 "잘못된 ISBN"이라도 "없음"보다 오류로 표면화하는 편이 안전.)
      if (data.status === 'BAD_REQUEST') {
        throw new Error(`Read365 BAD_REQUEST: ${data.message || 'unknown'}`);
      }

      // 그 외 비정상 status(부하/throttle 등)는 일시 장애로 간주 — 재시도 후 소진 시 throw.
      // (예전엔 여기서 빈 결과를 조용히 반환해 페이지네이션이 조기 종료되며 도서가 누락됐다)
      if (attempt < MAX_RETRIES) {
        lastError = new Error(`status ${data.status}`);
        await sleep(300 * 2 ** attempt + Math.floor(Math.random() * 200));
        continue;
      }
      throw new Error(`Read365 비정상 응답 status=${data.status}`);
    } catch (error) {
      lastError = error;
      // 네트워크 오류(fetch throw)도 재시도
      if (attempt < MAX_RETRIES) {
        await sleep(300 * 2 ** attempt + Math.floor(Math.random() * 200));
        continue;
      }
    }
  }

  console.error('Read365 API 오류 (재시도 소진):', lastError);
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * ISBN으로 모든 페이지를 검색하여 전체 결과 반환 (2페이지부터 병렬 호출)
 */
export async function searchISBNAllPages(
  isbn: string,
  provCode?: string | null
): Promise<Read365Book[]> {
  const tag = (books: Read365Book[], page: number) => {
    for (const book of books) {
      book._page = page;
      book._provCode = provCode || undefined;
    }
    return books;
  };

  // 1페이지로 전체 페이지 수를 확정한다. 이후 페이지가 부하로 비어서 오는 경우와
  // "진짜 0건"을 구분하는 기준이 된다.
  const first = await searchISBN(isbn, provCode, 1, 100);
  if (first.books.length === 0) {
    return []; // 진짜 0건
  }
  tag(first.books, 1);

  const totalPages = first.totalPages;
  if (totalPages <= 1) {
    return first.books;
  }

  // 2..N 페이지를 병렬로 호출한다. searchISBN이 429/5xx·비정상 status·네트워크 오류를
  // 재시도로 처리하므로, 끝내 비거나 실패한 페이지는 throw → Promise.all이 reject되어
  // 이 지역 전체가 상위(searchISBNMultiRegion)에서 "실패 지역"으로 표면화된다.
  // (부분 데이터로 잘못된 "없음"을 내지 않기 위함)
  const pagePromises: Promise<Read365Book[]>[] = [];
  for (let page = 2; page <= totalPages; page++) {
    pagePromises.push(
      searchISBN(isbn, provCode, page, 100).then((result) => {
        if (result.books.length === 0) {
          throw new Error(`Read365 페이지 누락: prov=${provCode ?? '전체'} page=${page}/${totalPages}`);
        }
        return tag(result.books, page);
      })
    );
  }

  const rest = await Promise.all(pagePromises);
  const allBooks: Read365Book[] = [...first.books];
  for (const books of rest) {
    allBooks.push(...books);
  }
  return allBooks;
}

export async function searchISBNMultiRegion(
  isbn: string,
  regions?: string[] | null,
): Promise<{
  totalCount: number;
  books: Read365Book[];
  failedRegions: string[];
}> {
  const searchRegions: string[] = [];

  // regions에 유효한 지역명 배열이 오면 그 지역들만 검색.
  // null/빈배열이면 전 지역(17개) 병렬 조회.
  if (regions && regions.length > 0) {
    for (const name of regions) {
      const code = getProvCode(name);
      if (code && !searchRegions.includes(code)) searchRegions.push(code);
    }
  }
  if (searchRegions.length === 0) {
    for (const code of MAJOR_REGION_CODES) searchRegions.push(code);
  }

  // 모든 지역 병렬 검색
  const results = await Promise.allSettled(
    searchRegions.map((regionCode) => searchISBNAllPages(isbn, regionCode))
  );

  let totalCount = 0;
  const allBooks: Read365Book[] = [];
  const failedRegions: string[] = [];

  results.forEach((result, idx) => {
    if (result.status === 'fulfilled') {
      totalCount += result.value.length;
      allBooks.push(...result.value);
    } else {
      // 재시도까지 소진하고 실패한 지역 — 조용히 누락시키지 않고 표면화
      const code = searchRegions[idx];
      failedRegions.push(PROV_CODE_TO_NAME[code] || code);
    }
  });

  return { totalCount, books: allBooks, failedRegions };
}

// 지역 코드 → 지역명 역매핑
const PROV_CODE_TO_NAME: Record<string, string> = {
  'B10': '서울', 'C10': '부산', 'D10': '대구', 'E10': '인천',
  'F10': '광주', 'G10': '대전', 'H10': '울산', 'I10': '세종',
  'J10': '경기', 'K10': '강원', 'M10': '충북', 'N10': '충남',
  'P10': '전북', 'Q10': '전남', 'R10': '경북', 'S10': '경남', 'T10': '제주',
};

export function findSchoolBooks(
  books: Read365Book[],
  schoolName: string
): {
  found: Read365Book[];
  matchedSchool: string | null;
  matchedSchools: string[];
  matchedRegion: string | null;
  matchedPage: number | null;
} {
  const normalizedSchool = schoolName.replace(/\s/g, '').toLowerCase();
  const found: Read365Book[] = [];
  const matchedSchoolSet = new Set<string>();

  for (const book of books) {
    const bookSchool = book.schoolName || '';
    const normalizedBookSchool = bookSchool.replace(/\s/g, '').toLowerCase();

    // 등록된 학교명이 검색 키워드를 포함해야 매칭.
    // 반대 방향(검색어가 등록명을 포함)은 "다산가람초등학교" 검색 시 경남 "가람초등학교"가
    // 잘못 매칭되는 등 false positive를 일으켜 제거.
    if (normalizedBookSchool.includes(normalizedSchool)) {
      found.push(book);
      if (bookSchool) {
        matchedSchoolSet.add(bookSchool);
      }
    }
  }

  const matchedSchools = [...matchedSchoolSet];
  const firstMatch = found[0];
  const matchedRegion = firstMatch?._provCode
    ? PROV_CODE_TO_NAME[firstMatch._provCode] || firstMatch.provName || null
    : firstMatch?.provName || null;
  const matchedPage = firstMatch?._page || null;

  return { found, matchedSchool: matchedSchools[0] || null, matchedSchools, matchedRegion, matchedPage };
}
