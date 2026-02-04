import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "독서로 ISBN 검증 시스템",
  description: "학교 도서관 구매 도서의 Read365 존재 여부를 자동으로 검증합니다",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Icons+Outlined"
          rel="stylesheet"
        />
        <link
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
