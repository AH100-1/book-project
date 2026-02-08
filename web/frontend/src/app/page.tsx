"use client";

import { useState, useEffect } from "react";

// Next.js API Routes 사용 (상대 경로)
const API_URL = "";

interface FilePreview {
  file_id: string;
  filename: string;
  total_rows: number;
  preview: Record<string, string>[];
}

interface Job {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  total: number;
  message: string;
  result_file: string | null;
  created_at: string;
  updated_at: string;
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

  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [uploading, setUploading] = useState(false);

  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [polling, setPolling] = useState(false);

  // 수동 입력 모드용 상태
  const [manualBooks, setManualBooks] = useState<ManualBook[]>([]);
  const [newBook, setNewBook] = useState({
    school: "",
    title: "",
    author: "",
    publisher: "",
  });
  const [isSearching, setIsSearching] = useState(false);

  // 작업 상태 폴링
  useEffect(() => {
    if (!currentJob || !polling) return;
    if (currentJob.status === "completed" || currentJob.status === "failed") {
      setPolling(false);
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/jobs/${currentJob.job_id}`);
        const job = await res.json();
        setCurrentJob(job);
        if (job.status === "completed" || job.status === "failed") {
          setPolling(false);
        }
      } catch (e) {
        console.error(e);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentJob, polling]);

  // 파일 업로드
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setUploading(true);
    setFilePreview(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch(`${API_URL}/api/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "업로드 실패");
      }
      const data = await res.json();
      setFilePreview(data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "파일 업로드 실패";
      alert(message);
      setFile(null);
    } finally {
      setUploading(false);
    }
  };

  // 검증 시작 (파일 모드)
  const startVerification = async () => {
    if (!filePreview) return;

    try {
      const res = await fetch(`${API_URL}/api/verify/${filePreview.file_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "시작 실패");
      }
      const data = await res.json();

      const jobRes = await fetch(`${API_URL}/api/jobs/${data.job_id}`);
      const job = await jobRes.json();
      setCurrentJob(job);
      setPolling(true);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "검증 시작 실패";
      alert(message);
    }
  };

  // 결과 다운로드
  const downloadResult = () => {
    if (!currentJob?.result_file) return;
    window.open(`${API_URL}/api/download/${currentJob.result_file}`, "_blank");
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

      // 상태 업데이트: 검색 중
      setManualBooks((prev) =>
        prev.map((b) => (b.id === book.id ? { ...b, status: "searching" } : b))
      );

      try {
        // 1. 알라딘 API로 ISBN 검색
        const isbnRes = await fetch(`${API_URL}/api/search/aladin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: book.title,
            author: book.author,
          }),
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

        // 2. Read365 API로 검색
        const searchRes = await fetch(`${API_URL}/api/search/book`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isbn,
            school: book.school,
          }),
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
      } catch (e) {
        setManualBooks((prev) =>
          prev.map((b) =>
            b.id === book.id
              ? { ...b, status: "error", result: "검색 오류" }
              : b
          )
        );
      }

      // 잠시 대기 (API 부하 방지)
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    setIsSearching(false);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: "bg-green-100 text-green-700",
      failed: "bg-red-100 text-red-700",
      running: "bg-blue-100 text-blue-700",
      pending: "bg-slate-100 text-slate-600",
    };
    const labels: Record<string, string> = {
      completed: "완료",
      failed: "실패",
      running: "진행 중",
      pending: "대기 중",
    };
    return (
      <span className={`px-2 py-1 rounded text-xs font-bold ${styles[status] || styles.pending}`}>
        {labels[status] || status}
      </span>
    );
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
              <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded font-bold">
                API 모드
              </span>
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

              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-slate-50 hover:border-blue-400 transition-all">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  {uploading ? (
                    <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-2" />
                  ) : (
                    <span className="material-icons-outlined text-4xl text-slate-400 mb-2">cloud_upload</span>
                  )}
                  <p className="text-sm text-slate-500 font-medium">
                    {file ? file.name : "도서견적서.xlsx 파일을 선택하세요"}
                  </p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  disabled={uploading}
                />
              </label>

              {filePreview && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded font-bold">
                      {filePreview.total_rows}권
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
                        {filePreview.preview.map((row, i) => (
                          <tr key={i} className="bg-white hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-700">{row["학교명"]}</td>
                            <td className="px-4 py-3 text-slate-600">{row["도서명"]}</td>
                            <td className="px-4 py-3 text-slate-500">{row["저자"]}</td>
                            <td className="px-4 py-3 text-slate-500">{row["출판사"]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filePreview.total_rows > 5 && (
                      <p className="text-slate-400 text-xs mt-2 px-4">
                        ... 외 {filePreview.total_rows - 5}권
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {filePreview && !currentJob && (
              <button
                onClick={startVerification}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2"
              >
                <span className="material-icons-outlined text-sm">play_circle</span>
                검증 시작
              </button>
            )}

            {currentJob && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-1 h-5 bg-green-500 rounded-full"></span>
                    작업 상태
                  </h3>
                  {getStatusBadge(currentJob.status)}
                </div>

                <p className="text-slate-600 text-sm mb-4">{currentJob.message}</p>

                {currentJob.total > 0 && (
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-slate-500 mb-2">
                      <span className="font-bold uppercase tracking-wider">진행률</span>
                      <span className="font-medium">
                        {currentJob.progress} / {currentJob.total} (
                        {Math.round((currentJob.progress / currentJob.total) * 100)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${(currentJob.progress / currentJob.total) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {currentJob.status === "completed" && currentJob.result_file && (
                  <button
                    onClick={downloadResult}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <span className="material-icons-outlined text-sm">download</span>
                    결과 다운로드
                  </button>
                )}

                {(currentJob.status === "completed" || currentJob.status === "failed") && (
                  <button
                    onClick={() => {
                      setCurrentJob(null);
                      setFilePreview(null);
                      setFile(null);
                    }}
                    className="w-full mt-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-3 px-6 rounded-xl transition-colors"
                  >
                    새 작업 시작
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* ========== 수동 입력 모드 ========== */}
        {mode === "manual" && (
          <>
            {/* 입력 폼 */}
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

            {/* 도서 목록 */}
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
