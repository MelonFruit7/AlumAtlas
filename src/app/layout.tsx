import type { Metadata } from "next";
import "./globals.css";
import { Geist, Sora } from "next/font/google";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { cookies } from "next/headers";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const sora = Sora({ subsets: ["latin"], variable: "--font-workspace" });
const THEME_COOKIE_KEY = "alum-atlas-theme";

export const metadata: Metadata = {
  title: "Alum Atlas",
  description:
    "Map where student organization members and alumni across the U.S. ended up after college.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const cookieTheme = cookieStore.get(THEME_COOKIE_KEY)?.value;
  const initialTheme = cookieTheme === "dark" ? "dark" : "light";

  return (
    <html
      lang="en"
      className={cn(
        "font-sans",
        geist.variable,
        sora.variable,
        initialTheme === "dark" && "dark",
      )}
      data-theme={initialTheme}
      suppressHydrationWarning
    >
      <body>
        <div className="wgeu-theme-toggle-wrap">
          <ThemeToggle initialTheme={initialTheme} />
        </div>
        {children}
      </body>
    </html>
  );
}
