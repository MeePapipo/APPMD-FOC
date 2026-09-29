import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roche FOC Calculator",
  description: "Reagent & free-of-charge shipment calculator for cobas x800 systems",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
