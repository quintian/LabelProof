import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "LabelProof | Alcohol Label Review",
  description:
    "Human-guided, AI-assisted alcohol beverage label verification.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
