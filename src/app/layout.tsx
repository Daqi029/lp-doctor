import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Landingpage增长诊断",
  description: "30秒找到你落地页最影响转化的3个问题",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
