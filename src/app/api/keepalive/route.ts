import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Supabase の自動一時停止を防ぐための死活監視。
 *
 * 無料プランのプロジェクトは約1週間アクセスが無いと自動で一時停止され、
 * 停止中は DNS ごと引けなくなるためサイト全体が 504 になる。
 * Vercel Cron から1日1回呼び出し、teams の件数だけを数えて
 * DB へのアクセス実績を残す。
 *
 * 読み取り専用で行データは返さないため、万一外部から叩かれても実害はない。
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // CRON_SECRET を設定すると Vercel Cron が Authorization ヘッダを付けて呼ぶ。
  // 未設定でも動くが、設定しておくと外部からの呼び出しを弾ける。
  const secret = process.env.CRON_SECRET
  if (secret) {
    if (req.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }
  }

  try {
    const admin = createAdminClient()
    const { count, error } = await admin
      .from('teams')
      .select('id', { count: 'exact', head: true })

    if (error) {
      console.error('keepalive error:', error.message)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, teams: count ?? 0, at: new Date().toISOString() })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('keepalive error:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
