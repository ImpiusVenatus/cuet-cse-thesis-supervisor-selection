import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/providers";
import { AppNav } from "@/components/AppNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CUET CSE Thesis Supervisor Selection",
  description: "Thesis Supervisor Selection System for CUET CSE Department",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/* Extensions often inject attributes on <body> before hydrate; suppress avoids false-positive warnings */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <QueryProvider>
          <header className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="max-w-7xl mx-auto">
              <h1 className="text-xl font-bold text-gray-900">
                CUET CSE Thesis Supervisor Selection
              </h1>
            </div>
          </header>
          <AppNav />
          <main className="flex-1">{children}</main>
        </QueryProvider>
      </body>
    </html>
  );
}
