import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Seera Sales & Distribution OS",
  description: "Independent sales and distribution operating system for Seera Detergent.",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#b91c1c" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f7f7f3", color: "#172019", fontFamily: "Arial, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
