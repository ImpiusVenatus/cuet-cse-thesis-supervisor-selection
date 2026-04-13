import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/providers";

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
    >
      <body className="min-h-full flex flex-col">
        <QueryProvider>
          <header className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="max-w-7xl mx-auto">
              <h1 className="text-xl font-bold text-gray-900">
                CUET CSE Thesis Supervisor Selection
              </h1>
            </div>
          </header>
          <nav className="bg-gray-50 border-b border-gray-200 px-6 py-2">
            <div className="max-w-7xl mx-auto flex gap-4 text-sm">
              <a href="/dashboard" className="text-gray-600 hover:text-gray-900 px-3 py-1 rounded">Dashboard</a>
              <a href="/setup/supervisors" className="text-gray-600 hover:text-gray-900 px-3 py-1 rounded">Supervisors</a>
              <a href="/setup/students" className="text-gray-600 hover:text-gray-900 px-3 py-1 rounded">Students</a>
              <a href="/setup/config" className="text-gray-600 hover:text-gray-900 px-3 py-1 rounded">Config</a>
              <a href="/ceremony/choice" className="text-gray-600 hover:text-gray-900 px-3 py-1 rounded">Choice</a>
              <a href="/ceremony/lottery" className="text-gray-600 hover:text-gray-900 px-3 py-1 rounded">Lottery</a>
              <a href="/ceremony/results" className="text-gray-600 hover:text-gray-900 px-3 py-1 rounded">Results</a>
            </div>
          </nav>
          <main className="flex-1">{children}</main>
        </QueryProvider>
      </body>
    </html>
  );
}
