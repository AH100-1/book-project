/**
 * 메모리 캐시 - ISBN 및 검색 결과 캐싱
 */

interface ISBNResult {
  isbn13: string | null;
  error: string | null;
}

interface SearchResult {
  exists: boolean;
  itemCount: number;
  matchedSchool: string | null;
  error: string | null;
}

interface CacheStats {
  isbnHits: number;
  isbnMisses: number;
  searchHits: number;
  searchMisses: number;
  isbnCacheSize: number;
  searchCacheSize: number;
}

function normalizeKey(text: string): string {
  return text.toLowerCase().replace(/\s/g, '');
}

function makeISBNKey(title: string, author: string): string {
  return `${normalizeKey(title)}|${normalizeKey(author)}`;
}

function makeSearchKey(school: string, isbn: string): string {
  return `${normalizeKey(school)}|${isbn}`;
}

class ResultCache {
  private isbnCache: Map<string, ISBNResult> = new Map();
  private searchCache: Map<string, SearchResult> = new Map();
  private stats: CacheStats = {
    isbnHits: 0,
    isbnMisses: 0,
    searchHits: 0,
    searchMisses: 0,
    isbnCacheSize: 0,
    searchCacheSize: 0,
  };

  getISBN(title: string, author: string): ISBNResult | null {
    const key = makeISBNKey(title, author);
    const result = this.isbnCache.get(key);

    if (result !== undefined) {
      this.stats.isbnHits++;
      return result;
    }

    this.stats.isbnMisses++;
    return null;
  }

  setISBN(title: string, author: string, isbn13: string | null, error: string | null = null): void {
    const key = makeISBNKey(title, author);
    this.isbnCache.set(key, { isbn13, error });
    this.stats.isbnCacheSize = this.isbnCache.size;
  }

  getSearch(school: string, isbn: string): SearchResult | null {
    const key = makeSearchKey(school, isbn);
    const result = this.searchCache.get(key);

    if (result !== undefined) {
      this.stats.searchHits++;
      return result;
    }

    this.stats.searchMisses++;
    return null;
  }

  setSearch(
    school: string,
    isbn: string,
    exists: boolean,
    itemCount: number,
    matchedSchool: string | null = null,
    error: string | null = null
  ): void {
    const key = makeSearchKey(school, isbn);
    this.searchCache.set(key, { exists, itemCount, matchedSchool, error });
    this.stats.searchCacheSize = this.searchCache.size;
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  clear(): void {
    this.isbnCache.clear();
    this.searchCache.clear();
    this.stats = {
      isbnHits: 0,
      isbnMisses: 0,
      searchHits: 0,
      searchMisses: 0,
      isbnCacheSize: 0,
      searchCacheSize: 0,
    };
  }
}

// 싱글톤 인스턴스 (서버리스 환경에서는 요청 간에 공유되지 않을 수 있음)
export const cache = new ResultCache();

export type { ISBNResult, SearchResult, CacheStats };
