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

  if (pageSize !== 100) {
    payload.rows = pageSize;
  }

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

    return {
      totalCount: 0,
      totalPages: 0,
      books: [],
    };
  } catch (error) {
    console.error('Read365 API 오류:', error);
    throw error;
  }
}

/**
 * ISBN으로 모든 페이지를 검색하여 전체 결과 반환 (페이지 병렬 호출)
 */
export async function searchISBNAllPages(
  isbn: string,
  provCode?: string | null
): Promise<Read365Book[]> {
  // 첫 페이지로 totalPages 파악
  const first = await searchISBN(isbn, provCode, 1, 100);
  if (first.books.length === 0) return [];

  const tagBooks = (books: Read365Book[], page: number) => {
    for (const b of books) {
      b._page = page;
      b._provCode = provCode || undefined;
    }
    return books;
  };

  tagBooks(first.books, 1);

  if (first.totalPages <= 1) return first.books;

  // 2..N 페이지 병렬 호출
  const pagePromises: Promise<Read365Book[]>[] = [];
  for (let p = 2; p <= first.totalPages; p++) {
    pagePromises.push(
      searchISBN(isbn, provCode, p, 100).then((r) => tagBooks(r.books, p))
    );
  }

  const rest = await Promise.allSettled(pagePromises);
  const all: Read365Book[] = [...first.books];
  for (const r of rest) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }
  return all;
}

/**
 * 다중 지역 검색 - 학교명 매칭 기반 조기 종료 최적화
 *
 * 전략:
 * 1) 17개 지역 1페이지만 병렬 요청 (각 지역 totalCount 파악)
 * 2) schoolName이 주어지면, 1페이지에서 매칭된 지역만 나머지 페이지를 받아옴
 * 3) 매칭 지역이 없으면 → 추가 호출 없이 빠르게 "없음" 처리
 *
 * schoolName이 없으면 기존처럼 전 지역 모든 페이지를 받음.
 */
export async function searchISBNMultiRegion(
  isbn: string,
  primaryRegion?: string | null,
  schoolName?: string | null
): Promise<{
  totalCount: number;
  books: Read365Book[];
}> {
  const searchRegions: string[] = [];

  if (primaryRegion) {
    const provCode = getProvCode(primaryRegion);
    if (provCode) searchRegions.push(provCode);
  }
  for (const code of MAJOR_REGION_CODES) {
    if (!searchRegions.includes(code)) searchRegions.push(code);
  }

  // 학교명이 없으면 기존 동작(모든 지역 모든 페이지)
  if (!schoolName) {
    const results = await Promise.allSettled(
      searchRegions.map((rc) => searchISBNAllPages(isbn, rc))
    );
    let totalCount = 0;
    const allBooks: Read365Book[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        totalCount += r.value.length;
        allBooks.push(...r.value);
      }
    }
    return { totalCount, books: allBooks };
  }

  // === 학교명 기반 조기 종료 ===
  const normalizedSchool = schoolName.replace(/\s/g, '').toLowerCase();
  const matches = (s: string | undefined): boolean => {
    if (!s) return false;
    const n = s.replace(/\s/g, '').toLowerCase();
    return n.includes(normalizedSchool) || normalizedSchool.includes(n);
  };

  // 1단계: 모든 지역 1페이지 병렬
  const firstResults = await Promise.allSettled(
    searchRegions.map(async (rc) => {
      const r = await searchISBN(isbn, rc, 1, 100);
      for (const b of r.books) {
        b._page = 1;
        b._provCode = rc;
      }
      return { rc, totalPages: r.totalPages, totalCount: r.totalCount, books: r.books };
    })
  );

  let totalCount = 0;
  const allBooks: Read365Book[] = [];
  const regionsToExpand: { rc: string; totalPages: number }[] = [];

  for (const r of firstResults) {
    if (r.status !== 'fulfilled') continue;
    const { rc, totalPages, totalCount: rTotal, books } = r.value;
    totalCount += rTotal; // 1페이지 합이 아닌 실제 지역별 총 권수 사용
    allBooks.push(...books);

    // 이 지역 1페이지에 학교가 매칭됐고, 남은 페이지가 있으면 확장 대상
    if (totalPages > 1 && books.some((b) => matches(b.schoolName))) {
      regionsToExpand.push({ rc, totalPages });
    }
  }

  // 2단계: 매칭된 지역만 2~N 페이지 병렬 호출
  if (regionsToExpand.length > 0) {
    const expandPromises: Promise<Read365Book[]>[] = [];
    for (const { rc, totalPages } of regionsToExpand) {
      for (let p = 2; p <= totalPages; p++) {
        expandPromises.push(
          searchISBN(isbn, rc, p, 100).then((r) => {
            for (const b of r.books) {
              b._page = p;
              b._provCode = rc;
            }
            return r.books;
          })
        );
      }
    }
    const expanded = await Promise.allSettled(expandPromises);
    for (const e of expanded) {
      if (e.status === 'fulfilled') allBooks.push(...e.value);
    }
  }

  return { totalCount, books: allBooks };
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
