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
 * ISBN으로 모든 페이지를 검색하여 전체 결과 반환
 */
export async function searchISBNAllPages(
  isbn: string,
  provCode?: string | null
): Promise<Read365Book[]> {
  const allBooks: Read365Book[] = [];
  let page = 1;

  while (true) {
    const result = await searchISBN(isbn, provCode, page, 100);

    if (result.books.length === 0) {
      break;
    }

    allBooks.push(...result.books);

    if (page >= result.totalPages) {
      break;
    }

    page++;
    // API 부하 방지
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return allBooks;
}

export async function searchISBNMultiRegion(
  isbn: string,
  primaryRegion?: string | null,
  maxRegions: number = 6
): Promise<{
  totalCount: number;
  books: Read365Book[];
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

  let totalCount = 0;
  const allBooks: Read365Book[] = [];

  for (const regionCode of searchRegions) {
    try {
      // 모든 페이지 가져오기
      const books = await searchISBNAllPages(isbn, regionCode);
      totalCount += books.length;
      allBooks.push(...books);
    } catch (error) {
      console.warn(`지역 ${regionCode} 검색 실패:`, error);
    }
  }

  return { totalCount, books: allBooks };
}

export function findSchoolBooks(
  books: Read365Book[],
  schoolName: string
): { found: Read365Book[]; matchedSchool: string | null } {
  const normalizedSchool = schoolName.replace(/\s/g, '').toLowerCase();
  const found: Read365Book[] = [];
  let matchedSchool: string | null = null;

  for (const book of books) {
    const bookSchool = book.schoolName || '';
    const normalizedBookSchool = bookSchool.replace(/\s/g, '').toLowerCase();

    if (normalizedBookSchool.includes(normalizedSchool) || normalizedSchool.includes(normalizedBookSchool)) {
      found.push(book);
      if (!matchedSchool) {
        matchedSchool = bookSchool;
      }
    }
  }

  return { found, matchedSchool };
}
