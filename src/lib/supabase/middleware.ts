import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

  // 環境変数未設定時はそのまま通す（開発初期セットアップ前）
  if (!supabaseUrl.startsWith('http')) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const publicPaths = ['/', '/login', '/signup', '/share', '/terms', '/privacy', '/tokushoho', '/manifest.webmanifest', '/robots.txt', '/sitemap.xml']
  const isPublicPath = publicPaths.some(p => pathname === p || pathname.startsWith('/share/'))
    || pathname.startsWith('/api/auth/')
    || pathname.startsWith('/auth/')
    // チームID＋パスワードでのメンバーログイン（未ログイン訪問者が叩く）。
    // setup 側は内部で getUser を検証するためここで通しても安全。
    || pathname.startsWith('/api/team-login')
    // Stripe Webhookは認証Cookieを持たない外部からのPOST。署名検証(STRIPE_WEBHOOK_SECRET)で保護される
    || pathname === '/api/stripe/webhook'
    // Vercel Cronからの死活監視。認証Cookieを持たないためここで通す（CRON_SECRETで保護）
    || pathname === '/api/keepalive'

  if (!user && !isPublicPath) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}
