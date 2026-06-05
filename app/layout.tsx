import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LearnAI — AI Learning Agent",
  description:
    "Transform any PDF into an interactive adaptive learning experience powered by Groq + Mastra.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0a0a0f] text-white antialiased">{children}</body>
    </html>
  );
}
