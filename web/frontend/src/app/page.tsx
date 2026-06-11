"use client";

import { useState } from "react";
import * as XLSX from "xlsx";

interface BookRow {
  학교명: string;
  도서명: string;
  저자: string;
  출판사: string;
  ISBN13?: string;
}

interface ResultRow {
  학교명: string;
  도서명: string;
  저자: string;
  출판사: string;
  ISBN13: string;
  검색학교: string;
  존재여부: string;
  독서로: string;
  사유: string;
}

interface ManualBook {
  id: string;
  school: string;
  title: string;
  author: string;
  publisher: string;
  isbn?: string;
  status: "pending" | "searching" | "found" | "not_found" | "error";
  result?: string;
}

type Mode = "file" | "manual";

/* ───────────────────── Icon primitives (inline SVG) ───────────────────── */
type IconProps = { className?: string };
const Icon = {
  Upload: ({ className = "h-5 w-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 16V4M12 4l-4 4M12 4l4 4" /><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
    </svg>
  ),
  Cloud: ({ className = "h-8 w-8" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7 18a5 5 0 01-.916-9.916 6 6 0 0111.832-1.168A4.5 4.5 0 0117 18H7z" />
      <path d="M12 12v6M12 12l-3 3M12 12l3 3" />
    </svg>
  ),
  Edit: ({ className = "h-5 w-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 21h4l10-10a2.828 2.828 0 00-4-4L4 17v4z" /><path d="M13.5 7.5l3 3" />
    </svg>
  ),
  Play: ({ className = "h-5 w-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M8 5.14v13.72a1 1 0 001.54.84l10.72-6.86a1 1 0 000-1.68L9.54 4.3A1 1 0 008 5.14z" />
    </svg>
  ),
  Download: ({ className = "h-5 w-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 4v12m0 0l-4-4m4 4l4-4" /><path d="M4 20h16" />
    </svg>
  ),
  Plus: ({ className = "h-5 w-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Search: ({ className = "h-5 w-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
    </svg>
  ),
  Trash: ({ className = "h-4 w-4" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" />
    </svg>
  ),
  X: ({ className = "h-4 w-4" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  Book: ({ className = "h-6 w-6" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 4.5A2.5 2.5 0 016.5 2H20v15H6.5A2.5 2.5 0 004 19.5v-15z" /><path d="M4 19.5A2.5 2.5 0 006.5 22H20v-5" />
    </svg>
  ),
  Sparkles: ({ className = "h-4 w-4" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2zM18 14l.9 2.7L21.6 17.6l-2.7.9L18 21.2l-.9-2.7-2.7-.9 2.7-.9L18 14z" />
    </svg>
  ),
  CheckCircle: ({ className = "h-4 w-4" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" /><path d="M9 12l2 2 4-4" />
    </svg>
  ),
  Warning: ({ className = "h-4 w-4" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10.3 3.86a2 2 0 013.4 0l8.17 13.6A2 2 0 0120.17 21H3.83a2 2 0 01-1.7-3.54L10.3 3.86z" /><path d="M12 9v4M12 17h.01" />
    </svg>
  ),
};

/* ───────────────────── 유틸 ───────────────────── */
// 권수 범위 확장: ".1-2" → ["제목 1", "제목 2"], ".1~3" → ["제목 1", "제목 2", "제목 3"]
function expandVolumeRange(title: string): string[] {
  const match = title.match(/\s*[.]\s*(\d+)\s*[-~]\s*(\d+)\s*$/);
  if (match) {
    const base = title.slice(0, match.index!).trim();
    const start = parseInt(match[1]);
    const end = parseInt(match[2]);
    if (end >= start && end - start < 20) {
      const titles: string[] = [];
      for (let i = start; i <= end; i++) {
        titles.push(`${base} ${i}`);
      }
      return titles;
    }
  }
  return [title];
}

// 컬럼명 별칭 테이블
const COLUMN_ALIASES: Record<string, string[]> = {
  도서명: ["도서명", "서명", "책이름", "book", "title"],
  저자: ["저자", "저자명", "작가", "지은이", "author"],
  출판사: ["출판사", "출판", "publisher"],
  학교명: ["학교명", "학교", "납품처", "school"],
  ISBN: ["isbn", "isbn13", "isbn-13", "isbn 13"],
};

function normalizeHeader(val: string): string {
  return String(val).trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function detectHeaderAndColumns(ws: XLSX.WorkSheet): {
  headerRow: number;
  colMap: Record<string, number>;
  detectedSchool: string;
} | null {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const maxScanRow = Math.min(range.e.r, 29);

  for (let r = range.s.r; r <= maxScanRow; r++) {
    const rowValues: Record<number, string> = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (cell && cell.v != null) {
        rowValues[c] = normalizeHeader(String(cell.v));
      }
    }

    const hasTitle = Object.values(rowValues).some((v) =>
      COLUMN_ALIASES["도서명"].some((alias) => normalizeHeader(alias) === v)
    );
    if (!hasTitle) continue;

    const colMap: Record<string, number> = {};
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      for (const [colStr, val] of Object.entries(rowValues)) {
        if (aliases.some((alias) => normalizeHeader(alias) === val)) {
          colMap[field] = Number(colStr);
          break;
        }
      }
    }

    if (!("ISBN" in colMap)) {
      const scanEnd = Math.min(r + 5, range.e.r);
      for (let dr = r + 1; dr <= scanEnd; dr++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          if (Object.values(colMap).includes(c)) continue;
          const addr = XLSX.utils.encode_cell({ r: dr, c });
          const cell = ws[addr];
          if (cell && cell.v != null) {
            const val = typeof cell.v === "number" ? cell.v.toFixed(0) : String(cell.v).replace(/[\s-]/g, "");
            if (/^97[89]\d{10}$/.test(val)) {
              colMap["ISBN"] = c;
              break;
            }
          }
        }
        if ("ISBN" in colMap) break;
      }
    }

    let detectedSchool = "";
    if (!("학교명" in colMap)) {
      for (let sr = range.s.r; sr < r; sr++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r: sr, c })];
          if (cell && cell.v != null) {
            const text = String(cell.v);
            const match = text.match(/([\uAC00-\uD7A3]+(?:초등학교|중학교|고등학교|학교))/);
            if (match) {
              detectedSchool = match[1];
              break;
            }
          }
        }
        if (detectedSchool) break;
      }
    }

    return { headerRow: r, colMap, detectedSchool };
  }

  return null;
}

/* ───────────────────── 페이지 ───────────────────── */
export default function Home() {
  const [mode, setMode] = useState<Mode>("file");

  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<BookRow[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<ResultRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);
  const PREVIEW_PER_PAGE = 10;
  const [globalSchoolName, setGlobalSchoolName] = useState("");
  const [hasSchoolColumn, setHasSchoolColumn] = useState(true);
  const [hasISBNColumn, setHasISBNColumn] = useState(false);

  const [manualBooks, setManualBooks] = useState<ManualBook[]>([]);
  const [newBook, setNewBook] = useState({
    school: "",
    title: "",
    author: "",
    publisher: "",
  });
  const [isSearching, setIsSearching] = useState(false);

  const parseExcelFile = (selectedFile: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });

        let bestWs: XLSX.WorkSheet | null = null;
        let bestDetected: { headerRow: number; colMap: Record<string, number>; detectedSchool: string } | null = null;
        let bestColCount = 0;
        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          const detected = detectHeaderAndColumns(ws);
          if (detected) {
            const colCount = Object.keys(detected.colMap).length;
            if (colCount > bestColCount) {
              bestWs = ws;
              bestDetected = detected;
              bestColCount = colCount;
            }
          }
        }

        if (!bestWs || !bestDetected) {
          alert("도서명 컬럼을 찾을 수 없습니다. 엑셀에 '도서명' 열이 있는지 확인해주세요.");
          return;
        }

        const ws = bestWs;
        const { headerRow, colMap } = bestDetected;
        const range = XLSX.utils.decode_range(ws["!ref"] || "A1");

        const schoolCol = colMap["학교명"];
        const titleCol = colMap["도서명"];
        const authorCol = colMap["저자"];
        const pubCol = colMap["출판사"];
        const isbnCol = colMap["ISBN"];

        const foundSchool = schoolCol !== undefined;
        const foundISBN = isbnCol !== undefined;
        setHasSchoolColumn(foundSchool);
        setHasISBNColumn(foundISBN);

        const parsed: BookRow[] = [];
        for (let r = headerRow + 1; r <= range.e.r; r++) {
          const getCell = (c: number | undefined): string => {
            if (c === undefined) return "";
            const addr = XLSX.utils.encode_cell({ r, c });
            const cell = ws[addr];
            if (!cell || cell.v == null) return "";
            return String(cell.v).trim();
          };

          const title = getCell(titleCol);
          if (!title) continue;

          const titleLower = title.replace(/\s+/g, "");
          if (/^(합계|총계|소계|계$|총\d)/.test(titleLower)) continue;
          if (/마크|라벨|배송|부가세|공급가/.test(titleLower)) continue;

          let isbn = "";
          if (isbnCol !== undefined) {
            const addr = XLSX.utils.encode_cell({ r, c: isbnCol });
            const cell = ws[addr];
            if (cell && cell.v != null) {
              isbn = typeof cell.v === "number" ? cell.v.toFixed(0) : String(cell.v).trim();
              isbn = isbn.replace(/[\s-]/g, "");
            }
          }

          parsed.push({
            학교명: getCell(schoolCol),
            도서명: title,
            저자: getCell(authorCol),
            출판사: getCell(pubCol),
            ...(isbn ? { ISBN13: isbn } : {}),
          });
        }

        if (parsed.length === 0) {
          alert("파일에 데이터가 없습니다");
          return;
        }

        setFile(selectedFile);
        setParsedRows(parsed);
        setPreviewPage(0);
        setResults([]);
        setProgress(0);
        setMessage("");
        if (!foundSchool) setGlobalSchoolName(bestDetected.detectedSchool || "");
      } catch {
        alert("엑셀 파일 파싱에 실패했습니다");
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) parseExcelFile(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && /\.xlsx?$/.test(droppedFile.name)) {
      parseExcelFile(droppedFile);
    } else {
      alert(".xlsx 또는 .xls 파일만 업로드 가능합니다");
    }
  };

  const startVerification = async () => {
    if (parsedRows.length === 0) return;

    setProcessing(true);
    setResults([]);
    setProgress(0);
    setMessage("처리 시작...");

    const expandedRows: BookRow[] = [];
    for (const row of parsedRows) {
      if (row.ISBN13) {
        expandedRows.push(row);
      } else {
        const titles = expandVolumeRange(row.도서명);
        for (const title of titles) {
          expandedRows.push({ ...row, 도서명: title });
        }
      }
    }

    const total = expandedRows.length;
    setTotalItems(total);
    const newResults: ResultRow[] = new Array(total);
    let completedCount = 0;

    const processOne = async (i: number) => {
      const row = expandedRows[i];
      const school = row.학교명 || globalSchoolName;

      let isbn = row.ISBN13 || "";
      let candidateCount = 0;
      let reason = "";
      let existsMark = "❌";
      let matchedSchool = "";

      if (!isbn) {
        try {
          const res = await fetch("/api/search/aladin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: row.도서명, author: row.저자 }),
          });
          if (res.ok) {
            const data = await res.json();
            isbn = data.isbn13 || "";
            candidateCount = data.candidate_count || 0;
            if (!isbn) reason = `알라딘 ISBN 미확인: ${data.error || "알 수 없음"}`;
          }
        } catch (e) {
          reason = `알라딘 오류: ${e}`;
        }
      }

      let read365Info = "";
      if (isbn) {
        try {
          const res = await fetch("/api/search/book", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isbn, school }),
          });
          if (res.ok) {
            const data = await res.json();
            const schools: string[] = data.matched_schools || [];
            const failedRegions: string[] = data.failed_regions || [];
            existsMark = data.exists ? "✅" : "❌";
            matchedSchool = data.matched_school || school;

            if (data.exists) {
              const region = data.matched_region || "";
              const page = data.matched_page || "";
              if (region && page) {
                read365Info = `${region} ${page}페이지`;
              } else if (region) {
                read365Info = region;
              }

              if (schools.length > 1) {
                reason = `동명 학교 ${schools.length}개 매칭: ${schools.join(", ")}`;
              }
            } else {
              if (data.total_count === 0) {
                reason = "주요 지역에 등록된 도서 없음";
              } else {
                reason = `${school}에 없음 (타 학교 ${data.total_count}권 보유)`;
                if (candidateCount > 1) {
                  reason += ` - 동일 제목 ${candidateCount}개 버전 존재, 도서명을 더 정확히 입력하세요`;
                }
              }
            }

            // 일부 지역 조회 실패 시 "없음"이 불확실할 수 있음을 경고
            if (failedRegions.length > 0) {
              existsMark = data.exists ? existsMark : "⚠️";
              const warn = `⚠️ ${failedRegions.join(", ")} 지역 조회 실패 - 재검증 필요`;
              reason = reason ? `${reason} / ${warn}` : warn;
            }
          }
        } catch (e) {
          reason = `Read365 검색 오류: ${e}`;
        }
      }

      newResults[i] = {
        학교명: school,
        도서명: row.도서명,
        저자: row.저자,
        출판사: row.출판사,
        ISBN13: isbn,
        검색학교: matchedSchool || school,
        존재여부: existsMark,
        독서로: read365Info,
        사유: reason,
      };

      completedCount++;
      setProgress(completedCount);
      setMessage(`처리 중: ${completedCount}/${total} — ${row.도서명.slice(0, 24)}`);
      setResults(newResults.filter(Boolean));
    };

    const CONCURRENCY = 10;
    let nextIdx = 0;
    await new Promise<void>((resolveAll) => {
      let running = 0;
      const launch = () => {
        while (running < CONCURRENCY && nextIdx < total) {
          const idx = nextIdx++;
          running++;
          processOne(idx).finally(() => {
            running--;
            if (nextIdx >= total && running === 0) {
              resolveAll();
            } else {
              launch();
            }
          });
        }
      };
      launch();
    });

    setProgress(total);
    setMessage(`완료! ${total}권 처리됨${total !== parsedRows.length ? ` (원본 ${parsedRows.length}행, 권수 확장 ${total}권)` : ""}`);
    setProcessing(false);
  };

  const downloadResult = () => {
    if (results.length === 0) return;

    const ws = XLSX.utils.json_to_sheet(results, {
      header: ["학교명", "도서명", "저자", "출판사", "ISBN13", "검색학교", "존재여부", "독서로", "사유"],
    });
    ws["!cols"] = [
      { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 15 },
      { wch: 16 }, { wch: 15 }, { wch: 10 }, { wch: 18 }, { wch: 40 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "검증결과");
    XLSX.writeFile(wb, `검증결과_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const resetFileMode = () => {
    setFile(null);
    setParsedRows([]);
    setResults([]);
    setProgress(0);
    setTotalItems(0);
    setMessage("");
    setGlobalSchoolName("");
    setHasSchoolColumn(true);
    setHasISBNColumn(false);
  };

  const addManualBook = () => {
    if (!newBook.school || !newBook.title) {
      alert("학교명과 도서명은 필수입니다");
      return;
    }

    const titles = expandVolumeRange(newBook.title);
    const newBooks: ManualBook[] = titles.map((title, idx) => ({
      id: `${Date.now()}-${idx}`,
      school: newBook.school,
      title,
      author: newBook.author,
      publisher: newBook.publisher,
      status: "pending" as const,
    }));

    setManualBooks((prev) => [...prev, ...newBooks]);
    setNewBook({ school: "", title: "", author: "", publisher: "" });
  };

  const removeManualBook = (id: string) => {
    setManualBooks((prev) => prev.filter((b) => b.id !== id));
  };

  const searchManualBooks = async () => {
    if (manualBooks.length === 0) {
      alert("검색할 도서를 추가해주세요");
      return;
    }

    setIsSearching(true);

    for (let i = 0; i < manualBooks.length; i++) {
      const book = manualBooks[i];

      setManualBooks((prev) =>
        prev.map((b) => (b.id === book.id ? { ...b, status: "searching" } : b))
      );

      try {
        const isbnRes = await fetch("/api/search/aladin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: book.title, author: book.author }),
        });

        let isbn = "";
        let candidateCount = 0;
        if (isbnRes.ok) {
          const isbnData = await isbnRes.json();
          isbn = isbnData.isbn13 || "";
          candidateCount = isbnData.candidate_count || 0;
        }

        if (!isbn) {
          setManualBooks((prev) =>
            prev.map((b) =>
              b.id === book.id
                ? { ...b, status: "error", result: "ISBN을 찾을 수 없습니다" }
                : b
            )
          );
          continue;
        }

        const searchRes = await fetch("/api/search/book", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isbn, school: book.school }),
        });

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const schools: string[] = searchData.matched_schools || [];
          const failedRegions: string[] = searchData.failed_regions || [];
          const multiSchoolWarning =
            schools.length > 1
              ? ` (${schools.join(", ")} 등 ${schools.length}개 학교 동시 매칭 - 학교명을 더 정확히 입력하세요)`
              : "";
          const multiVersionWarning =
            !searchData.exists && candidateCount > 1
              ? ` - 동일 제목 ${candidateCount}개 버전 존재, 도서명을 더 정확히 입력하세요`
              : "";
          const failedWarning =
            failedRegions.length > 0
              ? ` ⚠️ ${failedRegions.join(", ")} 지역 조회 실패 - 재검증 필요`
              : "";
          setManualBooks((prev) =>
            prev.map((b) =>
              b.id === book.id
                ? {
                    ...b,
                    isbn,
                    status: searchData.exists
                      ? "found"
                      : failedRegions.length > 0
                        ? "error"
                        : "not_found",
                    result: searchData.exists
                      ? `✅ ${searchData.matched_school || book.school}에서 발견${multiSchoolWarning}${failedWarning}`
                      : `❌ ${book.school}에 없음 (${searchData.total_count || 0}권 타학교 보유)${multiVersionWarning}${failedWarning}`,
                  }
                : b
            )
          );
        } else {
          throw new Error("검색 실패");
        }
      } catch {
        setManualBooks((prev) =>
          prev.map((b) =>
            b.id === book.id
              ? { ...b, status: "error", result: "검색 오류" }
              : b
          )
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    setIsSearching(false);
  };

  const getBookStatusBadge = (status: ManualBook["status"]) => {
    const config: Record<ManualBook["status"], { bg: string; ring: string; text: string; color: string }> = {
      pending:   { bg: "bg-slate-100",   ring: "ring-slate-200",   text: "대기",      color: "text-slate-600" },
      searching: { bg: "bg-indigo-50",   ring: "ring-indigo-200",  text: "검색 중",    color: "text-indigo-700" },
      found:     { bg: "bg-emerald-50",  ring: "ring-emerald-200", text: "존재",      color: "text-emerald-700" },
      not_found: { bg: "bg-rose-50",     ring: "ring-rose-200",    text: "없음",      color: "text-rose-700" },
      error:     { bg: "bg-amber-50",    ring: "ring-amber-200",   text: "오류",      color: "text-amber-700" },
    };
    const { bg, ring, text, color } = config[status];
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 ${bg} ${color} ring-1 ring-inset ${ring} rounded-full text-xs font-semibold`}>
        {status === "searching" && (
          <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
        )}
        {text}
      </span>
    );
  };

  const isCompleted = results.length > 0 && !processing;

  return (
    <main className="app-bg px-6 py-10">
      <div className="max-w-6xl mx-auto fade-in">
        {/* ───────── Top bar ───────── */}
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/25">
              <Icon.Book className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">독서로 ISBN 검증</h1>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 ring-1 ring-inset ring-indigo-200 rounded-full px-2 py-0.5">
                  <Icon.Sparkles className="h-3 w-3" />
                  v2
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                학교 납품 도서의 Read365 보유 현황을 자동으로 확인합니다
              </p>
            </div>
          </div>
        </header>

        {/* ───────── 세그먼트 탭 ───────── */}
        <div className="inline-flex p-1 bg-white ring-1 ring-slate-200 rounded-xl mb-8 shadow-sm">
          <button
            onClick={() => setMode("file")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
              mode === "file"
                ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon.Upload className="h-4 w-4" />
            파일 업로드
          </button>
          <button
            onClick={() => setMode("manual")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
              mode === "manual"
                ? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon.Edit className="h-4 w-4" />
            수동 입력
          </button>
        </div>

        {/* ========== 파일 업로드 모드 ========== */}
        {mode === "file" && (
          <>
            <section className="card p-6 mb-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span className="inline-block w-1.5 h-5 bg-gradient-to-b from-indigo-500 to-violet-600 rounded-full" />
                  견적서 업로드
                </h3>
                {file && (
                  <button
                    onClick={resetFileMode}
                    className="text-xs text-slate-400 hover:text-slate-600 inline-flex items-center gap-1"
                  >
                    <Icon.X className="h-3.5 w-3.5" /> 초기화
                  </button>
                )}
              </div>

              <label
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                  isDragging
                    ? "border-indigo-500 bg-indigo-50/60"
                    : file
                      ? "border-emerald-300 bg-emerald-50/40"
                      : "border-slate-200 bg-slate-50/40 hover:border-indigo-400 hover:bg-indigo-50/40"
                }`}
              >
                <div className="flex flex-col items-center justify-center text-center px-6">
                  <Icon.Cloud className={`h-10 w-10 mb-2 ${file ? "text-emerald-500" : "text-slate-400"}`} />
                  <p className={`text-sm font-medium ${file ? "text-emerald-700" : "text-slate-600"}`}>
                    {file ? file.name : "엑셀 파일을 드래그하거나 클릭해서 선택"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {file ? "다시 선택하려면 클릭하세요" : ".xlsx 또는 .xls 형식 지원"}
                  </p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  disabled={processing}
                />
              </label>

              {parsedRows.length > 0 && !processing && results.length === 0 && (
                <div className="mt-5">
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200">
                      도서 {parsedRows.length}권
                    </span>
                    {hasISBNColumn && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">
                        <Icon.CheckCircle className="h-3 w-3" /> ISBN 자동 인식
                      </span>
                    )}
                    {!hasSchoolColumn && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">
                        <Icon.Warning className="h-3 w-3" /> 학교명 미포함
                      </span>
                    )}
                  </div>

                  {!hasSchoolColumn && (
                    <div className="mb-5 p-4 rounded-xl bg-amber-50/70 ring-1 ring-inset ring-amber-200">
                      <label className="text-[11px] font-bold text-amber-700 uppercase tracking-wider mb-2 block">
                        학교명 입력 <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={globalSchoolName}
                        onChange={(e) => setGlobalSchoolName(e.target.value)}
                        placeholder="예: 수택고등학교"
                        className="w-full bg-white ring-1 ring-amber-200 focus:ring-2 focus:ring-amber-400 focus:outline-none text-slate-700 text-sm rounded-lg px-3 py-2.5 font-medium transition"
                      />
                      <p className="text-xs text-amber-600/80 mt-2">엑셀에 학교명 컬럼이 없습니다. 검증에 사용할 학교명을 입력해주세요.</p>
                    </div>
                  )}

                  <div className="rounded-xl ring-1 ring-slate-200 overflow-hidden">
                    <div className="overflow-x-auto scroll-slim">
                      <table className="w-full text-sm text-left">
                        <thead className="text-[11px] text-slate-500 uppercase tracking-wider bg-slate-50/70 border-b border-slate-100">
                          <tr>
                            {hasSchoolColumn && <th className="px-4 py-3 font-semibold">학교명</th>}
                            <th className="px-4 py-3 font-semibold">도서명</th>
                            <th className="px-4 py-3 font-semibold">저자</th>
                            <th className="px-4 py-3 font-semibold">출판사</th>
                            {hasISBNColumn && <th className="px-4 py-3 font-semibold">ISBN</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {parsedRows
                            .slice(previewPage * PREVIEW_PER_PAGE, (previewPage + 1) * PREVIEW_PER_PAGE)
                            .map((row, i) => (
                            <tr key={i} className="bg-white hover:bg-slate-50/70 transition-colors">
                              {hasSchoolColumn && <td className="px-4 py-3 font-medium text-slate-700">{row.학교명}</td>}
                              <td className="px-4 py-3 text-slate-700">{row.도서명}</td>
                              <td className="px-4 py-3 text-slate-500">{row.저자}</td>
                              <td className="px-4 py-3 text-slate-500">{row.출판사}</td>
                              {hasISBNColumn && <td className="px-4 py-3 font-mono text-xs text-slate-400">{row.ISBN13 || "—"}</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {parsedRows.length > PREVIEW_PER_PAGE && (
                      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/60">
                        <span className="text-xs text-slate-500 font-medium">
                          {previewPage * PREVIEW_PER_PAGE + 1}–{Math.min((previewPage + 1) * PREVIEW_PER_PAGE, parsedRows.length)} / {parsedRows.length}
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setPreviewPage((p) => Math.max(0, p - 1))}
                            disabled={previewPage === 0}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg ring-1 ring-inset ring-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                          >
                            이전
                          </button>
                          <button
                            onClick={() => setPreviewPage((p) => Math.min(Math.ceil(parsedRows.length / PREVIEW_PER_PAGE) - 1, p + 1))}
                            disabled={previewPage >= Math.ceil(parsedRows.length / PREVIEW_PER_PAGE) - 1}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg ring-1 ring-inset ring-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                          >
                            다음
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            {parsedRows.length > 0 && !processing && results.length === 0 && (
              <button
                onClick={startVerification}
                disabled={!hasSchoolColumn && !globalSchoolName}
                className="group w-full bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-semibold py-3.5 px-6 rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:shadow-indigo-500/30 transition-all flex items-center justify-center gap-2"
              >
                <Icon.Play className="h-5 w-5" />
                검증 시작
              </button>
            )}

            {(processing || isCompleted) && (
              <section className="card p-6 mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span className={`inline-block w-1.5 h-5 rounded-full ${isCompleted ? "bg-emerald-500" : "bg-gradient-to-b from-indigo-500 to-violet-600"}`} />
                    {isCompleted ? "검증 완료" : "검증 진행 중"}
                  </h3>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset ${
                    isCompleted
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                      : "bg-indigo-50 text-indigo-700 ring-indigo-200"
                  }`}>
                    {isCompleted ? <Icon.CheckCircle className="h-3 w-3" /> : <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />}
                    {isCompleted ? "완료" : "진행 중"}
                  </span>
                </div>

                <p className="text-sm text-slate-600 mb-4 font-medium">{message}</p>

                {totalItems > 0 && (
                  <div className="mb-6">
                    <div className="flex justify-between text-xs text-slate-500 mb-2">
                      <span className="font-bold uppercase tracking-wider">진행률</span>
                      <span className="font-semibold text-slate-700">
                        {progress} / {totalItems}
                        <span className="text-slate-400 font-normal ml-1">
                          ({Math.round((progress / totalItems) * 100)}%)
                        </span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-2.5 rounded-full transition-all duration-300 ${isCompleted ? "bg-emerald-500" : "progress-fill"}`}
                        style={{ width: `${(progress / totalItems) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {isCompleted && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={downloadResult}
                      className="flex-1 bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold py-3 px-6 rounded-xl shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30 transition-all flex items-center justify-center gap-2"
                    >
                      <Icon.Download className="h-4 w-4" />
                      결과 엑셀 다운로드
                    </button>
                    <button
                      onClick={resetFileMode}
                      className="sm:flex-none bg-white ring-1 ring-inset ring-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-3 px-6 rounded-xl transition"
                    >
                      새 작업 시작
                    </button>
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {/* ========== 수동 입력 모드 ========== */}
        {mode === "manual" && (
          <>
            <section className="card p-6 mb-6">
              <h3 className="text-base font-bold text-slate-900 mb-5 flex items-center gap-2">
                <span className="inline-block w-1.5 h-5 bg-gradient-to-b from-indigo-500 to-violet-600 rounded-full" />
                도서 정보 입력
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                {[
                  { key: "school" as const, label: "학교명", required: true, placeholder: "예: 금남초등학교" },
                  { key: "title" as const, label: "도서명", required: true, placeholder: "예: 해리포터와 마법사의 돌" },
                  { key: "author" as const, label: "저자", required: false, placeholder: "예: J.K. 롤링" },
                  { key: "publisher" as const, label: "출판사", required: false, placeholder: "예: 문학수첩" },
                ].map(({ key, label, required, placeholder }) => (
                  <div key={key}>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">
                      {label} {required && <span className="text-rose-500">*</span>}
                    </label>
                    <input
                      type="text"
                      value={newBook[key]}
                      onChange={(e) => setNewBook({ ...newBook, [key]: e.target.value })}
                      placeholder={placeholder}
                      className="w-full bg-white ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-800 text-sm rounded-lg px-3 py-2.5 font-medium transition placeholder:text-slate-300"
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={addManualBook}
                className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 px-4 rounded-lg transition"
              >
                <Icon.Plus className="h-4 w-4" />
                도서 추가
              </button>
            </section>

            {manualBooks.length > 0 && (
              <section className="card overflow-hidden mb-6">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200">
                      {manualBooks.length}권
                    </span>
                    검색 목록
                  </h3>
                  <button
                    onClick={() => setManualBooks([])}
                    className="text-xs text-slate-400 hover:text-rose-600 font-medium inline-flex items-center gap-1 transition"
                  >
                    <Icon.Trash className="h-3.5 w-3.5" />
                    전체 삭제
                  </button>
                </div>

                <div className="overflow-x-auto scroll-slim">
                  <table className="w-full text-sm text-left">
                    <thead className="text-[11px] text-slate-500 uppercase tracking-wider bg-slate-50/70 border-b border-slate-100">
                      <tr>
                        <th className="px-4 py-3 font-semibold">학교명</th>
                        <th className="px-4 py-3 font-semibold">도서명</th>
                        <th className="px-4 py-3 font-semibold">저자</th>
                        <th className="px-4 py-3 font-semibold">ISBN</th>
                        <th className="px-4 py-3 font-semibold">상태</th>
                        <th className="px-4 py-3 font-semibold">결과</th>
                        <th className="px-4 py-3 text-center font-semibold"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {manualBooks.map((book) => (
                        <tr key={book.id} className="bg-white hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-700">{book.school}</td>
                          <td className="px-4 py-3 text-slate-700">{book.title}</td>
                          <td className="px-4 py-3 text-slate-500">{book.author || "—"}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-400">{book.isbn || "—"}</td>
                          <td className="px-4 py-3">{getBookStatusBadge(book.status)}</td>
                          <td className="px-4 py-3 text-xs text-slate-600">{book.result || "—"}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => removeManualBook(book.id)}
                              className="text-slate-300 hover:text-rose-500 transition-colors disabled:opacity-30"
                              disabled={isSearching}
                            >
                              <Icon.X className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50/40">
                  <button
                    onClick={searchManualBooks}
                    disabled={isSearching}
                    className="w-full bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 text-white font-semibold py-3 px-6 rounded-xl shadow-md shadow-indigo-500/20 hover:shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    {isSearching ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        검색 중...
                      </>
                    ) : (
                      <>
                        <Icon.Search className="h-4 w-4" />
                        전체 검색 시작
                      </>
                    )}
                  </button>
                </div>
              </section>
            )}

            {manualBooks.length === 0 && (
              <section className="card p-12 text-center">
                <div className="mx-auto h-14 w-14 rounded-2xl bg-slate-50 ring-1 ring-inset ring-slate-200 flex items-center justify-center mb-4">
                  <Icon.Book className="h-7 w-7 text-slate-300" />
                </div>
                <p className="text-slate-500 font-medium text-sm">
                  검색할 도서를 추가해주세요
                </p>
                <p className="text-slate-400 text-xs mt-1">
                  위 입력란을 채우고 &ldquo;도서 추가&rdquo; 버튼을 눌러보세요
                </p>
              </section>
            )}
          </>
        )}

        {/* ───────── Footer ───────── */}
        <footer className="mt-16 text-center">
          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} 독서로 ISBN 검증 시스템 · 데이터 출처: Read365
          </p>
        </footer>
      </div>
    </main>
  );
}
