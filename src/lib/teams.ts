import type { SupabaseClient } from '@supabase/supabase-js'
import type { Team } from '@/types'

/**
 * ログイン中ユーザーが「使える」チーム一覧を返す。
 *  - 自分がオーナーのチーム（teams.user_id = userId）
 *  - チーム共有ログインで参加したチーム（team_members に自分がいる）
 *
 * オーナー判定は呼び出し側で `team.user_id === userId` を見れば分かる
 * （メンバー参加チームはオーナーのuser_idが入るため一致しない）。
 * 重複は id で除去し、作成日の新しい順に並べる。
 */
export async function getAccessibleTeams(
  supabase: SupabaseClient,
  userId: string
): Promise<Team[]> {
  const [{ data: owned }, { data: memberships }] = await Promise.all([
    supabase.from('teams').select('*').eq('user_id', userId),
    supabase.from('team_members').select('team_id').eq('user_id', userId),
  ])

  const memberTeamIds = (memberships ?? [])
    .map((m: { team_id: string }) => m.team_id)
    .filter((id: string) => !(owned ?? []).some((t: Team) => t.id === id))

  let memberTeams: Team[] = []
  if (memberTeamIds.length > 0) {
    const { data } = await supabase.from('teams').select('*').in('id', memberTeamIds)
    memberTeams = data ?? []
  }

  return [...(owned ?? []), ...memberTeams].sort((a, b) =>
    (b.created_at ?? '').localeCompare(a.created_at ?? '')
  )
}
