import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '特定商取引法に基づく表記 | BasketStats',
}

// 個人事業主の場合、住所・電話番号は「請求があったら遅滞なく開示する」
// 旨の記載で省略できる（特定商取引法施行規則）。
const rows: [string, React.ReactNode][] = [
  ['販売事業者', '貝阿弥 歩美'],
  ['運営責任者', '貝阿弥 歩美'],
  ['所在地', '個人事業主のため省略しています。請求があったら遅滞なく開示します。下記メールアドレスよりご請求ください。'],
  ['電話番号', '個人事業主のため省略しています。請求があったら遅滞なく開示します。下記メールアドレスよりご請求ください。'],
  ['お問い合わせ先', 'basketstats.jp@gmail.com'],
  ['販売URL', 'https://basket-stats-three.vercel.app'],
  ['販売価格', 'スタンダードプラン 月額500円（税込）'],
  ['商品代金以外の必要料金', 'インターネット接続にかかる通信費はお客様のご負担となります。'],
  ['支払方法', 'クレジットカード決済（Stripe）'],
  ['支払時期', 'お申込み時に初回分を課金し、以降は毎月の更新日に自動課金されます。'],
  ['サービス提供時期', '決済完了後、ただちにご利用いただけます。'],
  ['解約について', 'アプリ内の「プラン管理」からいつでも解約できます。解約後も現在の課金期間の終了日までご利用いただけます。期間途中での日割り返金は行っておりません。'],
  ['返品・キャンセル', 'デジタルサービスの性質上、決済完了後の返金はお受けできません。無料枠（3試合）にて事前に動作をご確認ください。'],
  ['動作環境', 'スマートフォン・タブレット・PCの最新ブラウザ（インストール不要）'],
]

export default function TokushohoPage() {
  return (
    <main className="min-h-screen px-5 py-10">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-xs" style={{ color: 'var(--muted)' }}>← トップに戻る</Link>
        <h1 className="text-xl font-bold text-white mt-4 mb-6">特定商取引法に基づく表記</h1>
        <div className="card divide-y" style={{ borderColor: 'var(--card-border)' }}>
          {rows.map(([label, value]) => (
            <div key={label} className="py-3 flex flex-col sm:flex-row gap-1 sm:gap-4">
              <div className="sm:w-44 flex-shrink-0 text-xs font-bold text-white">{label}</div>
              <div className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex gap-4 text-xs" style={{ color: 'var(--muted)' }}>
          <Link href="/terms" className="underline">利用規約</Link>
          <Link href="/privacy" className="underline">プライバシーポリシー</Link>
        </div>
      </div>
    </main>
  )
}
