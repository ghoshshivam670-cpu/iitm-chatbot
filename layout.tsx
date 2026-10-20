import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IIT Madras BS Student Assistant",
  description: "AI-powered student advisor for IITM BS Degree Programme",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
