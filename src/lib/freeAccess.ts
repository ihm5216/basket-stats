import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 無料で遊べる試合数（これを終えると課金が必要）。
 * 数字を変えたいときはここ1か所だけ変更すれば全画面に反映される。
 */
export const FREE_GAMES_LIMIT = 3

/**
 * オーナー / 友達向けの「無料ご招待」判定。
 *
 * Supabase の free_access テーブル（email 列）にログイン中ユーザーのメールが
 * 登録されていれば、Stripe 決済なしでも無制限に使える。
 *
 * - RLS により、各ユーザーは「自分のメールが登録されているか」だけを確認できる
 *   （他人のメール一覧は取得できない）。大文字小文字は無視される。
 * - friends を増やすときは Supabase 管理画面で free_access に1行追加するだけ。
 * - テーブル未作成やエラー時は false を返し、通常（3試合無料）の挙動にフォールバックする。
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

/**
 * 無料枠の判定に使う「試合終了の累計回数」を返す。
 *
 * game_finish_counters テーブル（DBトリガーが試合終了ごとに +1／削除では減らない）を読む。
 * これにより「終了済み試合を消して無料枠をリセットする」抜け道を塞ぐ。
 * カウンターが未作成（マイグレーション前）やエラー時は、従来どおり
 * 現在の終了済み試合数を数えてフォールバックする。
 */
export async function getFinishedGamesCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('game_finish_counters')
      .select('finished_total')
      .eq('user_id', userId)
      .maybeSingle()
    // テーブルが存在する場合：行があればその累計、無ければ 0
    if (!error) return data?.finished_total ?? 0
  } catch {
    /* フォールバックへ */
  }
  // フォールバック：現在の終了済み試合数（旧挙動）
  try {
    const { data: teams } = await supabase.from('teams').select('id').eq('user_id', userId)
    const teamIds = (teams ?? []).map((t: { id: string }) => t.id)
    if (teamIds.length === 0) return 0
    const { count } = await supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .in('team_id', teamIds)
      .eq('is_finished', true)
    return count ?? 0
  } catch {
    return 0
  }
}
