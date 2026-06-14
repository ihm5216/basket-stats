-- ============================================================
-- 新規登録が「Database error saving new user」で失敗する問題の修正
--
-- 原因: 新規ユーザー作成時に走るトリガー handle_new_user() の中の
--       「teams へのチーム自動作成」が失敗し、ユーザー作成ごと
--       巻き込んで失敗していた。
-- 対策: ①share_token に必ずデフォルトを設定
--       ②チーム作成が失敗してもユーザー作成は成功させる（例外を握りつぶす）
--       ③アプリ側でも未作成ならチームを作る保険を入れる（別途デプロイ済み）
--
-- 実行方法: Supabase ダッシュボード → SQL Editor に貼り付けて Run
-- （実行前にChromeの自動翻訳をオフにしておくこと）
-- ============================================================

-- 1. share_token に必ずデフォルト値を設定（NULLで弾かれるのを防ぐ）
ALTER TABLE teams ALTER COLUMN share_token SET DEFAULT gen_random_uuid()::text;

-- 2. 既存でshare_tokenがNULLの行があれば埋める
UPDATE teams SET share_token = gen_random_uuid()::text WHERE share_token IS NULL;

-- 3. トリガー関数を堅牢化：チーム作成に失敗してもユーザー作成は止めない
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'team_name' IS NOT NULL AND NEW.raw_user_meta_data->>'team_name' != '' THEN
    BEGIN
      INSERT INTO teams (user_id, name)
      VALUES (NEW.id, NEW.raw_user_meta_data->>'team_name');
    EXCEPTION WHEN OTHERS THEN
      -- チーム作成が失敗してもユーザー作成自体は成功させる（アプリ側で後から作成）
      RAISE WARNING 'handle_new_user: team insert failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
