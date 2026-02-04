import { NextRequest, NextResponse } from 'next/server';
import { searchISBN, getProvCode } from '@/lib/read365';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { isbn, region } = body;

    if (!isbn) {
      return NextResponse.json(
        { detail: 'ISBN은 필수입니다' },
        { status: 400 }
      );
    }

    const provCode = region ? getProvCode(region) : null;

    const result = await searchISBN(isbn, provCode, 1, 100);

    return NextResponse.json({
      isbn,
      region,
      prov_code: provCode,
      total_count: result.totalCount,
      books: result.books.slice(0, 10),
    });
  } catch (error) {
    console.error('ISBN 검색 오류:', error);
    return NextResponse.json(
      { detail: `Read365 API 오류: ${error}` },
      { status: 500 }
    );
  }
}
