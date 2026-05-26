'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Team, Player } from '@/types'
import { Suspense } from 'react'

type PlayerRow = { number: string; name: string; selected: boolean }

function PlayerEditor({ players, onChange }: { players: PlayerRow[]; onChange: (p: PlayerRow[]) => void }) {
  const [newNum, setNewNum] = useState('')
  const [newName, setNewName] = useState('')

  function add(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    onChange([...players, { number: newNum.trim(), name: newName.trim(), selected: true }])
    setNewNum('')
    setNewName('')
  }

  return (
    <div>
      {players.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-1.5 px-1">
            <div className="w-4" />
            <div className="flex-1 text-xs text-[var(--muted)]">選手名</div>
            <div className="w-14 text-xs text-[var(--muted)] text-center flex-shrink-0">背番号</div>
            <div className="w-6" />
          </div>
          <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto mb-3">
            {players.map((p, i) => (
              <div key={i} className={`flex items-center gap-2 rounded-lg px-1 py-0.5 ${p.selected ? '' : 'opacity-40'}`}>
                <input
                  type="checkbox"
                  checked={p.selected}
                  onChange={e => onChange(players.map((x, j) => j === i ? { ...x, selected: e.target.checked } : x))}
                  className="w-4 h-4 accent-orange-500 flex-shrink-0"
                />
                <input
                  type="text"
                  value={p.name}
                  onChange={e => onChange(players.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  placeholder="選手名"
                  className="input-field flex-1 min-w-0 py-1.5 text-sm"
                />
                <div className="w-14 flex-shrink-0">
                  <input
                    type="text"
                    value={p.number}
                    onChange={e => onChange(players.map((x, j) => j === i ? { ...x, number: e.target.value } : x))}
                    placeholder="—"
                    className="input-field w-full text-center text-orange-400 font-bold px-1 py-1.5 text-sm"
                    maxLength={3}
                  />
                </div>
                <button
                  onClick={() => onChange(players.filter((_, j) => j !== i))}
                  className="text-[var(--muted)] hover:text-red-400 text-sm w-6 flex-shrink-0"
                >✕</button>
              </div>
            ))}
          </div>
        </>
      )}
      <form onSubmit={add} className="flex gap-2">
        <input
          className="input-field flex-1 min-w-0 py-2 text-sm"
          placeholder="選手名を追加"
          value={newName}
          onChange={e => setNewName(e.target.value)}
        />
        <div className="w-14 flex-shrink-0">
          <input
            className="input-field w-full text-center text-orange-400 font-bold px-1 py-2 text-sm"
            placeholder="番号"
            value={newNum}
            onChange={e => setNewNum(e.target.value)}
            maxLength={3}
          />
        </div>
        <button type="submit" className="btn-secondary text-sm py-2 px-3">＋</button>
      </form>
    </div>
  )
}

function NewGameForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const teamId = searchParams.get('team') ?? ''

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeam, setSelectedTeam] = useState(teamId)
  const [registeredPlayers, setRegisteredPlayers] = useState<Player[]>([])

  // Step 1
  const [opponent, setOpponent] = useState('')
  const [gameDate, setGameDate] = useState(new Date().toISOString().split('T')[0])
  const [location, setLocation] = useState('')
  const [homeOrAway, setHomeOrAway] = useState<'home' | 'away'>('home')

  // Step 2
  const [ourPlayers, setOurPlayers] = useState<PlayerRow[]>([])
  const [ourExtracting, setOurExtracting] = useState(false)
  const [ourExtractError, setOurExtractError] = useState('')
  const [ourTeamName, setOurTeamName] = useState('')

  // Step 3
  const [oppPlayers, setOppPlayers] = useState<PlayerRow[]>([])
  const [oppExtracting, setOppExtracting] = useState(false)
  const [oppExtractError, setOppExtractError] = useState('')
  const [oppTeamName, setOppTeamName] = useState('')

  const [creating, setCreating] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('teams').select('*').eq('user_id', user.id)
      setTeams(data ?? [])
    }
    load()
  }, [])

  useEffect(() => {
    if (!selectedTeam) return
    async function loadPlayers() {
      const supabase = createClient()
      const { data } = await supabase.from('players').select('*').eq('team_id', selectedTeam).order('number')
      const list = data ?? []
      setRegisteredPlayers(list)
      setOurPlayers([])
    }
    loadPlayers()
  }, [selectedTeam])

  async function extractPlayers(
    file: File,
    setExtracting: (v: boolean) => void,
    setError: (v: string) => void,
    setTeamName: (v: string) => void,
    onResult: (players: PlayerRow[]) => void
  ) {
    setError('')
    setExtracting(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch('/api/extract-players', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '読み取りに失敗しました')
      } else {
        const list = (data.players as { number: string; name: string }[]) ?? []
        setTeamName(data.team_name ?? '')
        onResult(list.map(p => ({ ...p, selected: true })))
        if (list.length === 0) setError('選手データが見つかりませんでした')
      }
    } catch {
      setError('通信エラーが発生しました')
    }
    setExtracting(false)
  }

  async function handleOurPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const existingNums = new Set(ourPlayers.map(p => p.number))
    await extractPlayers(file, setOurExtracting, setOurExtractError, setOurTeamName, (extracted) => {
      const newOnes = extracted.filter(p => !existingNums.has(p.number))
      setOurPlayers(prev => [...prev, ...newOnes])
    })
  }

  async function handleOppPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    await extractPlayers(file, setOppExtracting, setOppExtractError, setOppTeamName, setOppPlayers)
  }

  async function handleCreate() {
    if (!selectedTeam || !opponent.trim()) return
    setCreating(true)

    const supabase = createClient()

    // 既存選手のうちチェックされているもののIDを収集（番号で照合）
    const existingNums = new Set(registeredPlayers.map(p => p.number ?? ''))
    const selectedExistingIds = registeredPlayers
      .filter(rp => ourPlayers.some(op => op.selected && op.number === (rp.number ?? '')))
      .map(p => p.id)

    // 番号が登録済みに存在しない選手のみ新規挿入
    const newOwn = ourPlayers.filter(p => p.selected && p.name.trim() && !existingNums.has(p.number))
    let newInsertedIds: string[] = []
    if (newOwn.length > 0) {
      const { data: inserted } = await supabase.from('players')
        .insert(newOwn.map(p => ({ team_id: selectedTeam, name: p.name.trim(), number: p.number.trim() })))
        .select('id')
      newInsertedIds = inserted?.map(p => p.id) ?? []
    }

    const { data, error } = await supabase
      .from('games')
      .insert({
        team_id: selectedTeam,
        opponent: opponent.trim(),
        game_date: gameDate,
        location: location.trim() || null,
        home_or_away: homeOrAway,
        our_score: 0,
        opponent_score: 0,
        quarter: 1,
        is_finished: false,
      })
      .select()
      .single()

    if (!error && data) {
      // この試合のホームメンバーIDを保存（スタッツ画面でこのメンバーのみ表示）
      const homePlayerIds = [...selectedExistingIds, ...newInsertedIds]
      if (homePlayerIds.length > 0) {
        localStorage.setItem(`game_${data.id}_home_players`, JSON.stringify(homePlayerIds))
      }
      // 相手チーム選手を保存
      const oppToSave = oppPlayers.filter(p => p.selected && p.name.trim())
      if (oppToSave.length > 0) {
        localStorage.setItem(`game_${data.id}_opponent_players`, JSON.stringify(oppToSave))
      }
      router.push(`/games/${data.id}`)
    } else {
      setCreating(false)
    }
  }

  const steps = ['試合情報', '自チーム選手', '相手チーム選手']

  return (
    <main className="min-h-screen max-w-lg mx-auto px-4 py-8">
      <Link href={teamId ? `/teams/${teamId}` : '/dashboard'} className="text-[var(--muted)] text-sm hover:text-white mb-6 inline-flex items-center gap-1">
        ← 戻る
      </Link>
      <h1 className="text-2xl font-bold text-white mb-6">試合を登録</h1>

      {/* Step indicators */}
      <div className="flex items-center gap-1 mb-8">
        {steps.map((label, idx) => {
          const s = idx + 1
          const active = step === s
          const done = step > s
          return (
            <div key={s} className="flex items-center gap-1 flex-1">
              <button
                onClick={() => done ? setStep(s as 1|2|3) : undefined}
                className={`flex items-center gap-1.5 ${done ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${active ? 'bg-orange-500 text-white' : done ? 'bg-orange-500/40 text-orange-300' : 'bg-[var(--card-border)] text-[var(--muted)]'}`}>
                  {done ? '✓' : s}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${active ? 'text-white' : 'text-[var(--muted)]'}`}>{label}</span>
              </button>
              {s < 3 && <div className={`flex-1 h-px mx-1 ${done ? 'bg-orange-500' : 'bg-[var(--card-border)]'}`} />}
            </div>
          )
        })}
      </div>

      {/* Step 1: Game info */}
      {step === 1 && (
        <div className="card flex flex-col gap-4">
          <h2 className="font-semibold text-white">試合情報</h2>

          {teams.length > 1 && (
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1.5">チーム</label>
              <select className="input-field" value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)} required>
                <option value="">選択してください</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">対戦相手</label>
            <input
              className="input-field"
              value={opponent}
              onChange={e => setOpponent(e.target.value)}
              placeholder="例：○○高校"
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">試合日</label>
            <input
              type="date"
              className="input-field"
              value={gameDate}
              onChange={e => setGameDate(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">会場（任意）</label>
            <input
              className="input-field"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="例：○○体育館"
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">ホーム / アウェイ</label>
            <div className="flex gap-3">
              {(['home', 'away'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setHomeOrAway(v)}
                  className={`flex-1 py-2 rounded-lg border font-medium text-sm transition-colors ${homeOrAway === v ? 'bg-orange-500 border-orange-500 text-white' : 'bg-transparent border-[var(--card-border)] text-[var(--muted)]'}`}
                >
                  {v === 'home' ? 'ホーム' : 'アウェイ'}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setStep(2)}
            disabled={!selectedTeam || !opponent.trim()}
            className="btn-primary w-full justify-center mt-2"
          >
            次へ：自チーム選手を確認 →
          </button>
        </div>
      )}

      {/* Step 2: Our team players */}
      {step === 2 && (
        <div className="card flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">自チームの選手</h2>
            <span className="text-xs text-orange-400 font-medium">{ourPlayers.filter(p => p.selected).length}人選択中</span>
          </div>

          {/* 写真から追加 */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className={`btn-primary text-sm py-2 px-4 cursor-pointer inline-flex items-center gap-1.5 ${ourExtracting ? 'opacity-50 pointer-events-none' : ''}`}>
              📷 {ourExtracting ? '読み取り中...' : '写真から読み込む'}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleOurPhoto} disabled={ourExtracting} />
            </label>
          </div>

          {ourTeamName && (
            <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2">
              <span className="text-xs text-[var(--muted)]">読み取ったチーム名:</span>
              <span className="text-orange-400 font-bold">{ourTeamName}</span>
            </div>
          )}
          {ourExtractError && <p className="text-red-400 text-xs">{ourExtractError}</p>}

          {/* 登録済みメンバーから選ぶ */}
          {registeredPlayers.length > 0 && (() => {
            const alreadyAdded = new Set(ourPlayers.map(op => `${op.number}_${op.name}`))
            const remaining = registeredPlayers.filter(rp => !alreadyAdded.has(`${rp.number ?? ''}_${rp.name}`))
            return remaining.length > 0 ? (
              <div>
                <div className="text-xs text-[var(--muted)] mb-2">登録済みメンバーから選ぶ:</div>
                <div className="flex flex-wrap gap-2">
                  {remaining.map(rp => (
                    <button
                      key={rp.id}
                      type="button"
                      onClick={() => setOurPlayers(prev => [...prev, { number: rp.number ?? '', name: rp.name, selected: true }])}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--card-border)] text-sm hover:border-orange-500/60 transition-colors"
                    >
                      <span className="text-orange-400 font-bold text-xs">#{rp.number || '—'}</span>
                      <span className="text-white text-xs">{rp.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null
          })()}

          {/* 選択済みリスト */}
          {ourPlayers.length > 0 && (
            <div>
              <div className="text-xs text-[var(--muted)] mb-2">選択中のメンバー:</div>
              <PlayerEditor players={ourPlayers} onChange={setOurPlayers} />
            </div>
          )}

          {ourPlayers.length === 0 && (
            <p className="text-xs text-[var(--muted)] text-center py-2">写真を読み込むか、登録済みメンバーから選んでください</p>
          )}

          <div className="flex gap-3 mt-2">
            <button onClick={() => setStep(1)} className="btn-secondary flex-1 justify-center">← 戻る</button>
            <button onClick={() => setStep(3)} className="btn-primary flex-1 justify-center">
              次へ：相手チーム →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Opponent team players */}
      {step === 3 && (
        <div className="card flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">
              相手チームの選手
              {opponent && <span className="text-orange-400 ml-1 text-base">（{opponent}）</span>}
            </h2>
            <span className="text-xs text-orange-400 font-medium">{oppPlayers.filter(p => p.selected).length}人</span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-[var(--muted)]">写真から登録:</span>
            <label className={`btn-secondary text-sm py-2 px-3 cursor-pointer inline-flex items-center gap-1.5 ${oppExtracting ? 'opacity-50 pointer-events-none' : ''}`}>
              📷 {oppExtracting ? '読み取り中...' : '写真を選択'}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleOppPhoto} disabled={oppExtracting} />
            </label>
          </div>

          {oppTeamName && (
            <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2">
              <span className="text-xs text-[var(--muted)]">読み取ったチーム名:</span>
              <span className="text-orange-400 font-bold">{oppTeamName}</span>
            </div>
          )}
          {oppExtractError && <p className="text-red-400 text-xs">{oppExtractError}</p>}

          <PlayerEditor players={oppPlayers} onChange={setOppPlayers} />

          <p className="text-xs text-[var(--muted)]">相手チームの登録はスキップして試合を開始できます</p>

          <div className="flex gap-3 mt-2">
            <button onClick={() => setStep(2)} className="btn-secondary flex-1 justify-center">← 戻る</button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="btn-primary flex-1 justify-center"
            >
              {creating ? '作成中...' : '🏀 試合開始！'}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

export default function NewGamePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-[var(--muted)]">読み込み中...</div>}>
      <NewGameForm />
    </Suspense>
  )
}
