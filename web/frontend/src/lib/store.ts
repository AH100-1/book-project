/**
 * 작업 상태 저장소 (메모리 기반)
 * 서버리스 환경에서는 요청 간에 공유되지 않을 수 있음
 * 프로덕션에서는 Redis나 DB 사용 권장
 */

import { BookRow, ResultRow } from './excel';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Job {
  jobId: string;
  status: JobStatus;
  progress: number;
  total: number;
  message: string;
  resultFile: string | null;
  inputData: BookRow[];
  results: ResultRow[];
  region: string;
  schoolLevel: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadedFile {
  fileId: string;
  filename: string;
  data: BookRow[];
  totalRows: number;
  createdAt: string;
}

// 메모리 저장소
const jobs = new Map<string, Job>();
const uploadedFiles = new Map<string, UploadedFile>();

export function getJob(jobId: string): Job | null {
  return jobs.get(jobId) || null;
}

export function setJob(job: Job): void {
  jobs.set(job.jobId, job);
}

export function getAllJobs(): Job[] {
  return Array.from(jobs.values());
}

export function deleteJob(jobId: string): boolean {
  return jobs.delete(jobId);
}

export function getUploadedFile(fileId: string): UploadedFile | null {
  return uploadedFiles.get(fileId) || null;
}

export function setUploadedFile(file: UploadedFile): void {
  uploadedFiles.set(file.fileId, file);
}

export function deleteUploadedFile(fileId: string): boolean {
  return uploadedFiles.delete(fileId);
}
