import { NextResponse } from 'next/server';
import { getAllJobs } from '@/lib/store';

export async function GET() {
  const jobs = getAllJobs();

  return NextResponse.json({
    jobs: jobs.map((job) => ({
      job_id: job.jobId,
      status: job.status,
      progress: job.progress,
      total: job.total,
      message: job.message,
      result_file: job.resultFile,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
    })),
  });
}
