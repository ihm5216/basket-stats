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

  // OAuth（Google/Apple）: PKCEはクライアントサイドで処理するためcodeをそのまま渡す
  if (code) {
    // PKCEのコード検証器はブラウザのcookieにある→クライアントページで処理
    return NextResponse.redirect(new URL(`/auth/confirm?code=${code}&next=${encodeURIComponent(next)}`, requestUrl.origin))
  }

  // メール認証・マジックリンク（token_hash方式）
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin))
    }
    console.error('verifyOtp error:', error.message, 'type:', type)
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, requestUrl.origin))
  }

  const params = requestUrl.searchParams.toString()
  return NextResponse.redirect(new URL(`/login?error=auth_failed&detail=${encodeURIComponent(params)}`, requestUrl.origin))
}
