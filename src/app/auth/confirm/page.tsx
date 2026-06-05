'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthConfirmPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/dashboard'

    if (!code) {
      router.replace('/login?error=no_code')
      return
    }

    // クライアントサイドでPKCEコード交換（ブラウザのcookieを使用）
    const supabase = createClient()
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        console.error('exchangeCodeForSession error:', error.message)
        router.replace(`/login?error=${encodeURIComponent(error.message)}`)
      } else {
        router.replace(next)
      }
    })
  }, [router, searchParams])

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4">⏳</div>
        <p className="text-white">ログイン処理中...</p>
      </div>
    </main>
  )
}
