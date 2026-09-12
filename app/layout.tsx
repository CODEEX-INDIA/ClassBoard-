import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MAPLES ACADEMY SMARTBOARD TOOL",
  description: "Teach, present, annotate, and share from any device.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
