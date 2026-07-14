'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Team, Player, Game } from '@/types'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { exportToCSV, aggregateSeasonStats } from '@/lib/stats'

function toHankaku(str: string): string {
  return str.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, '')
}

export default function TeamPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [team, setTeam] = useState<Team | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [tab, setTab] = useState<'games' | 'players' | 'stats'>('games')
  const [loading, setLoading] = useState(true)
  const [shareMsg, setShareMsg] = useState('')
  const [newPlayerName, setNewPlayerName] = useState('')
  const [newPlayerNumber, setNewPlayerNumber] = useState('')
  const [numberWarning, setNumberWarning] = useState(false)
  const [addingPlayer, setAddingPlayer] = useState(false)
  const [addError, setAddError] = useState('')
  // 削除確認モーダル（window.confirmはLINE内ブラウザ等で出ないことがあるため自前で表示）
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'player' | 'game'; id: string; label: string } | null>(null)
  // 選手のインライン編集
  const [editingPlayer, setEditingPlayer] = useState<{ id: string; name: string; number: string } | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  // 写真登録
  const [extracting, setExtracting] = useState(false)
  const [extractProgress, setExtractProgress] = useState('')
  const [extractError, setExtractError] = useState('')
  const [extractedTeamName, setExtractedTeamName] = useState('')
  const [extractedPlayers, setExtractedPlayers] = useState<{ number: string; name: string; selected: boolean }[]>([])
  const [savingExtracted, setSavingExtracted] = useState(false)
  // チーム共有ログイン（オーナーのみ）
  const [isOwner, setIsOwner] = useState(false)
  const [loginCode, setLoginCode] = useState<string | null>(null)   // 発行済みチームID（未設定なら null）
  const [savedPassword, setSavedPassword] = useState<string | null>(null) // オーナーのみ閲覧できる共有パスワード
  const [members, setMembers] = useState<{ user_id: string; created_at: string }[]>([])

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const [{ data: teamData }, { data: playersData }, { data: gamesData }] = await Promise.all([
      supabase.from('teams').select('*').eq('id', id).single(),
      supabase.from('players').select('*').eq('team_id', id).order('number'),
      supabase.from('games').select('*').eq('team_id', id).order('game_date', { ascending: false }),
    ])

    if (!teamData) { router.push('/dashboard'); return }
    setTeam(teamData)
    setPlayers(playersData ?? [])
    setGames(gamesData ?? [])

    const owner = !!user && teamData.user_id === user.id
    setIsOwner(owner)
    if (owner) {
      // オーナーだけがチームの資格情報・メンバー一覧を読める（RLS）
      const [{ data: cred }, { data: mem }] = await Promise.all([
        supabase.from('team_credentials').select('login_code, password_plain').eq('team_id', id).maybeSingle(),
        supabase.from('team_members').select('user_id, created_at').eq('team_id', id).order('created_at'),
      ])
      setLoginCode(cred?.login_code ?? null)
      setSavedPassword(cred?.password_plain ?? null)
      setMembers(mem ?? [])
    }
    setLoading(false)
  }

  async function addPlayer(e: React.FormEvent) {
    e.preventDefault()
    const trimmedName = newPlayerName.trim()
    if (!trimmedName) return
    // 同じ名前の選手が既にいる場合はエラー
    if (players.some(p => p.name === trimmedName)) {
      setAddError(`「${trimmedName}」は既に登録されています。同じ名前の選手は登録できません。`)
      return
    }
    setAddError('')
    setAddingPlayer(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('players')
      .insert({ team_id: id, name: trimmedName, number: newPlayerNumber.trim() })
      .select()
      .single()

    if (data) {
      setPlayers(prev => [...prev, data].sort((a, b) => Number(a.number) - Number(b.number)))
      setNewPlayerName('')
      setNewPlayerNumber('')
      setNumberWarning(false)
    }
    setAddingPlayer(false)
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setExtractError('')
    setExtractedPlayers([])
    setExtractedTeamName('')
    setExtracting(true)
    setExtractProgress('AIが読み取り中...')
    try {
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch('/api/extract-players', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setExtractError(data.error ?? '読み取りに失敗しました')
      } else {
        const list = (data.players as { number: string; name: string }[]) ?? []
        setExtractedTeamName(data.team_name ?? '')
        setExtractedPlayers(list.map(p => ({ ...p, selected: true })))
        if (list.length === 0) setExtractError('選手データが見つかりませんでした。手動で入力してください。')
      }
    } catch {
      setExtractError('通信エラーが発生しました')
    }
    setExtractProgress('')
    setExtracting(false)
  }

  async function saveExtractedPlayers() {
    const toAdd = extractedPlayers.filter(p => p.selected && p.name.trim())
    if (toAdd.length === 0) return
    setSavingExtracted(true)
    const supabase = createClient()
    const rows = toAdd.map(p => ({ team_id: id, name: p.name.trim(), number: toHankaku(p.number) }))
    const { data } = await supabase.from('players').insert(rows).select()
    if (data) {
      setPlayers(prev => [...prev, ...data].sort((a, b) => Number(a.number) - Number(b.number)))
    }
    setExtractedPlayers([])
    setSavingExtracted(false)
  }

  async function deletePlayer(playerId: string) {
    const supabase = createClient()
    await supabase.from('players').delete().eq('id', playerId)
    setPlayers(prev => prev.filter(p => p.id !== playerId))
  }

  async function savePlayerEdit() {
    if (!editingPlayer) return
    const trimmedName = editingPlayer.name.trim()
    if (!trimmedName) return
    setSavingEdit(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('players')
      .update({ name: trimmedName, number: toHankaku(editingPlayer.number) || editingPlayer.number.trim() })
      .eq('id', editingPlayer.id)
    if (!error) {
      setPlayers(prev => prev
        .map(p => p.id === editingPlayer.id ? { ...p, name: trimmedName, number: toHankaku(editingPlayer.number) || editingPlayer.number.trim() } : p)
        .sort((a, b) => Number(a.number) - Number(b.number)))
      setEditingPlayer(null)
    }
    setSavingEdit(false)
  }

  async function deleteGame(gameId: string) {
    const supabase = createClient()
    await supabase.from('player_stats').delete().eq('game_id', gameId)
    await supabase.from('games').delete().eq('id', gameId)
    setGames(prev => prev.filter(g => g.id !== gameId))
    // localStorage のキャッシュも削除
    ;['pending', 'score_events', 'court', 'court_opp', 'scoresheet_ov', 'undo_stack', 'foul_events', 'game_clock'].forEach(k => {
      localStorage.removeItem(`${k}_${gameId}`)
    })
    for (let q = 1; q <= 4; q++) {
      localStorage.removeItem(`court_q${q}_${gameId}`)
      localStorage.removeItem(`court_opp_q${q}_${gameId}`)
    }
    localStorage.removeItem(`game_${gameId}_home_players`)
    localStorage.removeItem(`game_${gameId}_opponent_players`)
  }

  function copyShareLink() {
    const url = `${window.location.origin}/share/${team?.share_token}`
    navigator.clipboard.writeText(url)
    setShareMsg('✓ コピーしました！')
    setTimeout(() => setShareMsg(''), 3000)
  }

  async function handleExportCSV() {
    if (!team) return
    const supabase = createClient()
    const { data: statsData } = await supabase
      .from('player_stats')
      .select('*, player:players(*)')
      .in('game_id', games.map(g => g.id))

    if (statsData) {
      const season = aggregateSeasonStats(statsData as Parameters<typeof aggregateSeasonStats>[0])
      exportToCSV(season, team.name)
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-[var(--muted)]">読み込み中...</div>
  if (!team) return null

  return (
    <div className="min-h-screen">
      <nav className="flex items-center gap-2 px-4 py-3 border-b border-[var(--card-border)] sticky top-0 bg-[var(--background)] z-10">
        <Link href="/dashboard" className="flex items-center gap-2 text-white min-w-0 flex-1">
          <span className="flex-shrink-0">←</span>
          <span className="font-bold truncate">🏀 {team.name}</span>
        </Link>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={copyShareLink} className="btn-secondary text-sm py-2 px-3">
            {shareMsg || '共有'}
          </button>
          <button onClick={handleExportCSV} className="btn-secondary text-sm py-2 px-3">CSV</button>
        </div>
      </nav>

      {/* タブ */}
      <div className="flex border-b border-[var(--card-border)] px-4">
        {(['games', 'players', 'stats'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-orange-500 text-orange-500' : 'border-transparent text-[var(--muted)] hover:text-white'}`}
          >
            {t === 'games' ? '試合' : t === 'players' ? '選手' : 'シーズン統計'}
          </button>
        ))}
      </div>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* 試合タブ */}
        {tab === 'games' && (
          <div>
            {/* チーム種別（一般 / ミニバス）。オーナーのみ変更可（メンバーはRLSで更新不可のため非表示） */}
            {isOwner && (
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="text-xs text-[var(--muted)] flex-shrink-0">種別</span>
                {(['general', 'mini'] as const).map(cat => {
                  const active = (team.category ?? 'general') === cat
                  return (
                    <button
                      key={cat}
                      onClick={async () => {
                        if (active) return
                        const supabase = createClient()
                        const { error } = await supabase.from('teams').update({ category: cat }).eq('id', id)
                        if (!error) setTeam(prev => prev ? { ...prev, category: cat } : prev)
                      }}
                      className="text-xs px-3 py-1.5 rounded-full border transition-colors"
                      style={active
                        ? { background: 'rgba(238,122,47,0.15)', borderColor: 'rgba(238,122,47,0.6)', color: '#f0a04b', fontWeight: 700 }
                        : { background: 'var(--card)', borderColor: 'var(--card-border)', color: 'var(--muted)' }}
                    >
                      {cat === 'general' ? '一般 / 中高' : 'ミニバス'}
                    </button>
                  )
                })}
                <span className="text-[10px] text-[var(--muted)]">
                  （ミニバス＝6分Q・3Pなし・タイムアウト各Q1回）
                </span>
              </div>
            )}

            {/* チーム共有ログイン（オーナーのみ） */}
            {isOwner && (
              <TeamLoginCard
                teamId={id}
                loginCode={loginCode}
                savedPassword={savedPassword}
                members={members}
                setLoginCode={setLoginCode}
                setSavedPassword={setSavedPassword}
                setMembers={setMembers}
              />
            )}
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold text-white">試合一覧</h2>
              <Link href={`/games/new?team=${id}`} className="btn-primary text-sm py-2 px-4">試合を登録</Link>
            </div>
            {games.length === 0 ? (
              <div className="card text-center py-12">
                <p className="text-[var(--muted)] mb-4">試合がまだありません</p>
                <Link href={`/games/new?team=${id}`} className="btn-primary">最初の試合を登録する</Link>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {games.map(game => (
                  <div key={game.id} className="card flex items-center gap-2 hover:border-orange-500/50 transition-colors p-0">
                    <Link href={`/games/${game.id}`} className="flex items-center justify-between flex-1 min-w-0 p-4">
                      <div className="min-w-0">
                        <div className="font-medium text-white">vs {game.opponent}</div>
                        <div className="text-sm text-[var(--muted)] truncate">
                          {format(new Date(game.game_date), 'M月d日（E）', { locale: ja })}
                          {game.location ? ` · ${game.location}` : ''}
                        </div>
                      </div>
                      <div className="text-right ml-3 flex-shrink-0">
                        <div className={`text-lg font-bold ${game.our_score > game.opponent_score ? 'text-green-400' : game.our_score < game.opponent_score ? 'text-red-400' : 'text-white'}`}>
                          {game.our_score} - {game.opponent_score}
                        </div>
                        <div className="text-xs text-[var(--muted)]">{game.is_finished ? '終了' : '進行中'}</div>
                      </div>
                    </Link>
                    <button
                      onClick={() => setConfirmDelete({ type: 'game', id: game.id, label: `vs ${game.opponent}（${format(new Date(game.game_date), 'M月d日', { locale: ja })}）` })}
                      className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg mr-2 text-[var(--muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors text-sm"
                      title="試合を削除"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 選手タブ */}
        {tab === 'players' && (
          <div>
            <h2 className="font-semibold text-white mb-4">選手登録</h2>

            {/* 写真から一括登録 */}
            <div className="card mb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">📷 写真から一括登録</div>
                  <div className="text-xs text-[var(--muted)] mt-0.5">公式記録用紙の写真を撮影 or アルバムから選んで自動登録</div>
                </div>
                <label className={`btn-primary text-sm py-2 px-4 cursor-pointer text-center w-full sm:w-auto sm:flex-shrink-0 ${extracting ? 'opacity-50 pointer-events-none' : ''}`}>
                  {extracting ? '処理中...' : '写真を選択'}
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={extracting} />
                </label>
              </div>
              {extracting && extractProgress && (
                <p className="text-orange-400 text-xs mt-2 animate-pulse">{extractProgress}</p>
              )}
              {extractError && <p className="text-red-400 text-xs mt-1">{extractError}</p>}
              {extractedPlayers.length > 0 && (
                <div className="mt-3 border-t border-[var(--card-border)] pt-3">
                  {/* チーム名 */}
                  {extractedTeamName && (
                    <div className="flex items-center gap-2 mb-3 bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2">
                      <span className="text-xs text-[var(--muted)]">読み取ったチーム名:</span>
                      <span className="text-orange-400 font-bold">{extractedTeamName}</span>
                    </div>
                  )}
                  {/* ヘッダー */}
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <div className="w-4" />
                    <div className="w-16 text-xs text-[var(--muted)] text-center">背番号</div>
                    <div className="flex-1 text-xs text-[var(--muted)]">選手名</div>
                    <div className="w-6" />
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto mb-3">
                    {extractedPlayers.map((p, i) => (
                      <div key={i} className={`flex items-center gap-2 rounded-lg px-1 py-0.5 ${p.selected ? '' : 'opacity-40'}`}>
                        <input
                          type="checkbox"
                          checked={p.selected}
                          onChange={e => setExtractedPlayers(prev => prev.map((x, j) => j === i ? { ...x, selected: e.target.checked } : x))}
                          className="w-4 h-4 accent-orange-500 flex-shrink-0"
                        />
                        <input
                          type="text"
                          value={p.number}
                          onChange={e => setExtractedPlayers(prev => prev.map((x, j) => j === i ? { ...x, number: e.target.value } : x))}
                          placeholder="—"
                          className="input-field w-16 text-center text-orange-400 font-bold px-1 py-1.5 text-sm"
                          maxLength={3}
                        />
                        <input
                          type="text"
                          value={p.name}
                          onChange={e => setExtractedPlayers(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                          placeholder="選手名"
                          className="input-field flex-1 py-1.5 text-sm"
                        />
                        <button onClick={() => setExtractedPlayers(prev => prev.filter((_, j) => j !== i))} className="text-[var(--muted)] hover:text-red-400 text-sm w-6 flex-shrink-0">✕</button>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-[var(--muted)] mb-2">誤認識がある場合は直接編集できます</div>
                  <div className="flex gap-2">
                    <button
                      onClick={saveExtractedPlayers}
                      disabled={savingExtracted || extractedPlayers.every(p => !p.selected)}
                      className="btn-primary text-sm py-2 px-4"
                    >
                      {savingExtracted ? '登録中...' : `✓ ${extractedPlayers.filter(p => p.selected).length}人を登録`}
                    </button>
                    <button onClick={() => { setExtractedPlayers([]); setExtractedTeamName('') }} className="btn-secondary text-sm py-2 px-4">キャンセル</button>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={addPlayer} className="card flex flex-col gap-2 mb-4">
              <div className="flex gap-3 flex-wrap">
                <input
                  className={`input-field w-20 flex-shrink-0 ${numberWarning ? 'border-yellow-400' : ''}`}
                  placeholder="#番号"
                  value={newPlayerNumber}
                  onChange={e => {
                    const raw = e.target.value
                    const hasZenkaku = /[０-９]/.test(raw)
                    if (hasZenkaku) setNumberWarning(true)
                    else setNumberWarning(false)
                    setNewPlayerNumber(toHankaku(raw))
                  }}
                  inputMode="numeric"
                  maxLength={3}
                />
                <input
                  className="input-field flex-1 min-w-32"
                  placeholder="選手名"
                  value={newPlayerName}
                  onChange={e => { setNewPlayerName(e.target.value); if (addError) setAddError('') }}
                  required
                />
                <button type="submit" disabled={addingPlayer} className="btn-primary py-2 px-4 text-sm whitespace-nowrap">
                  追加
                </button>
              </div>
              {numberWarning ? (
                <p className="text-xs text-yellow-400">⚠ 全角数字を半角に自動変換しました。背番号は半角数字で入力してください。</p>
              ) : (
                <p className="text-xs" style={{color:'var(--muted)'}}>背番号は半角数字（例: 10）で入力してください</p>
              )}
              {addError && <p className="text-xs text-red-400">⚠ {addError}</p>}
            </form>

            {players.length === 0 ? (
              <div className="card text-center py-8 text-[var(--muted)]">選手を追加してください</div>
            ) : (
              <div className="flex flex-col gap-2">
                {players.map(player => (
                  <div key={player.id} className="card flex items-center justify-between py-3 gap-2">
                    {editingPlayer?.id === player.id ? (
                      <>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <input
                            className="input-field text-center text-orange-400 font-bold px-1 py-1.5 text-sm"
                            style={{ width: '4rem', flexShrink: 0 }}
                            value={editingPlayer.number}
                            onChange={e => setEditingPlayer(prev => prev ? { ...prev, number: toHankaku(e.target.value) } : prev)}
                            inputMode="numeric"
                            maxLength={3}
                            placeholder="#"
                          />
                          <input
                            className="input-field py-1.5 text-sm"
                            style={{ flex: 1, minWidth: '6rem' }}
                            value={editingPlayer.name}
                            onChange={e => setEditingPlayer(prev => prev ? { ...prev, name: e.target.value } : prev)}
                            placeholder="選手名"
                          />
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={savePlayerEdit}
                            disabled={savingEdit || !editingPlayer.name.trim()}
                            className="btn-primary text-xs py-1.5 px-3"
                          >
                            {savingEdit ? '保存中...' : '保存'}
                          </button>
                          <button onClick={() => setEditingPlayer(null)} className="text-[var(--muted)] text-xs">キャンセル</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-orange-400 font-bold w-8 text-center flex-shrink-0">#{player.number || '—'}</span>
                          <span className="text-white font-medium truncate">{player.name}</span>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <button
                            onClick={() => setEditingPlayer({ id: player.id, name: player.name, number: player.number ?? '' })}
                            className="text-[var(--muted)] hover:text-orange-400 text-sm transition-colors"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => setConfirmDelete({ type: 'player', id: player.id, label: `#${player.number || '—'} ${player.name}` })}
                            className="text-[var(--muted)] hover:text-red-400 text-sm transition-colors"
                          >
                            削除
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* シーズン統計タブ */}
        {tab === 'stats' && (
          <SeasonStatsTab teamId={id} games={games} />
        )}
      </main>

      {/* 削除確認モーダル */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl p-6 w-full max-w-xs shadow-2xl text-center" onClick={e => e.stopPropagation()}>
            <div className="text-4xl mb-3">🗑️</div>
            <h2 className="text-lg font-bold text-white mb-1">
              {confirmDelete.type === 'player' ? '選手を削除しますか？' : 'この試合を削除しますか？'}
            </h2>
            <p className="text-white font-bold text-sm mb-1 truncate">{confirmDelete.label}</p>
            <p className="text-sm text-[var(--muted)] mb-5">
              {confirmDelete.type === 'player' ? '記録されたスタッツも削除されます' : 'スタッツのデータもすべて削除されます'}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  if (confirmDelete.type === 'player') deletePlayer(confirmDelete.id)
                  else deleteGame(confirmDelete.id)
                  setConfirmDelete(null)
                }}
                className="w-full bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-300 rounded-xl py-3 font-bold transition-all active:scale-95"
              >
                削除する
              </button>
              <button onClick={() => setConfirmDelete(null)} className="w-full btn-secondary rounded-xl py-3 font-bold">
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TeamLoginCard({
  teamId,
  loginCode,
  savedPassword,
  members,
  setLoginCode,
  setSavedPassword,
  setMembers,
}: {
  teamId: string
  loginCode: string | null
  savedPassword: string | null
  members: { user_id: string; created_at: string }[]
  setLoginCode: (v: string | null) => void
  setSavedPassword: (v: string | null) => void
  setMembers: (v: { user_id: string; created_at: string }[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  // 半角英数字のみに正規化（全角→半角し、ひらがな・記号・空白は除去）。
  // 共有パスワードはスマホでも確実に打てる英数字に統一する。
  function toAlnum(s: string): string {
    return s
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[^A-Za-z0-9]/g, '')
  }

  function generatePassword() {
    const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789' // 紛らわしい o/l/0/1 は除外
    const pw = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
    setPassword(pw)
    setErr('')
  }

  async function save() {
    if (password.length < 4) { setErr('パスワードは半角の英数字4文字以上にしてください'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/team-login/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, password }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error ?? '設定に失敗しました'); setBusy(false); return }
      setLoginCode(data.loginCode)
      setSavedPassword(password)
      setPassword('')
      setEditing(false)
      setMsg('✓ 設定しました')
      setTimeout(() => setMsg(''), 3000)
    } catch {
      setErr('通信エラーが発生しました')
    }
    setBusy(false)
  }

  async function disable() {
    if (!confirm('チーム共有ログインを無効化しますか？\n今ログイン中のメンバーも記録できなくなります。')) return
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/team-login/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, action: 'disable' }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error ?? '無効化に失敗しました'); setBusy(false); return }
      setLoginCode(null)
      setMembers([])
      setSavedPassword(null)
      setEditing(false)
    } catch {
      setErr('通信エラーが発生しました')
    }
    setBusy(false)
  }

  async function removeMember(userId: string) {
    const supabase = createClient()
    const { error } = await supabase.from('team_members').delete().eq('team_id', teamId).eq('user_id', userId)
    if (!error) setMembers(members.filter(m => m.user_id !== userId))
  }

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text)
    setMsg(label)
    setTimeout(() => setMsg(''), 3000)
  }

  const inviteText = loginCode
    ? `🏀 バスケの記録アプリ「BasketStats」に参加してね！\n\nログインページ: ${typeof window !== 'undefined' ? window.location.origin : ''}/login\n「チームのID・パスワードで参加」から下記を入力するだけ！\n\nチームID: ${loginCode}\nパスワード: ${savedPassword ?? '（代表者にご確認ください）'}`
    : ''

  return (
    <div className="card mb-4">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 text-left">
        <span className="text-lg">🔑</span>
        <span className="font-semibold text-white flex-1">チームで共有ログイン</span>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={loginCode
            ? { background: 'rgba(6,199,85,0.15)', color: '#22c55e' }
            : { background: 'var(--card-border)', color: 'var(--muted)' }}
        >
          {loginCode ? '有効' : '未設定'}
        </span>
        <span className="text-[var(--muted)] text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-3 border-t border-[var(--card-border)] pt-3">
          <p className="text-xs text-[var(--muted)] leading-relaxed mb-3">
            チーム用の<b className="text-white">パスワード</b>を決めると、他の保護者・スタッフも
            <b className="text-white">チームID＋パスワード</b>でログインして記録できます。
            個人のGoogle・メールを教える必要はありません。（支払い・チーム削除は代表者のみ）
          </p>

          {err && <p className="text-xs text-red-400 mb-2">⚠ {err}</p>}

          {!loginCode || editing ? (
            <div className="flex flex-col gap-2">
              <input
                type="text"
                className="input-field text-base"
                value={password}
                onChange={e => setPassword(toAlnum(e.target.value))}
                placeholder={loginCode ? '新しいパスワード（半角英数字）' : 'チームのパスワード（半角英数字）'}
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
              />
              <p className="text-[10px] text-[var(--muted)] leading-relaxed">
                スマホでも打ちやすいよう、<b className="text-white">半角の英数字</b>だけ設定できます（例: hawks2024）。
                日本語や記号は自動で除かれます。
              </p>
              <div className="flex gap-2 flex-wrap">
                <button onClick={save} disabled={busy || password.length < 4} className="btn-primary text-sm py-2 px-4">
                  {busy ? '保存中…' : loginCode ? 'パスワードを変更' : '有効にする'}
                </button>
                <button onClick={generatePassword} type="button" className="btn-secondary text-sm py-2 px-4">
                  🎲 自動で作る
                </button>
                {editing && (
                  <button onClick={() => { setEditing(false); setPassword(''); setErr('') }} className="btn-secondary text-sm py-2 px-4">
                    キャンセル
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* チームID＋パスワード */}
              <div className="flex flex-col gap-2 bg-orange-500/10 border border-orange-500/30 rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-[var(--muted)]">チームID</div>
                    <div className="text-lg font-black tracking-widest text-orange-400">{loginCode}</div>
                  </div>
                  <button onClick={() => copyText(loginCode, '✓ チームIDをコピー')} className="btn-secondary text-xs py-2 px-3 flex-shrink-0">
                    コピー
                  </button>
                </div>
                <div className="flex items-center gap-2 border-t border-orange-500/20 pt-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-[var(--muted)]">パスワード</div>
                    <div className="text-lg font-black text-orange-400">
                      {savedPassword ?? '（「パスワードを変更」で再設定してください）'}
                    </div>
                  </div>
                  {savedPassword && (
                    <button onClick={() => copyText(savedPassword, '✓ パスワードをコピー')} className="btn-secondary text-xs py-2 px-3 flex-shrink-0">
                      コピー
                    </button>
                  )}
                </div>
              </div>

              <button
                onClick={() => copyText(inviteText, '✓ 招待メッセージをコピー')}
                className="btn-primary text-sm py-2.5 px-4"
              >
                📋 LINE用の招待メッセージをコピー（ID＋パスワード入り）
              </button>
              {!savedPassword && (
                <p className="text-[10px] text-[var(--muted)] -mt-1">
                  ※ このチームIDは以前の方式で作られたため、パスワードが表示できません。
                  「パスワードを変更」で英数字のパスワードに再設定すると、以降は招待文にパスワードも入ります。
                </p>
              )}

              <div className="flex gap-2">
                <button onClick={() => { setEditing(true); setErr('') }} className="btn-secondary text-sm py-2 px-4">
                  パスワードを変更
                </button>
                <button onClick={disable} disabled={busy} className="text-sm py-2 px-4 rounded-xl border border-red-500/40 text-red-300 hover:bg-red-500/10 transition-colors">
                  無効化
                </button>
              </div>

              {/* メンバー一覧 */}
              <div className="border-t border-[var(--card-border)] pt-3">
                <div className="text-xs text-[var(--muted)] mb-2">
                  参加中のメンバー：{members.length}人
                </div>
                {members.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {members.map((m, i) => (
                      <div key={m.user_id} className="flex items-center justify-between text-sm">
                        <span className="text-white">👤 記録者{i + 1}</span>
                        <button onClick={() => removeMember(m.user_id)} className="text-[var(--muted)] hover:text-red-400 text-xs transition-colors">
                          解除
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {msg && <p className="text-xs text-green-400 mt-2">{msg}</p>}
        </div>
      )}
    </div>
  )
}

function SeasonStatsTab({ teamId, games }: { teamId: string; games: Game[] }) {
  const [stats, setStats] = useState<ReturnType<typeof aggregateSeasonStats>>([])
  const [loading, setLoading] = useState(true)
  const [allStats, setAllStats] = useState<Parameters<typeof aggregateSeasonStats>[0]>([])
  const [filterMonth, setFilterMonth] = useState<string>('all')

  // 月ごとのオプション生成（試合のある月のみ）
  const monthOptions = Array.from(
    new Set(games.map(g => g.game_date.slice(0, 7)))
  ).sort().reverse()

  // フィルター適用後の試合
  const filteredGames = filterMonth === 'all' ? games : games.filter(g => g.game_date.startsWith(filterMonth))

  useEffect(() => {
    async function load() {
      if (games.length === 0) { setLoading(false); return }
      const supabase = createClient()
      const { data } = await supabase
        .from('player_stats')
        .select('*, player:players(*)')
        .in('game_id', games.map(g => g.id))

      if (data) {
        setAllStats(data as Parameters<typeof aggregateSeasonStats>[0])
        setStats(aggregateSeasonStats(data as Parameters<typeof aggregateSeasonStats>[0]))
      }
      setLoading(false)
    }
    load()
  }, [games])

  // フィルター変更時に再集計
  useEffect(() => {
    if (allStats.length === 0) return
    const filteredIds = new Set(filteredGames.map(g => g.id))
    const filtered = allStats.filter(s => filteredIds.has(s.game_id))
    setStats(aggregateSeasonStats(filtered))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMonth, allStats])

  if (loading) return <div className="text-[var(--muted)] text-center py-8">集計中...</div>
  if (stats.length === 0) return <div className="card text-center py-12 text-[var(--muted)]">試合データがありません</div>

  const formatMonth = (m: string) => {
    const [y, mo] = m.split('-')
    return `${y}年${parseInt(mo)}月`
  }

  return (
    <div>
      {/* 期間フィルター */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs text-[var(--muted)]">期間:</span>
        <button
          onClick={() => setFilterMonth('all')}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${filterMonth === 'all' ? 'bg-orange-500 border-orange-500 text-white' : 'bg-[var(--card)] border-[var(--card-border)] text-[var(--muted)]'}`}
        >
          全期間（{games.length}試合）
        </button>
        {monthOptions.map(m => (
          <button
            key={m}
            onClick={() => setFilterMonth(m)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${filterMonth === m ? 'bg-orange-500 border-orange-500 text-white' : 'bg-[var(--card)] border-[var(--card-border)] text-[var(--muted)]'}`}
          >
            {formatMonth(m)}（{games.filter(g => g.game_date.startsWith(m)).length}試合）
          </button>
        ))}
      </div>
      <h2 className="font-semibold text-white mb-4">
        シーズン統計（{filteredGames.length}試合）
        {filteredGames.some(g => !g.is_finished) && (
          <span className="ml-2 text-xs font-normal text-[var(--muted)]">※進行中の試合を含む（共有ページの統計は終了試合のみ）</span>
        )}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-[var(--muted)] border-b border-[var(--card-border)]">
              <th className="text-left py-2 pr-3">#</th>
              <th className="text-left py-2 pr-3">選手</th>
              <th className="text-right py-2 pr-3">試合</th>
              <th className="text-right py-2 pr-3">平均得点</th>
              <th className="text-right py-2 pr-3">FG%</th>
              <th className="text-right py-2 pr-3">3P%</th>
              <th className="text-right py-2 pr-3">FT%</th>
              <th className="text-right py-2 pr-3">平均REB</th>
              <th className="text-right py-2 pr-3">平均AST</th>
              <th className="text-right py-2 pr-3">STL</th>
              <th className="text-right py-2">BLK</th>
            </tr>
          </thead>
          <tbody>
            {stats.map(s => (
              <tr key={s.player_id} className="border-b border-[var(--card-border)] hover:bg-white/5">
                <td className="py-3 pr-3 text-orange-400 font-medium">#{s.player_number}</td>
                <td className="py-3 pr-3 text-white font-medium">{s.player_name}</td>
                <td className="py-3 pr-3 text-right text-[var(--muted)]">{s.games_played}</td>
                <td className="py-3 pr-3 text-right font-bold text-white">{s.avg_points}</td>
                <td className="py-3 pr-3 text-right">{s.fg_pct}%</td>
                <td className="py-3 pr-3 text-right">{s.fg3_pct}%</td>
                <td className="py-3 pr-3 text-right">{s.ft_pct}%</td>
                <td className="py-3 pr-3 text-right">{s.avg_rebounds}</td>
                <td className="py-3 pr-3 text-right">{s.avg_assists}</td>
                <td className="py-3 pr-3 text-right">{s.total_steals}</td>
                <td className="py-3 text-right">{s.total_blocks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
