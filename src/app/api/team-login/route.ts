import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * メンバーがチームID＋パスワードでログインする。
 * 1) admin(サービスロール)で team_credentials を login_code 照合 → bcrypt でパスワード照合
 * 2) 呼び出し元セッションが未ログインなら匿名サインイン（Cookieにセッションを張る）
 * 3) team_members に (team_id, uid) を登録
 * 4) { teamId } を返す（クライアントは /teams/[teamId] へ）
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { loginCode?: string; password?: string }
    const loginCode = (body.loginCode ?? '').trim().toUpperCase()
    const password = body.password ?? ''
    if (!loginCode || !password) {
      return NextResponse.json({ error: 'チームIDとパスワードを入力してください' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: cred } = await admin
      .from('team_credentials')
      .select('team_id, password_hash')
      .eq('login_code', loginCode)
      .maybeSingle()

    // not-found と不一致は同じ文言（存在推測を防ぐ）
    const invalid = () =>
      NextResponse.json({ error: 'チームIDまたはパスワードが違います' }, { status: 401 })

    if (!cred) return invalid()
    const ok = await bcrypt.compare(password, cred.password_hash)
    if (!ok) return invalid()

    // セッション（未ログインなら匿名サインイン）
    const supabase = await createClient()
    let { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      const { data: anon, error: anonErr } = await supabase.auth.signInAnonymously()
      if (anonErr || !anon.user) {
        console.error('signInAnonymously error:', anonErr?.message)
        return NextResponse.json(
          { error: 'ゲストログインに失敗しました。しばらくして再度お試しください' },
          { status: 500 }
        )
      }
      user = anon.user
    }

    // メンバー登録（既にあれば無視）
    const { error: memErr } = await admin
      .from('team_members')
      .upsert({ team_id: cred.team_id, user_id: user.id }, { onConflict: 'team_id,user_id' })
    if (memErr) {
      console.error('team_members upsert error:', memErr.message)
      return NextResponse.json({ error: '参加に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, teamId: cred.team_id })
  } catch (err) {
    console.error('team-login error:', err)
    return NextResponse.json({ error: 'ログインに失敗しました' }, { status: 500 })
  }
}
