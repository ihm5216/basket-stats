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
  verification: {
    google: "Gqjhdec3jlkT9wqU0S9EFlH5KqQ1-vJey4c6Uv-XpvM", // Google Search Console 所有権確認
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",  // iPhoneノッチ・ホームバー対応
  themeColor: "#091929", // Androidのブラウザ/ステータスバーをアプリ背景色に
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
