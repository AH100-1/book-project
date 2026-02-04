import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/store';
import { createResultExcel } from '@/lib/excel';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // result_{jobId} 형식에서 jobId 추출
  const jobId = filename.replace('result_', '');
  const job = getJob(jobId);

  if (!job) {
    return NextResponse.json(
      { detail: '파일을 찾을 수 없습니다' },
      { status: 404 }
    );
  }

  if (job.status !== 'completed' || !job.results || job.results.length === 0) {
    return NextResponse.json(
      { detail: '결과가 아직 준비되지 않았습니다' },
      { status: 400 }
    );
  }

  // 엑셀 파일 생성
  const excelBuffer = createResultExcel(job.results);

  // 응답 반환 (Uint8Array를 Response에서 사용 가능한 형태로 변환)
  return new NextResponse(excelBuffer.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
    },
  });
}
