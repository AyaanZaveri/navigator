import type { Metadata } from "next";
import { Geist_Mono, Poppins, Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { SettingsProvider } from "@/contexts/settings-context";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Navigator",
  description: "A modern streaming client powered by Stremio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const enableVercelTelemetry =
    process.env.ELECTRON !== "true" && process.env.VERCEL === "1";

  const themeInitScript = `
    (() => {
      const storageKey = "theme";
      const darkBg = "oklch(0.145 0 0)";
      const lightBg = "oklch(1 0 0)";
      const root = document.documentElement;

      let storedTheme = "system";
      try {
        storedTheme = localStorage.getItem(storageKey) || "system";
      } catch {}

      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const resolvedTheme =
        storedTheme === "system" ? (prefersDark ? "dark" : "light") : storedTheme;

      root.classList.remove("light", "dark");
      if (resolvedTheme === "dark" || resolvedTheme === "light") {
        root.classList.add(resolvedTheme);
      }

      root.style.backgroundColor = resolvedTheme === "dark" ? darkBg : lightBg;
      root.style.colorScheme = resolvedTheme === "dark" ? "dark" : "light";
    })();
  `;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-title" content="Navigator" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${inter.variable} ${geistMono.variable} ${poppins.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SettingsProvider>{children}</SettingsProvider>
          <Toaster />
        </ThemeProvider>
        {enableVercelTelemetry ? <Analytics /> : null}
        {enableVercelTelemetry ? <SpeedInsights /> : null}
      </body>
    </html>
  );
}
