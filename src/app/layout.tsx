import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BasketStats - バスケスタッツ管理",
  description: "試合中にタップするだけでJBA公式スコアシートを自動生成。LINEで即共有。月500円でチーム全員が使い放題。",
  openGraph: {
    title: "BasketStats - バスケのスタッツをもっと簡単に",
    description: "試合中にタップするだけでJBA公式スコアシートを自動生成。LINEで即共有。月500円。",
    type: "website",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BasketStats",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",  // iPhoneノッチ・ホームバー対応
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
