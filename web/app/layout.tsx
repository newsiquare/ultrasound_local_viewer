import type { ReactNode } from "react";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body style={{ fontFamily: "ui-sans-serif, system-ui" }}>{children}</body>
    </html>
  );
}
