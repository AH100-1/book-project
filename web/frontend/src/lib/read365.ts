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
  // display는 최대 100까지만 정상 동작 — 그 이상은 totalPage만 커지고 실제 응답은 100개로 잘려 누락이 발생한다.
  payload.display = Math.min(pageSize, 100);

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

      // 잘못된 ISBN 등 클라이언트 오류는 정상적인 "0건"으로 처리
      if (data.status === 'BAD_REQUEST') {
        return { totalCount: 0, totalPages: 0, books: [] };
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
 * ISBN으로 모든 페이지를 검색하여 전체 결과 반환
 */
export async function searchISBNAllPages(
  isbn: string,
  provCode?: string | null
): Promise<Read365Book[]> {
  const allBooks: Read365Book[] = [];

  // 1페이지로 전체 페이지 수를 확정한다. 이후 페이지가 부하로 비어서 오는 경우와
  // "진짜 0건"을 구분하는 기준이 된다.
  const first = await searchISBN(isbn, provCode, 1, 100);
  if (first.books.length === 0) {
    return allBooks; // 진짜 0건
  }
  for (const book of first.books) {
    book._page = 1;
    book._provCode = provCode || undefined;
  }
  allBooks.push(...first.books);

  const totalPages = first.totalPages;

  for (let page = 2; page <= totalPages; page++) {
    // API 부하 방지
    await sleep(100);
    let result = await searchISBN(isbn, provCode, page, 100);

    // 마지막 페이지가 아닌데 빈 결과면 부하로 인한 누락 가능성 → 한 번 더 시도
    if (result.books.length === 0) {
      await sleep(500);
      result = await searchISBN(isbn, provCode, page, 100);
    }

    // 재시도에도 비어 있으면 이 지역 결과가 불완전하다는 뜻 — 부분 데이터로
    // 잘못된 "없음"을 내지 않도록 throw하여 상위에서 실패 지역으로 표면화한다.
    if (result.books.length === 0) {
      throw new Error(`Read365 페이지 누락: prov=${provCode ?? '전체'} page=${page}/${totalPages}`);
    }

    for (const book of result.books) {
      book._page = page;
      book._provCode = provCode || undefined;
    }
    allBooks.push(...result.books);
  }

  return allBooks;
}

export async function searchISBNMultiRegion(
  isbn: string,
  primaryRegion?: string | null,
  maxRegions: number = 17
): Promise<{
  totalCount: number;
  books: Read365Book[];
  failedRegions: string[];
}> {
  const searchRegions: string[] = [];

  // 지정된 지역 우선
  if (primaryRegion) {
    const provCode = getProvCode(primaryRegion);
    if (provCode) {
      searchRegions.push(provCode);
    }
  }

  // 나머지 주요 지역 추가
  for (const code of MAJOR_REGION_CODES) {
    if (!searchRegions.includes(code) && searchRegions.length < maxRegions) {
      searchRegions.push(code);
    }
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

    if (normalizedBookSchool.includes(normalizedSchool) || normalizedSchool.includes(normalizedBookSchool)) {
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
