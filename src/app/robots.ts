import type { MetadataRoute } from 'next'

const BASE_URL = 'https://basket-stats-three.vercel.app'

// クローラー向けの巡回ルール。公開LPと法的ページは許可し、
// ログイン後の画面・API・トークン付き共有URLは検索結果に出さない
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/dashboard', '/games', '/teams', '/stats', '/share/', '/upgrade', '/auth/'],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
