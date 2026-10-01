import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roche FOC Calculator",
  description: "Reagent & free-of-charge shipment calculator for cobas x800 systems",
};

// Applies a saved dark choice before first paint; anything else stays light.
const THEME_SCRIPT = `(function(){try{if(localStorage.getItem("theme")==="dark")document.documentElement.setAttribute("data-theme","dark")}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
