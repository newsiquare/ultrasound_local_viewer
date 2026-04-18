import type { ReactNode } from "react";
import { Toaster } from "sonner";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant" style={{ height: "100%" }}>
      <body style={{ height: "100%", overflow: "hidden" }}>
        {children}
        <Toaster position="bottom-right" theme="dark" richColors />
      </body>
    </html>
  );
}
