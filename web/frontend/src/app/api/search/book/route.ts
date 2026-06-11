import { NextRequest, NextResponse } from 'next/server';
import { searchISBNMultiRegion, findSchoolBooks } from '@/lib/read365';

// 인기 도서는 전국 페이지네이션이 오래 걸릴 수 있어 기본 타임아웃(10~15초)으로는 잘림.
// Vercel 함수 최대 실행 시간을 늘려 도중에 끊겨 false negative가 나는 것을 방지한다.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { isbn, school, region } = body;

    if (!isbn) {
      return NextResponse.json(
        { detail: 'ISBN은 필수입니다' },
        { status: 400 }
      );
    }

    if (!school) {
      return NextResponse.json(
        { detail: '학교명은 필수입니다' },
        { status: 400 }
      );
    }

    // 여러 지역에서 검색
    const { totalCount, books, failedRegions } = await searchISBNMultiRegion(isbn);

    // 특정 학교 도서 찾기
    const { found, matchedSchool, matchedSchools, matchedRegion, matchedPage } = findSchoolBooks(books, school);

    const exists = found.length > 0;

    return NextResponse.json({
      isbn,
      school,
      exists,
      school_count: found.length,
      total_count: totalCount,
      matched_school: matchedSchool,
      matched_schools: matchedSchools,
      matched_region: matchedRegion,
      matched_page: matchedPage,
      failed_regions: failedRegions,
      books: found.slice(0, 5),
    });
  } catch (error) {
    console.error('도서 검색 오류:', error);
    return NextResponse.json(
      { detail: `Read365 API 오류: ${error}` },
      { status: 500 }
    );
  }
}
