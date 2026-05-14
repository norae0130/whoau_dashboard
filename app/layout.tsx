import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Who.A.U MD Dashboard",
  description: "리오더 의사결정 시스템 — 날씨 × 정판율 × AI 예측",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}