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
  const maxScanRow = Math.min(range.e.r, 29); // 최대 30행 탐색

  for (let r = range.s.r; r <= maxScanRow; r++) {
    const rowValues: Record<number, string> = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (cell && cell.v != null) {
        rowValues[c] = normalizeHeader(String(cell.v));
      }
    }

    // "도서명" 키워드가 있는 행을 헤더로 판정
    const hasTitle = Object.values(rowValues).some((v) =>
      COLUMN_ALIASES["도서명"].some((alias) => normalizeHeader(alias) === v)
    );
    if (!hasTitle) continue;

    // 각 필드의 컬럼 위치 매핑
    const colMap: Record<string, number> = {};
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      for (const [colStr, val] of Object.entries(rowValues)) {
        if (aliases.some((alias) => normalizeHeader(alias) === val)) {
          colMap[field] = Number(colStr);
          break;
        }
      }
    }

    // 숨겨진 ISBN 감지: 헤더에 없으면 데이터 행에서 978/979로 시작하는 13자리 숫자 찾기
    // 첫 행이 비어있을 수 있으므로 최대 5행 탐색
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

    // 헤더 위 영역에서 학교명 자동 추출
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

export default function Home() {
  const [mode, setMode] = useState<Mode>("file");

  // 파일 모드 상태
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

  // 수동 입력 모드용 상태
  const [manualBooks, setManualBooks] = useState<ManualBook[]>([]);
  const [newBook, setNewBook] = useState({
    school: "",
    title: "",
    author: "",
    publisher: "",
  });
  const [isSearching, setIsSearching] = useState(false);

  // 엑셀 파일 클라이언트에서 파싱
  const parseExcelFile = (selectedFile: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });

        // 모든 시트를 탐색하여 가장 많은 컬럼이 매핑되는 시트 선택
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
          if (!title) continue; // 빈 행 스킵

          // 합계/소계/비도서 행 스킵
          const titleLower = title.replace(/\s+/g, "");
          if (/^(합계|총계|소계|계$|총\d)/.test(titleLower)) continue;
          if (/마크|라벨|배송|부가세|공급가/.test(titleLower)) continue;

          let isbn = "";
          if (isbnCol !== undefined) {
            const addr = XLSX.utils.encode_cell({ r, c: isbnCol });
            const cell = ws[addr];
            if (cell && cell.v != null) {
              // 숫자형이면 지수 표기 방지
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

  // 검증 시작 - 클라이언트에서 직접 한 권씩 처리
  const startVerification = async () => {
    if (parsedRows.length === 0) return;

    setProcessing(true);
    setResults([]);
    setProgress(0);
    setMessage("처리 시작...");

    // 권수 범위 확장 (예: ".1-2" → 1권, 2권 각각) — ISBN이 있는 행은 이미 정확한 도서이므로 확장 불필요
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

    // 한 권 처리 함수
    const processOne = async (i: number) => {
      const row = expandedRows[i];
      const school = row.학교명 || globalSchoolName;

      let isbn = row.ISBN13 || "";
      let candidateCount = 0;
      let reason = "";
      let existsMark = "❌";
      let matchedSchool = "";

      // 1. 알라딘 API로 ISBN 검색 (엑셀에 ISBN이 있으면 스킵)
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

      // 2. Read365 검색
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
      setMessage(`처리 중: ${completedCount}/${total} - ${row.도서명.slice(0, 20)}...`);
      setResults(newResults.filter(Boolean));
    };

    // 슬라이딩 윈도우: 항상 5개가 동시 실행, 1개 끝나면 바로 다음 투입
    const CONCURRENCY = 5;
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

  // 결과 엑셀 다운로드
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

  // 새 작업 시작
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

  // 수동 입력: 도서 추가 (권수 범위 자동 확장)
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

  // 수동 입력: 도서 삭제
  const removeManualBook = (id: string) => {
    setManualBooks((prev) => prev.filter((b) => b.id !== id));
  };

  // 수동 입력: 전체 검색
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
          const multiSchoolWarning =
            schools.length > 1
              ? ` (${schools.join(", ")} 등 ${schools.length}개 학교 동시 매칭 - 학교명을 더 정확히 입력하세요)`
              : "";
          const multiVersionWarning =
            !searchData.exists && candidateCount > 1
              ? ` - 동일 제목 ${candidateCount}개 버전 존재, 도서명을 더 정확히 입력하세요`
              : "";
          setManualBooks((prev) =>
            prev.map((b) =>
              b.id === book.id
                ? {
                    ...b,
                    isbn,
                    status: searchData.exists ? "found" : "not_found",
                    result: searchData.exists
                      ? `✅ ${searchData.matched_school || book.school}에서 발견${multiSchoolWarning}`
                      : `❌ ${book.school}에 없음 (${searchData.total_count || 0}권 타학교 보유)${multiVersionWarning}`,
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
    const config: Record<ManualBook["status"], { bg: string; text: string; textColor: string }> = {
      pending: { bg: "bg-slate-100", text: "대기", textColor: "text-slate-600" },
      searching: { bg: "bg-blue-100", text: "검색 중...", textColor: "text-blue-700" },
      found: { bg: "bg-green-100", text: "존재", textColor: "text-green-700" },
      not_found: { bg: "bg-red-100", text: "없음", textColor: "text-red-700" },
      error: { bg: "bg-yellow-100", text: "오류", textColor: "text-yellow-700" },
    };
    const { bg, text, textColor } = config[status];
    return <span className={`px-2 py-1 ${bg} ${textColor} rounded text-xs font-bold`}>{text}</span>;
  };

  const isCompleted = results.length > 0 && !processing;

  return (
    <main className="min-h-screen bg-bg-light p-8">
      <div className="max-w-5xl mx-auto fade-in">
        {/* 헤더 */}
        <header className="flex justify-between items-end mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <span className="text-blue-600"></span> 독서로 ISBN 검증 시스템
              </h1>
            </div>
            <p className="text-slate-500 text-sm">
              학교 도서관 구매 도서의 Read365 존재 여부를 자동으로 검증합니다
            </p>
          </div>
        </header>

        {/* 모드 선택 탭 */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMode("file")}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 ${
              mode === "file"
                ? "text-blue-600 bg-blue-50 border-2 border-blue-200"
                : "text-slate-500 bg-white border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <span className="material-icons-outlined text-sm">upload_file</span>
            파일 업로드
          </button>
          <button
            onClick={() => setMode("manual")}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 ${
              mode === "manual"
                ? "text-blue-600 bg-blue-50 border-2 border-blue-200"
                : "text-slate-500 bg-white border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <span className="material-icons-outlined text-sm">edit_note</span>
            수동 입력
          </button>
        </div>

        {/* ========== 파일 업로드 모드 ========== */}
        {mode === "file" && (
          <>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="w-1 h-5 bg-indigo-500 rounded-full"></span>
                파일 업로드
              </h3>

              <label
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                  isDragging
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-300 hover:bg-slate-50 hover:border-blue-400"
                }`}
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <span className="material-icons-outlined text-4xl text-slate-400 mb-2">cloud_upload</span>
                  <p className="text-sm text-slate-500 font-medium">
                    {file ? file.name : "파일을 드래그하거나 클릭하여 선택하세요 (.xlsx)"}
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
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded font-bold">
                      {parsedRows.length}권
                    </span>
                    <span className="text-slate-600 text-sm font-medium">의 도서가 포함되어 있습니다</span>
                    {hasISBNColumn && (
                      <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded font-bold">ISBN 포함</span>
                    )}
                    {!hasSchoolColumn && (
                      <span className="bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded font-bold">학교명 미포함</span>
                    )}
                  </div>

                  {!hasSchoolColumn && (
                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <label className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2 block">
                        학교명 입력 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={globalSchoolName}
                        onChange={(e) => setGlobalSchoolName(e.target.value)}
                        placeholder="예: 수택고등학교"
                        className="w-full bg-white border border-amber-300 text-slate-700 text-sm rounded-xl focus:ring-amber-500 focus:border-amber-500 block p-2.5 font-medium"
                      />
                      <p className="text-xs text-amber-500 mt-1">엑셀에 학교명 컬럼이 없습니다. 검증에 사용할 학교명을 입력해주세요.</p>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                        <tr>
                          {hasSchoolColumn && <th className="px-4 py-3 font-bold">학교명</th>}
                          <th className="px-4 py-3 font-bold">도서명</th>
                          <th className="px-4 py-3 font-bold">저자</th>
                          <th className="px-4 py-3 font-bold">출판사</th>
                          {hasISBNColumn && <th className="px-4 py-3 font-bold">ISBN</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedRows
                          .slice(previewPage * PREVIEW_PER_PAGE, (previewPage + 1) * PREVIEW_PER_PAGE)
                          .map((row, i) => (
                          <tr key={i} className="bg-white hover:bg-slate-50 transition-colors">
                            {hasSchoolColumn && <td className="px-4 py-3 font-medium text-slate-700">{row.학교명}</td>}
                            <td className="px-4 py-3 text-slate-600">{row.도서명}</td>
                            <td className="px-4 py-3 text-slate-500">{row.저자}</td>
                            <td className="px-4 py-3 text-slate-500">{row.출판사}</td>
                            {hasISBNColumn && <td className="px-4 py-3 font-mono text-xs text-slate-400">{row.ISBN13 || "-"}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsedRows.length > PREVIEW_PER_PAGE && (
                      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                        <span className="text-xs text-slate-400">
                          {previewPage * PREVIEW_PER_PAGE + 1}-{Math.min((previewPage + 1) * PREVIEW_PER_PAGE, parsedRows.length)} / {parsedRows.length}권
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setPreviewPage((p) => Math.max(0, p - 1))}
                            disabled={previewPage === 0}
                            className="px-3 py-1 text-xs font-medium rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            이전
                          </button>
                          <button
                            onClick={() => setPreviewPage((p) => Math.min(Math.ceil(parsedRows.length / PREVIEW_PER_PAGE) - 1, p + 1))}
                            disabled={previewPage >= Math.ceil(parsedRows.length / PREVIEW_PER_PAGE) - 1}
                            className="px-3 py-1 text-xs font-medium rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            다음
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {parsedRows.length > 0 && !processing && results.length === 0 && (
              <button
                onClick={startVerification}
                disabled={!hasSchoolColumn && !globalSchoolName}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2"
              >
                <span className="material-icons-outlined text-sm">play_circle</span>
                검증 시작
              </button>
            )}

            {(processing || isCompleted) && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <span className={`w-1 h-5 rounded-full ${isCompleted ? "bg-green-500" : "bg-blue-500"}`}></span>
                    작업 상태
                  </h3>
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    isCompleted ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                  }`}>
                    {isCompleted ? "완료" : "진행 중"}
                  </span>
                </div>

                <p className="text-slate-600 text-sm mb-4">{message}</p>

                {totalItems > 0 && (
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-slate-500 mb-2">
                      <span className="font-bold uppercase tracking-wider">진행률</span>
                      <span className="font-medium">
                        {progress} / {totalItems} (
                        {Math.round((progress / totalItems) * 100)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(progress / totalItems) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {isCompleted && (
                  <>
                    <button
                      onClick={downloadResult}
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2"
                    >
                      <span className="material-icons-outlined text-sm">download</span>
                      결과 다운로드
                    </button>
                    <button
                      onClick={resetFileMode}
                      className="w-full mt-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-3 px-6 rounded-xl transition-colors"
                    >
                      새 작업 시작
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* ========== 수동 입력 모드 ========== */}
        {mode === "manual" && (
          <>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="w-1 h-5 bg-indigo-500 rounded-full"></span>
                도서 정보 입력
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">
                    학교명 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newBook.school}
                    onChange={(e) => setNewBook({ ...newBook, school: e.target.value })}
                    placeholder="예: 금남초등학교"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2.5 font-medium"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">
                    도서명 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newBook.title}
                    onChange={(e) => setNewBook({ ...newBook, title: e.target.value })}
                    placeholder="예: 해리포터와 마법사의 돌"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2.5 font-medium"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">
                    저자
                  </label>
                  <input
                    type="text"
                    value={newBook.author}
                    onChange={(e) => setNewBook({ ...newBook, author: e.target.value })}
                    placeholder="예: J.K. 롤링"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2.5 font-medium"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">
                    출판사
                  </label>
                  <input
                    type="text"
                    value={newBook.publisher}
                    onChange={(e) => setNewBook({ ...newBook, publisher: e.target.value })}
                    placeholder="예: 문학수첩"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2.5 font-medium"
                  />
                </div>
              </div>
              <button
                onClick={addManualBook}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-xl transition-colors shadow-sm hover:shadow-md flex items-center gap-2"
              >
                <span className="material-icons-outlined text-sm">add</span>
                도서 추가
              </button>
            </div>

            {manualBooks.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded font-bold">
                      {manualBooks.length}권
                    </span>
                    검색 목록
                  </h3>
                  <button
                    onClick={() => setManualBooks([])}
                    className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1"
                  >
                    <span className="material-icons-outlined text-sm">delete_outline</span>
                    전체 삭제
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-4 py-3 font-bold">학교명</th>
                        <th className="px-4 py-3 font-bold">도서명</th>
                        <th className="px-4 py-3 font-bold">저자</th>
                        <th className="px-4 py-3 font-bold">ISBN</th>
                        <th className="px-4 py-3 font-bold">상태</th>
                        <th className="px-4 py-3 font-bold">결과</th>
                        <th className="px-4 py-3 text-center font-bold">삭제</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {manualBooks.map((book) => (
                        <tr key={book.id} className="bg-white hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-700">{book.school}</td>
                          <td className="px-4 py-3 text-slate-600">{book.title}</td>
                          <td className="px-4 py-3 text-slate-500">{book.author || "-"}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-400">{book.isbn || "-"}</td>
                          <td className="px-4 py-3">{getBookStatusBadge(book.status)}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{book.result || "-"}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => removeManualBook(book.id)}
                              className="text-slate-300 hover:text-red-500 transition-colors"
                              disabled={isSearching}
                            >
                              <span className="material-icons-outlined text-sm">close</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 border-t border-slate-100">
                  <button
                    onClick={searchManualBooks}
                    disabled={isSearching}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold py-3 px-6 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    {isSearching ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        검색 중...
                      </>
                    ) : (
                      <>
                        <span className="material-icons-outlined text-sm">search</span>
                        전체 검색 시작
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {manualBooks.length === 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
                <span className="material-icons-outlined text-6xl text-slate-200 mb-4 block">menu_book</span>
                <p className="text-slate-400 font-medium">
                  검색할 도서를 추가해주세요
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
