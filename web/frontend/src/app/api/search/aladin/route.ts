import { NextRequest, NextResponse } from 'next/server';
import { searchISBNByTitleAuthor } from '@/lib/aladin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, author } = body;

    if (!title) {
      return NextResponse.json(
        { detail: '도서명은 필수입니다' },
        { status: 400 }
      );
    }

    const ttbKey = process.env.ALADIN_TTB_KEY;
    if (!ttbKey) {
      return NextResponse.json(
        { detail: 'ALADIN_TTB_KEY가 설정되지 않았습니다' },
        { status: 500 }
      );
    }

    const result = await searchISBNByTitleAuthor(ttbKey, title, author || '', 0.6);

    return NextResponse.json({
      title,
      author: author || '',
      isbn13: result.isbn13,
      error: result.error,
    });
  } catch (error) {
    console.error('알라딘 검색 오류:', error);
    return NextResponse.json(
      { detail: `알라딘 API 오류: ${error}` },
      { status: 500 }
    );
  }
}
