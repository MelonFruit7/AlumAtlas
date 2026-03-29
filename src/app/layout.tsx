import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WGEU · Where The Group Ended Up",
  description:
    "Create share links and visualize where your group members ended up across the world.",
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
