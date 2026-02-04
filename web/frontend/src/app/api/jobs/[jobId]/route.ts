import { NextRequest, NextResponse } from 'next/server';
import { getJob, deleteJob } from '@/lib/store';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = getJob(jobId);

  if (!job) {
    return NextResponse.json(
      { detail: '작업을 찾을 수 없습니다' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    job_id: job.jobId,
    status: job.status,
    progress: job.progress,
    total: job.total,
    message: job.message,
    result_file: job.resultFile,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  if (!deleteJob(jobId)) {
    return NextResponse.json(
      { detail: '작업을 찾을 수 없습니다' },
      { status: 404 }
    );
  }

  return NextResponse.json({ message: `작업 ${jobId} 삭제됨` });
}
