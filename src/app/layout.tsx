import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const jua = localFont({ src: "../../public/fonts/Jua-Regular.ttf", variable: "--font-jua", weight: "400", display: "swap" });

export const metadata: Metadata = {
  title: "공찾 — 나다운 시작을 찾다",
  description: "이력서와 포트폴리오 속 당신의 가능성을 발견하고, 나에게 맞는 채용 공고를 한곳에서 찾아보세요.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko" className={jua.variable}><body>{children}</body></html>;
}
