import type { Metadata } from "next";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { FlashToast } from "@/components/FlashToast";
import { MotionProvider } from "@/components/motion";
import { THEME_SCRIPT, ThemeProvider } from "@/components/theme";

export const metadata: Metadata = {
  title: "Realframe",
  description: "Prompt real, coded prototypes and share them for review.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <meta
          name="theme-color"
          media="(prefers-color-scheme: light)"
          content="#fffbf7"
        />
        <meta
          name="theme-color"
          media="(prefers-color-scheme: dark)"
          content="#0f0e0d"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <ThemeProvider>
          <MotionProvider>
            <TooltipProvider>
              {children}
              <Toaster />
              <FlashToast />
            </TooltipProvider>
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
