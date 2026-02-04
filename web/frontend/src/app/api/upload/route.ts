import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { readExcelBuffer, getPreview } from '@/lib/excel';
import { setUploadedFile } from '@/lib/store';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { detail: '파일이 없습니다' },
        { status: 400 }
      );
    }

    const filename = file.name;
    if (!filename.endsWith('.xlsx') && !filename.endsWith('.xls')) {
      return NextResponse.json(
        { detail: '엑셀 파일(.xlsx, .xls)만 업로드 가능합니다' },
        { status: 400 }
      );
    }

    // 파일 읽기
    const buffer = await file.arrayBuffer();
    const rows = readExcelBuffer(buffer);

    if (rows.length === 0) {
      return NextResponse.json(
        { detail: '파일에 데이터가 없습니다' },
        { status: 400 }
      );
    }

    // 저장
    const fileId = uuidv4().slice(0, 8);
    setUploadedFile({
      fileId,
      filename,
      data: rows,
      totalRows: rows.length,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      file_id: fileId,
      filename,
      total_rows: rows.length,
      preview: getPreview(rows, 5),
    });
  } catch (error) {
    console.error('파일 업로드 오류:', error);
    return NextResponse.json(
      { detail: `파일 읽기 실패: ${error}` },
      { status: 400 }
    );
  }
}
