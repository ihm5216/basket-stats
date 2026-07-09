import type { MetadataRoute } from 'next'

const BASE_URL = 'https://basket-stats-three.vercel.app'

// 検索エンジンに公開ページの一覧を伝えるサイトマップ。
// ログイン後のページ（/dashboard等）やトークン付き共有ページは載せない
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE_URL}/signup`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/login`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/tokushoho`, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
