import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * オーナー / 友達向けの「無料ご招待」判定。
 *
 * Supabase の free_access テーブル（email 列）にログイン中ユーザーのメールが
 * 登録されていれば、Stripe 決済なしでも無制限に使える。
 *
 * - RLS により、各ユーザーは「自分のメールが登録されているか」だけを確認できる
 *   （他人のメール一覧は取得できない）。大文字小文字は無視される。
 * - friends を増やすときは Supabase 管理画面で free_access に1行追加するだけ。
 * - テーブル未作成やエラー時は false を返し、通常（5試合無料）の挙動にフォールバックする。
 */
export async function hasFreeAccess(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('free_access')
      .select('email')
      .maybeSingle()
    if (error) return false
    return !!data
  } catch {
    return false
  }
}
