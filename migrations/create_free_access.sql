-- Migration: free_access テーブル作成
-- オーナー / 友達を「Stripe決済なしで無制限に使える」ように招待するための許可リスト。
-- 友達を増やすときは、このテーブルに email を1行追加するだけ（Table Editor 推奨）。
-- Supabase SQL Editor で一度だけ実行してください。

CREATE TABLE IF NOT EXISTS free_access (
  email      text PRIMARY KEY,           -- 招待するメールアドレス（小文字推奨）
  note       text,                       -- メモ（例: 「自分」「○○くん」）任意
  created_at timestamptz DEFAULT now()
);

-- RLS（行レベルセキュリティ）を有効化
ALTER TABLE free_access ENABLE ROW LEVEL SECURITY;

-- ログイン中のユーザーは「自分のメールが登録されているか」だけ確認できる。
-- （他人のメール一覧は見えない＝大文字小文字を無視して自分の行だけ参照可）
DROP POLICY IF EXISTS "Users can check own free access" ON free_access;
CREATE POLICY "Users can check own free access"
  ON free_access FOR SELECT
  USING (lower(email) = lower(auth.jwt() ->> 'email'));

-- 追加・削除は Supabase 管理画面（service_role）からのみ。一般ユーザーには書き込みを許可しない。

-- ── 初期登録：オーナー本人 ──
INSERT INTO free_access (email, note) VALUES
  ('kaiami.yuki.0224@gmail.com', 'オーナー（自分）')
ON CONFLICT (email) DO NOTHING;
