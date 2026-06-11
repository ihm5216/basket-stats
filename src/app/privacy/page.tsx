import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'プライバシーポリシー | BasketStats',
}

const sections: { title: string; body: string[] }[] = [
  {
    title: '1. 取得する情報',
    body: [
      '本サービスは、次の情報を取得します。(1) メールアドレス・Googleアカウント情報（ログインのため） (2) 利用者が登録するチーム名・選手名・背番号・試合データ (3) 決済に関する情報（Stripe社が取得・管理し、運営者はカード番号を保持しません） (4) アクセスログ・Cookie等の技術情報',
    ],
  },
  {
    title: '2. 利用目的',
    body: [
      '取得した情報は、(1) 本サービスの提供・本人確認 (2) 料金の決済 (3) お問い合わせへの対応 (4) サービスの改善・不具合対応 (5) 重要なお知らせの連絡 のために利用します。',
    ],
  },
  {
    title: '3. 外部サービスへの提供',
    body: [
      '本サービスは、以下の外部サービスを利用しており、必要な範囲で情報が共有されます。',
      '・Supabase（データベース・認証基盤）　・Stripe（決済処理）　・Google（Googleログインを利用する場合）　・Vercel（ホスティング）',
      '上記のほか、法令に基づく場合を除き、本人の同意なく第三者に個人情報を提供しません。',
    ],
  },
  {
    title: '4. 選手情報の取り扱いについて',
    body: [
      '選手名・背番号等は利用者（チーム関係者）の責任で登録してください。未成年の選手の情報を登録する場合は、保護者等の同意を得たうえで登録してください。',
      '共有リンクを発行すると、リンクを知る人は試合データ（選手名・スタッツを含む）を閲覧できます。共有範囲は利用者ご自身で管理してください。',
    ],
  },
  {
    title: '5. Cookie等について',
    body: [
      '本サービスは、ログイン状態の維持のためにCookieおよびブラウザのローカルストレージを使用します。これらを無効にした場合、本サービスの一部または全部が利用できなくなることがあります。',
    ],
  },
  {
    title: '6. 安全管理',
    body: [
      '運営者は、取得した情報への不正アクセス・漏えい・滅失を防止するため、通信の暗号化やアクセス制御等の合理的な安全管理措置を講じます。',
    ],
  },
  {
    title: '7. 開示・訂正・削除の請求',
    body: [
      '利用者は、自己の個人情報の開示・訂正・利用停止・削除を請求できます。下記の窓口までご連絡ください。アカウントおよび登録データの削除をご希望の場合も同様です。',
    ],
  },
  {
    title: '8. お問い合わせ窓口',
    body: [
      // TODO: 有料プラン開始前に事業者氏名（妻名義）とサポート用メールを記入すること
      '事業者・メールアドレス：準備中（有料プラン提供開始までに記載します）',
    ],
  },
  {
    title: '9. 改定',
    body: [
      '本ポリシーの内容は、法令の変更やサービスの改善に応じて変更されることがあります。重要な変更を行う場合は、アプリ内表示等の適切な方法で周知します。',
    ],
  },
]

export default function PrivacyPage() {
  return (
    <main className="min-h-screen px-5 py-10">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-xs" style={{ color: 'var(--muted)' }}>← トップに戻る</Link>
        <h1 className="text-xl font-bold text-white mt-4 mb-2">プライバシーポリシー</h1>
        <p className="text-xs mb-6" style={{ color: 'var(--muted)' }}>制定日：2026年6月11日</p>
        <div className="flex flex-col gap-5">
          {sections.map(s => (
            <section key={s.title}>
              <h2 className="text-sm font-bold text-white mb-1.5">{s.title}</h2>
              {s.body.map((p, i) => (
                <p key={i} className="text-xs leading-relaxed mb-1.5" style={{ color: 'var(--muted)' }}>{p}</p>
              ))}
            </section>
          ))}
        </div>
        <div className="mt-8 flex gap-4 text-xs" style={{ color: 'var(--muted)' }}>
          <Link href="/tokushoho" className="underline">特定商取引法に基づく表記</Link>
          <Link href="/terms" className="underline">利用規約</Link>
        </div>
      </div>
    </main>
  )
}
