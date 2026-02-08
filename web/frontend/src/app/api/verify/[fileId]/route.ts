import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getUploadedFile, setJob, getJob } from '@/lib/store';
import { searchISBNByTitleAuthor } from '@/lib/aladin';
import { searchISBNMultiRegion, findSchoolBooks } from '@/lib/read365';
import { cache } from '@/lib/cache';
import { ResultRow } from '@/lib/excel';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    const body = await request.json();
    const { region, school_level } = body;

    // 업로드된 파일 찾기
    const uploadedFile = getUploadedFile(fileId);
    if (!uploadedFile) {
      return NextResponse.json(
        { detail: '파일을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    const ttbKey = process.env.ALADIN_TTB_KEY;
    if (!ttbKey) {
      return NextResponse.json(
        { detail: 'ALADIN_TTB_KEY가 설정되지 않았습니다' },
        { status: 500 }
      );
    }

    // 작업 생성
    const jobId = uuidv4().slice(0, 8);
    const now = new Date().toISOString();

    const job = {
      jobId,
      status: 'running' as const,
      progress: 0,
      total: uploadedFile.totalRows,
      message: '처리 시작...',
      resultFile: null,
      inputData: uploadedFile.data,
      results: [] as ResultRow[],
      region: region || '경기',
      schoolLevel: school_level || '초등학교',
      createdAt: now,
      updatedAt: now,
    };

    setJob(job);

    // 백그라운드에서 처리 시작 (async)
    processVerification(jobId, ttbKey).catch((err) => {
      console.error('검증 처리 오류:', err);
      const j = getJob(jobId);
      if (j) {
        j.status = 'failed';
        j.message = `오류: ${err}`;
        j.updatedAt = new Date().toISOString();
        setJob(j);
      }
    });

    return NextResponse.json({
      job_id: jobId,
      message: '작업이 시작되었습니다 (API 모드)',
    });
  } catch (error) {
    console.error('검증 시작 오류:', error);
    return NextResponse.json(
      { detail: `오류: ${error}` },
      { status: 500 }
    );
  }
}

async function processVerification(jobId: string, ttbKey: string) {
  const job = getJob(jobId);
  if (!job) return;

  const { inputData, region } = job;
  const results: ResultRow[] = [];

  for (let i = 0; i < inputData.length; i++) {
    const row = inputData[i];
    const { 학교명: school, 도서명: title, 저자: author, 출판사: publisher } = row;

    let isbn13: string | null = null;
    let candidateCount = 0;
    let reason = '';
    let existsMark = '❌';
    let matchedSchool: string | null = null;

    // 1. ISBN 캐시 확인
    const cachedISBN = cache.getISBN(title, author);
    if (cachedISBN) {
      isbn13 = cachedISBN.isbn13;
      if (cachedISBN.error) {
        reason = cachedISBN.error;
      }
    } else {
      // 알라딘 API로 ISBN 검색
      try {
        const result = await searchISBNByTitleAuthor(ttbKey, title, author, 0.6);
        isbn13 = result.isbn13;
        candidateCount = result.candidateCount;
        cache.setISBN(title, author, isbn13, result.error);
        if (!isbn13) {
          reason = `알라딘 ISBN 미확인: ${result.error || '알 수 없음'}`;
        }
      } catch (err) {
        reason = `알라딘 오류: ${err}`;
        cache.setISBN(title, author, null, reason);
      }
    }

    // 2. Read365 검색
    if (isbn13) {
      const cachedSearch = cache.getSearch(school, isbn13);
      if (cachedSearch) {
        existsMark = cachedSearch.exists ? '✅' : '❌';
        matchedSchool = cachedSearch.matchedSchool;
        if (cachedSearch.error) {
          reason = cachedSearch.error;
        }
      } else {
        try {
          const { totalCount, books } = await searchISBNMultiRegion(isbn13);
          const { found, matchedSchool: matched, matchedSchools } = findSchoolBooks(books, school);

          const exists = found.length > 0;
          existsMark = exists ? '✅' : '❌';
          matchedSchool = matched;

          cache.setSearch(school, isbn13, exists, found.length, matchedSchool);

          if (exists && matchedSchools.length > 1) {
            reason = `동명 학교 ${matchedSchools.length}개 매칭: ${matchedSchools.join(', ')}`;
          } else if (!exists) {
            if (totalCount === 0) {
              reason = '주요 지역에 등록된 도서 없음';
            } else {
              reason = `${school}에 없음 (타 학교 ${totalCount}권 보유)`;
              if (candidateCount > 1) {
                reason += ` - 동일 제목 ${candidateCount}개 버전 존재, 도서명을 더 정확히 입력하세요`;
              }
            }
          }
        } catch (err) {
          reason = `Read365 검색 오류: ${err}`;
          cache.setSearch(school, isbn13, false, 0, null, reason);
        }
      }
    }

    results.push({
      학교명: school,
      도서명: title,
      저자: author,
      출판사: publisher,
      ISBN13: isbn13 || '',
      검색학교: matchedSchool || school,
      존재여부: existsMark,
      사유: reason,
    });

    // 진행 상태 업데이트
    job.progress = i + 1;
    job.message = `처리 중: ${i + 1}/${inputData.length} - ${title.slice(0, 20)}...`;
    job.updatedAt = new Date().toISOString();
    job.results = results;
    setJob(job);

    // 잠시 대기 (API 부하 방지)
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // 완료
  job.status = 'completed';
  job.message = `완료! ${inputData.length}권 처리됨 (API 모드)`;
  job.resultFile = `result_${jobId}`;
  job.results = results;
  job.updatedAt = new Date().toISOString();
  setJob(job);
}
