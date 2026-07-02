'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// 進行中の試合があるときにサーバーコンポーネントを定期再取得してスコアを自動更新する。
// LINE内ブラウザ等で画面を開き直したときも最新化する（visibilitychange）。
export default function AutoRefresh({ intervalMs = 20000 }: { intervalMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, intervalMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [router, intervalMs])

  return null
}
