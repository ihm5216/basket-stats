import type { MetadataRoute } from 'next'

// PWAマニフェスト: 「ホーム画面に追加」でネイティブアプリのように
// 全画面（standalone）起動できるようにする
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BasketStats - バスケスタッツ管理',
    short_name: 'BasketStats',
    description: '試合中にタップするだけでJBA公式スコアシートを自動生成。LINEで即共有。',
    start_url: '/dashboard',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#091929',
    theme_color: '#091929',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
