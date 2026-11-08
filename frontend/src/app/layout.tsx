import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "looma.",
  description: "your calm after the storm. prove what you lost, get money now, know what's next.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
