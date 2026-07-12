import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// login_code に使う文字（紛らわしい 0/O/1/I/L を除外）
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function makeCode(): string {
  const pick = () =>
    Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('')
  return `${pick()}-${pick()}`
}

/**
 * オーナーがチームの共有ログインを設定・変更・無効化する。
 * - action 'set'（既定）: password を設定/変更。未発行なら login_code を採番。=> { loginCode }
 * - action 'disable'    : 資格情報を削除し、既存メンバーも全解除（＝完全なキルスイッチ）。
 * オーナー本人（teams.user_id === auth.uid()）のみ許可。
 */
export async function POST(req: Request) {
  try {
    const { teamId, password, action } = (await req.json()) as {
      teamId?: string
      password?: string
      action?: 'set' | 'disable'
    }
    if (!teamId) {
      return NextResponse.json({ error: 'チームが指定されていません' }, { status: 400 })
    }

    // 呼び出し元がそのチームのオーナーか確認（Cookieセッション）
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '未ログイン' }, { status: 401 })

    const { data: team } = await supabase
      .from('teams')
      .select('id, user_id')
      .eq('id', teamId)
      .maybeSingle()
    if (!team || team.user_id !== user.id) {
      return NextResponse.json({ error: 'このチームの権限がありません' }, { status: 403 })
    }

    const admin = createAdminClient()

    // 無効化: 資格情報＋メンバーを削除
    if (action === 'disable') {
      await admin.from('team_credentials').delete().eq('team_id', teamId)
      await admin.from('team_members').delete().eq('team_id', teamId)
      return NextResponse.json({ ok: true, disabled: true })
    }

    // 設定/変更（共有パスワードはどの端末でも打てる半角英数字に統一）
    if (!password || !/^[A-Za-z0-9]{4,}$/.test(password)) {
      return NextResponse.json({ error: 'パスワードは半角の英数字4文字以上で設定してください' }, { status: 400 })
    }
    const password_hash = await bcrypt.hash(password, 10)

    // 既存の login_code を維持（あれば）。無ければ衝突しないコードを採番。
    const { data: existing } = await admin
      .from('team_credentials')
      .select('login_code')
      .eq('team_id', teamId)
      .maybeSingle()

    let login_code = existing?.login_code
    if (!login_code) {
      for (let i = 0; i < 8; i++) {
        const candidate = makeCode()
        const { data: clash } = await admin
          .from('team_credentials')
          .select('team_id')
          .eq('login_code', candidate)
          .maybeSingle()
        if (!clash) {
          login_code = candidate
          break
        }
      }
      if (!login_code) {
        return NextResponse.json({ error: 'チームIDの発行に失敗しました。もう一度お試しください' }, { status: 500 })
      }
    }

    const { error } = await admin
      .from('team_credentials')
      // password_plain はオーナーのみ読めるRLSで保護（共有前提の合言葉のため保存を許容）
      .upsert({ team_id: teamId, login_code, password_hash, password_plain: password, updated_at: new Date().toISOString() })
    if (error) {
      console.error('team_credentials upsert error:', error.message)
      return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, loginCode: login_code })
  } catch (err) {
    console.error('team-login/setup error:', err)
    return NextResponse.json({ error: '設定に失敗しました' }, { status: 500 })
  }
}
