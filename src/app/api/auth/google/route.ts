import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const redirectTo = `${origin}/auth/callback`

  // SupabaseのOAuth URLを直接構築（最もシンプルで確実な方法）
  const oauthUrl = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`

  return NextResponse.redirect(oauthUrl)
}
