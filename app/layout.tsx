import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast";

export const metadata: Metadata = {
  title: "SocialHub Pro — AI-powered social media operating system",
  description:
    "Plan, create, schedule, publish, collaborate and analyse social media for Instagram and Facebook from one workspace.",
  robots: { index: false, follow: false },
};

const themeScript = `
(function(){
  try {
    var stored = localStorage.getItem('shp_theme');
    if (stored === 'light') document.documentElement.classList.add('light');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="app-bg">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
