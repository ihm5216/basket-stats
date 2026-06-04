import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const redirectTo = `${origin}/auth/callback`

  const oauthUrl = `${supabaseUrl}/auth/v1/authorize?provider=apple&redirect_to=${encodeURIComponent(redirectTo)}`

  return NextResponse.redirect(oauthUrl)
}
