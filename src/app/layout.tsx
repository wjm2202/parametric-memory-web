import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Parametric Memory — Persistent, Verifiable Memory for AI",
    template: "%s | Parametric Memory",
  },
  description:
    "Enterprise-grade persistent memory for AI systems. Cryptographically verified, Markov-predicted, sub-millisecond recall. Built for teams who need AI that remembers.",
  metadataBase: new URL("https://parametric-memory.dev"),
  openGraph: {
    title: "Parametric Memory",
    description: "Persistent, verifiable memory for AI systems.",
    url: "https://parametric-memory.dev",
    siteName: "Parametric Memory",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Parametric Memory",
    description: "Persistent, verifiable memory for AI systems.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen font-body">
        <div className="relative flex min-h-screen flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
