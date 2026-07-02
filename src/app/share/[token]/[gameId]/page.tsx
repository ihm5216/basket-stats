import { createClient as createServiceClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { Game, Player, PlayerStat } from '@/types'
import GameShareView from './GameShareView'
import AutoRefresh from '../../AutoRefresh'

// 進行中試合のライブ閲覧に対応するため常に最新データを取得する
export const dynamic = 'force-dynamic'

// 共有リンク（チームのshare_token）経由で1試合のスコアシートを公開表示する
export default async function SharedGamePage({ params }: { params: Promise<{ token: string; gameId: string }> }) {
  const { token, gameId } = await params
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: team } = await supabase
    .from('teams')
    .select('*')
    .eq('share_token', token)
    .single()
  if (!team) notFound()

  // トークンのチームに属する試合のみ公開（他チームの試合IDを直接指定されても404）
  const { data: game } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .eq('team_id', team.id)
    .single()
  if (!game) notFound()

  const { data: teamPlayers } = await supabase
    .from('players')
    .select('*')
    .eq('team_id', team.id)

  const { data: stats } = await supabase
    .from('player_stats')
    .select('*')
    .eq('game_id', gameId)

  // この試合のメンバーに絞り込み（home_player_ids が保存されていれば優先）
  const homeIds = (game.home_player_ids as string[] | null) ?? null
  const allPlayers = (teamPlayers ?? []) as Player[]
  const players = homeIds && homeIds.length > 0
    ? homeIds.map(id => allPlayers.find(p => p.id === id)).filter((p): p is Player => !!p)
    : allPlayers

  return (
    <>
      {!game.is_finished && <AutoRefresh />}
      <GameShareView
        token={token}
        teamName={team.name as string}
        game={game as Game}
        players={players}
        stats={(stats ?? []) as PlayerStat[]}
      />
    </>
  )
}
