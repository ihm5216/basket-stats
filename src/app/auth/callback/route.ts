import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const token_hash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type') as 'email' | 'recovery' | 'signup' | 'magiclink' | null
  const next = requestUrl.searchParams.get('next') ?? '/dashboard'

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  // OAuth（Google/Apple）のコード交換
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin))
    }
    console.error('exchangeCodeForSession error:', error.message)
  }

  // メール認証・マジックリンクのトークン検証（signup/email/magiclink対応）
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin))
    }
    console.error('verifyOtp error:', error.message, 'type:', type)
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, requestUrl.origin))
  }

  // パラメータなし or 全て失敗
  const params = requestUrl.searchParams.toString()
  console.error('auth callback failed, params:', params)
  return NextResponse.redirect(new URL(`/login?error=auth_failed&detail=${encodeURIComponent(params)}`, requestUrl.origin))
}
