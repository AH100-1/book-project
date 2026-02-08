/**
 * 알라딘 API 클라이언트
 */

import * as Fuzzball from 'fuzzball';

const ALADIN_BASE_URL = 'https://www.aladin.co.kr/ttb/api/ItemSearch.aspx';

/**
 * 검색용 제목 정규화 - 특수문자 제거
 */
function normalizeTitle(title: string): string {
  return title
    // 괄호와 내용 제거: (2학년), [특별판] 등
    .replace(/[(\[][^)\]]*[)\]]/g, ' ')
    // 특수문자를 공백으로: . : - _ 등
    .replace(/[.:;,\-_]/g, ' ')
    // 연속 공백 정리
    .replace(/\s+/g, ' ')
    .trim();
}

interface AladinBook {
  title: string;
  author: string;
  isbn13: string;
  publisher: string;
}

interface AladinResponse {
  item?: AladinBook[];
}

export async function searchISBNByTitleAuthor(
  ttbKey: string,
  title: string,
  author: string = '',
  threshold: number = 0.6
): Promise<{ isbn13: string | null; error: string | null; candidateCount: number }> {
  if (!title) {
    return { isbn13: null, error: '빈 제목', candidateCount: 0 };
  }

  // 검색용 제목 정규화 (괄호, 특수문자 제거)
  const normalizedTitle = normalizeTitle(title);

  const params = new URLSearchParams({
    TTBKey: ttbKey,
    Query: normalizedTitle,
    QueryType: 'Title',
    MaxResults: '20',
    start: '1',
    SearchTarget: 'Book',
    output: 'JS',
    Version: '20131101',
  });

  try {
    const response = await fetch(`${ALADIN_BASE_URL}?${params}`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data: AladinResponse = await response.json();
    const items = data.item || [];

    if (items.length === 0) {
      return { isbn13: null, error: '검색 결과 없음', candidateCount: 0 };
    }

    // 유사도 계산하여 최적 매칭 찾기
    let best: AladinBook | null = null;
    let bestScore = -1;

    const needleTitle = title.trim();
    const needleAuthor = (author || '').trim();

    for (const item of items) {
      const candTitle = (item.title || '').trim();
      const candAuthor = (item.author || '').trim();

      // fuzzball의 token_set_ratio 사용
      const titleScore = Fuzzball.token_set_ratio(needleTitle, candTitle) / 100;
      const authorScore = needleAuthor
        ? Fuzzball.token_set_ratio(needleAuthor, candAuthor) / 100
        : 0;

      // 가중치: 제목 70%, 저자 30%
      const score = 0.7 * titleScore + 0.3 * authorScore;

      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }

    if (best && bestScore >= threshold) {
      const isbn13 = (best.isbn13 || '').trim();
      if (isbn13) {
        return { isbn13, error: null, candidateCount: items.length };
      }
      return { isbn13: null, error: 'isbn 비어있음', candidateCount: items.length };
    }

    return { isbn13: null, error: `유사도 미달(${bestScore.toFixed(2)})`, candidateCount: items.length };
  } catch (error) {
    console.error('알라딘 API 오류:', error);
    throw error;
  }
}
