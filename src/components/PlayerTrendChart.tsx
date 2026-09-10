import type { TrendPoint } from '@/lib/stats'

/**
 * 選手1人ぶんの試合推移を描く折れ線グラフ。
 *
 * ライブラリは使わず素のSVGで描く（月500円のアプリにチャートライブラリぶんの
 * バンドルを足すと、体育館の電波で開くのが遅くなるため）。
 * viewBox + width:100% なので、375pxのスマホでもPCでも同じ見た目で伸縮する。
 */

const W = 340
const H = 180
const PAD_L = 30
const PAD_R = 12
const PAD_T = 24
const PAD_B = 28
const PLOT_W = W - PAD_L - PAD_R
const PLOT_H = H - PAD_T - PAD_B

const COLOR_LINE = '#ee7a2f'
const COLOR_DOT = '#f0a04b'
const COLOR_GRID = '#1a3a56'
const COLOR_TEXT = '#6ba8c8'

function niceMax(values: number[], isPct: boolean): number {
  if (isPct) return 100
  const max = Math.max(...values, 0)
  // 偶数に切り上げる。奇数だと中間グリッド線が 7.5 のような半端な値になり、
  // 表示を丸めるとラベル（8）と線の位置（7.5）がズレて嘘になるため。
  return Math.max(4, Math.ceil(max / 2) * 2)
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

export default function PlayerTrendChart({
  points,
  unit,
  label,
}: {
  points: TrendPoint[]
  unit: string
  label: string
}) {
  if (points.length === 0) {
    return (
      <div className="py-10 text-center text-sm" style={{ color: COLOR_TEXT }}>
        まだ終了した試合の記録がありません
      </div>
    )
  }

  // 全試合0のときは折れ線を描かない。値が0だと線が0のグリッド線に重なり、
  // 横軸そのものに見えて描画バグのようになるため。
  // このアプリは「押さなければ0のまま集計される」設計なので、得点しか押して
  // いないチームでは AST/REB/STL が全試合0になるのはむしろ普通の状態。
  if (points.every(p => p.value === 0)) {
    return (
      <div className="py-8 text-center">
        <div className="text-sm font-bold" style={{ color: '#e8f4fd' }}>
          {label}は、この期間すべて0でした
        </div>
        <div className="mt-1 text-xs" style={{ color: COLOR_TEXT }}>
          終了した{points.length}試合ぶん
        </div>
      </div>
    )
  }

  const isPct = unit === '%'
  const values = points.map(p => p.value)
  const yMax = niceMax(values, isPct)
  const n = points.length

  const x = (i: number) => (n === 1 ? PAD_L + PLOT_W / 2 : PAD_L + (PLOT_W * i) / (n - 1))
  const y = (v: number) => PAD_T + PLOT_H - (Math.min(v, yMax) / yMax) * PLOT_H

  const avg = values.reduce((a, b) => a + b, 0) / n
  // 平均線は「自分の平均より上か下か」を見るためのもの。1試合しかない場合や
  // 全試合が同じ値の場合は何も語らないうえ、0点続きだと0の軸と重なるので出さない。
  const showAvg = n > 1 && Math.max(...values) !== Math.min(...values)
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')

  // 点が多いと日付ラベルが潰れるので間引く。値ラベルは8試合までなら全部出す。
  const labelStep = Math.ceil(n / 6)
  const showValues = n <= 8

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height: 'auto' }}
      role="img"
      aria-label={`試合ごとの推移グラフ（${n}試合）`}
    >
      {/* 横グリッドとY軸ラベル（0・中間・最大の3本） */}
      {[0, yMax / 2, yMax].map(v => (
        <g key={v}>
          <line x1={PAD_L} y1={y(v)} x2={W - PAD_R} y2={y(v)} stroke={COLOR_GRID} strokeWidth={1} />
          <text x={PAD_L - 6} y={y(v) + 3.5} textAnchor="end" fontSize={9} fill={COLOR_TEXT}>
            {Math.round(v)}
          </text>
        </g>
      ))}

      {/* 平均線（この選手自身の平均。これより上か下かで調子が分かる） */}
      {showAvg && (
        <>
          <line
            x1={PAD_L} y1={y(avg)} x2={W - PAD_R} y2={y(avg)}
            stroke={COLOR_TEXT} strokeWidth={1} strokeDasharray="3 3" opacity={0.7}
          />
          <text x={W - PAD_R} y={y(avg) - 4} textAnchor="end" fontSize={8} fill={COLOR_TEXT}>
            平均 {Math.round(avg * 10) / 10}
          </text>
        </>
      )}

      {/* 折れ線（1試合しかないときは線を引かず点だけ） */}
      {n > 1 && (
        <polyline points={line} fill="none" stroke={COLOR_LINE} strokeWidth={2.5}
          strokeLinejoin="round" strokeLinecap="round" />
      )}

      {points.map((p, i) => (
        <g key={p.gameId}>
          <circle cx={x(i)} cy={y(p.value)} r={n > 12 ? 2.5 : 4} fill={COLOR_DOT}
            stroke="#0d2235" strokeWidth={1.5} />
          {showValues && (
            <text x={x(i)} y={y(p.value) - 9} textAnchor="middle" fontSize={10}
              fontWeight={700} fill="#e8f4fd">
              {p.value}{isPct ? '%' : ''}
            </text>
          )}
          {i % labelStep === 0 && (
            <text x={x(i)} y={H - PAD_B + 14} textAnchor="middle" fontSize={9} fill={COLOR_TEXT}>
              {shortDate(p.date)}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}
