"use client";

import { useState } from "react";
import * as XLSX from "xlsx";

interface BookRow {
  학교명: string;
  도서명: string;
  저자: string;
  출판사: string;
}

interface ResultRow {
  학교명: string;
  도서명: string;
  저자: string;
  출판사: string;
  ISBN13: string;
  검색학교: string;
  존재여부: string;
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

export default function Home() {
  const [mode, setMode] = useState<Mode>("file");

  // 파일 모드 상태
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<BookRow[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<ResultRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);

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
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws);

        if (rows.length === 0) {
          alert("파일에 데이터가 없습니다");
          return;
        }

        const first = rows[0];
        if (!("학교명" in first) || !("도서명" in first)) {
          alert("필수 열이 없습니다: 학교명, 도서명, 저자, 출판사");
          return;
        }

        const parsed: BookRow[] = rows.map((r) => ({
          학교명: r["학교명"] || "",
          도서명: r["도서명"] || "",
          저자: r["저자"] || "",
          출판사: r["출판사"] || "",
        }));

        setFile(selectedFile);
        setParsedRows(parsed);
        setResults([]);
        setProgress(0);
        setMessage("");
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

    const newResults: ResultRow[] = [];

    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      setProgress(i);
      setMessage(`처리 중: ${i + 1}/${parsedRows.length} - ${row.도서명.slice(0, 20)}...`);

      let isbn = "";
      let candidateCount = 0;
      let reason = "";
      let existsMark = "❌";
      let matchedSchool = "";

      // 1. 알라딘 API로 ISBN 검색
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

      // 2. Read365 검색
      if (isbn) {
        try {
          const res = await fetch("/api/search/book", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isbn, school: row.학교명 }),
          });
          if (res.ok) {
            const data = await res.json();
            const schools: string[] = data.matched_schools || [];
            existsMark = data.exists ? "✅" : "❌";
            matchedSchool = data.matched_school || row.학교명;

            if (data.exists && schools.length > 1) {
              reason = `동명 학교 ${schools.length}개 매칭: ${schools.join(", ")}`;
            } else if (!data.exists) {
              if (data.total_count === 0) {
                reason = "주요 지역에 등록된 도서 없음";
              } else {
                reason = `${row.학교명}에 없음 (타 학교 ${data.total_count}권 보유)`;
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

      newResults.push({
        학교명: row.학교명,
        도서명: row.도서명,
        저자: row.저자,
        출판사: row.출판사,
        ISBN13: isbn,
        검색학교: matchedSchool || row.학교명,
        존재여부: existsMark,
        사유: reason,
      });

      setResults([...newResults]);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    setProgress(parsedRows.length);
    setMessage(`완료! ${parsedRows.length}권 처리됨`);
    setProcessing(false);
  };

  // 결과 엑셀 다운로드
  const downloadResult = () => {
    if (results.length === 0) return;

    const ws = XLSX.utils.json_to_sheet(results, {
      header: ["학교명", "도서명", "저자", "출판사", "ISBN13", "검색학교", "존재여부", "사유"],
    });
    ws["!cols"] = [
      { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 15 },
      { wch: 16 }, { wch: 15 }, { wch: 10 }, { wch: 40 },
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
    setMessage("");
  };

  // 수동 입력: 도서 추가
  const addManualBook = () => {
    if (!newBook.school || !newBook.title) {
      alert("학교명과 도서명은 필수입니다");
      return;
    }

    const book: ManualBook = {
      id: Date.now().toString(),
      school: newBook.school,
      title: newBook.title,
      author: newBook.author,
      publisher: newBook.publisher,
      status: "pending",
    };

    setManualBooks((prev) => [...prev, book]);
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
                  <div className="flex items-center gap-2 mb-3">
                    <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded font-bold">
                      {parsedRows.length}권
                    </span>
                    <span className="text-slate-600 text-sm font-medium">의 도서가 포함되어 있습니다</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                        <tr>
                          <th className="px-4 py-3 font-bold">학교명</th>
                          <th className="px-4 py-3 font-bold">도서명</th>
                          <th className="px-4 py-3 font-bold">저자</th>
                          <th className="px-4 py-3 font-bold">출판사</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedRows.slice(0, 5).map((row, i) => (
                          <tr key={i} className="bg-white hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-700">{row.학교명}</td>
                            <td className="px-4 py-3 text-slate-600">{row.도서명}</td>
                            <td className="px-4 py-3 text-slate-500">{row.저자}</td>
                            <td className="px-4 py-3 text-slate-500">{row.출판사}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsedRows.length > 5 && (
                      <p className="text-slate-400 text-xs mt-2 px-4">
                        ... 외 {parsedRows.length - 5}권
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {parsedRows.length > 0 && !processing && results.length === 0 && (
              <button
                onClick={startVerification}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2"
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

                {parsedRows.length > 0 && (
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-slate-500 mb-2">
                      <span className="font-bold uppercase tracking-wider">진행률</span>
                      <span className="font-medium">
                        {progress} / {parsedRows.length} (
                        {Math.round((progress / parsedRows.length) * 100)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(progress / parsedRows.length) * 100}%` }}
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
