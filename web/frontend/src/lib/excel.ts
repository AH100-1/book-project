/**
 * 엑셀 처리 유틸리티
 */

import * as XLSX from 'xlsx';

export interface BookRow {
  학교명: string;
  도서명: string;
  저자: string;
  출판사: string;
}

export interface ResultRow extends BookRow {
  ISBN13: string;
  검색학교: string;
  존재여부: string;
  사유: string;
}

const INPUT_COLUMNS = ['학교명', '도서명', '저자', '출판사'];
const OUTPUT_COLUMNS = ['학교명', '도서명', '저자', '출판사', 'ISBN13', '검색학교', '존재여부', '사유'];

export function readExcelBuffer(buffer: ArrayBuffer): BookRow[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // JSON으로 변환
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

  // 필수 컬럼 확인 및 정규화
  return rows.map((row) => ({
    학교명: String(row['학교명'] || '').trim(),
    도서명: String(row['도서명'] || '').trim(),
    저자: String(row['저자'] || '').trim(),
    출판사: String(row['출판사'] || '').trim(),
  }));
}

export function createResultExcel(results: ResultRow[]): Uint8Array {
  // 워크시트 생성
  const worksheet = XLSX.utils.json_to_sheet(results, {
    header: OUTPUT_COLUMNS,
  });

  // 컬럼 너비 설정
  worksheet['!cols'] = [
    { wch: 15 }, // 학교명
    { wch: 40 }, // 도서명
    { wch: 20 }, // 저자
    { wch: 15 }, // 출판사
    { wch: 15 }, // ISBN13
    { wch: 15 }, // 검색학교
    { wch: 10 }, // 존재여부
    { wch: 30 }, // 사유
  ];

  // 워크북 생성
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '검증결과');

  // Uint8Array로 반환 (NextResponse 호환)
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

export function getPreview(rows: BookRow[], limit: number = 5): BookRow[] {
  return rows.slice(0, limit);
}
