import type { ReactNode } from "react";
import { Sora } from "next/font/google";

const sora = Sora({
  variable: "--font-kiosk",
  subsets: ["latin"],
});

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className={`${sora.variable} font-[var(--font-kiosk)]`}>{children}</div>;
}
