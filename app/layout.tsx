import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "旅迹 · AI 旅行规划工作台", description: "把想去的地方，变成真正可走的旅程。" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }
