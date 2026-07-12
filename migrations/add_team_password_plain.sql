-- Migration: チーム共有パスワードを「オーナーが常に確認・再共有できる」ようにする。
--
-- 背景: チーム共有パスワードは LINE 等で配る前提の「合言葉」。
--       ハッシュのみだと再読み込み後にオーナーが元の文字列を確認できず、招待文に載せられない。
--       そこで、オーナーだけが読める team_credentials（RLSでオーナー限定）に平文も保存する。
--       ※ 個人アカウントのパスワードではなく、共有・配布前提のチーム合言葉のため許容。
--          照合用の bcrypt ハッシュ(password_hash)は引き続き保持する。
--
-- Supabase SQL Editor で一度だけ実行してください。

ALTER TABLE team_credentials ADD COLUMN IF NOT EXISTS password_plain text;
