import { createClient } from '@/lib/supabase/server'
import { hasFreeAccess, FREE_GAMES_LIMIT } from '@/lib/freeAccess'

export { FREE_GAMES_LIMIT }

export type TrialStatus = {
  finishedGames: number       // 終了済み試合数
  remaining: number           // 残り無料試合数
  isTrialActive: boolean      // 無料期間中
  hasSubscription: boolean    // 有料プラン加入済み
  canPlayGame: boolean        // ゲームを続けられるか
  subscriptionStatus: string  // 'active' | 'canceled' | 'past_due' | 'trialing' | 'none'
}

/** サーバーサイドで試用状況を確認 */
export async function getTrialStatus(userId: string): Promise<TrialStatus> {
  const supabase = await createClient()

  // ユーザーのチームIDを取得
  const { data: teams } = await supabase
    .from('teams')
    .select('id')
    .eq('user_id', userId)

  const teamIds = teams?.map(t => t.id) ?? []

  // 終了済み試合数をカウント
  let finishedGames = 0
  if (teamIds.length > 0) {
    const { count } = await supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .in('team_id', teamIds)
      .eq('is_finished', true)
    finishedGames = count ?? 0
  }

  // サブスクリプション確認
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  // 'trialing' は登録時トリガーが全員に付与する初期値のため有料扱いにしない
  // （無料枠は「3試合」でカウント管理する。有料は Stripe 決済済みの 'active' のみ）
  // 無料ご招待（オーナー・友達）は free_access テーブルで判定し、決済なしでも無制限。
  const freeAccess = await hasFreeAccess(supabase)
  const hasSubscription = sub?.status === 'active' || freeAccess
  const isTrialActive = finishedGames < FREE_GAMES_LIMIT
  const canPlayGame = isTrialActive || hasSubscription

  return {
    finishedGames,
    remaining: Math.max(0, FREE_GAMES_LIMIT - finishedGames),
    isTrialActive,
    hasSubscription,
    canPlayGame,
    subscriptionStatus: sub?.status ?? 'none',
  }
}
