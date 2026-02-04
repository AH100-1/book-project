import { NextRequest, NextResponse } from 'next/server';
import { searchISBNMultiRegion, findSchoolBooks } from '@/lib/read365';

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
    const { totalCount, books } = await searchISBNMultiRegion(isbn, region, 6);

    // 특정 학교 도서 찾기
    const { found, matchedSchool } = findSchoolBooks(books, school);

    const exists = found.length > 0;

    return NextResponse.json({
      isbn,
      school,
      exists,
      school_count: found.length,
      total_count: totalCount,
      matched_school: matchedSchool,
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
