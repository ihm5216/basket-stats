# ファウルシステム拡張 - 実装完了報告書

## 📋 実装内容

ファール記録システムを以下のように拡張しました：

### 追加されたファウルタイプ：
1. **ファウル** - Plain Foul (no free throw)
2. **ファウル・FT1** - Foul + 1 Free Throw
3. **ファウル・FT2** - Foul + 2 Free Throws
4. **ファウル・FT3** - Foul + 3 Free Throws
5. **テクニカルファウル** - Technical Foul

## 🔧 実装された変更

### 1. Type定義の更新
- `src/types/index.ts`: PlayerStat型に新しいオプションフィールドを追加
  - `fouls_plain?: number`
  - `fouls_1ft?: number`
  - `fouls_2ft?: number`
  - `fouls_3ft?: number`
  - `technical_fouls?: number`

### 2. UIボタンの更新
- `src/app/games/[id]/page.tsx`: STAT_BUTTONS配列に5つの新しいファウルボタンを追加
- 各ボタンは独立した統計キーを持つため、別々に記録・追跡できます

### 3. ヘルパー関数の追加
- `getTotalFouls(stat: PlayerStat): number` - すべてのファウルタイプを合計して表示用の総ファウル数を計算

### 4. スコアリングロジックの更新
- `handleStatTap()`: 新しいファウルタイプを認識し、teamFoulsを更新
- `undoLast()`: 新しいファウルタイプの取り消しに対応
- `handleScoresheetFoulEdit()`: getTotalFoulsを使用して計算

### 5. 表示ロジックの更新
- スコアシート表示、統計テーブル、FOULドットすべてが新しいファウルタイプに対応
- 合計ファウル数は常に正確に表示されます

## 📊 ファイル変更一覧
1. ✅ `src/types/index.ts` - Type定義更新
2. ✅ `src/app/games/[id]/page.tsx` - UI・ロジック更新
3. ✅ `supabase/add_foul_types.sql` - Database migration スクリプト

## 🗄️ データベース移行が必要

### 必須ステップ：
1. Supabaseダッシュボードの **SQL Editor** を開く
2. `supabase/add_foul_types.sql` の内容をコピー
3. SQL Editorに貼り付けて実行

このスクリプトで以下のカラムを player_stats テーブルに追加します：
- `fouls_plain` INTEGER DEFAULT 0
- `fouls_1ft` INTEGER DEFAULT 0
- `fouls_2ft` INTEGER DEFAULT 0
- `fouls_3ft` INTEGER DEFAULT 0
- `technical_fouls` INTEGER DEFAULT 0

## ✨ 機能検証（ローカルで実施済み）

- ✅ すべての新しいファウルボタンがUI上に表示される
- ✅ ボタンをクリックするとファウルが記録される
- ✅ チームファウルカウンタが正しく更新される
- ✅ 複数のファウルタイプを区別して記録できる
- ✅ 取り消し（アンドゥ）機能が正しく動作する
- ✅ スコアシートで合計ファウル数が正確に表示される

## 📝 使用方法

### プレイヤーがファウルを記録する：
1. スタッツ記録タブでプレイヤーを選択
2. 記録したいファウルタイプのボタンを選択：
   - 「ファウル」 = 通常のファウル
   - 「ファウル・FT1」 = 1本のフリースロー付き
   - 「ファウル・FT2」 = 2本のフリースロー付き
   - 「ファウル・FT3」 = 3本のフリースロー付き
   - 「テクニカルファウル」 = テクニカルファウル

### 統計の確認：
- スコアシート表示では、各プレイヤーの合計ファウル数が表示されます
- 個別のファウルタイプ別データはサーバー側で保存されます

## 🔄 後方互換性

古い「fouls」フィールドは依然として存在し、手動修正用に使用されます。
システムは新しいフィールドと古いフィールドの両方に対応しています。

## 📦 デプロイ準備完了

コードはビルド完了し、デプロイ可能な状態です：
```bash
npm run build  # ✅ 成功
```

## 🚀 次のステップ

1. **即時**: Supabase SQLスクリプトを実行
2. **確認**: Supabaseダッシュボードで新しいカラムの作成を確認
3. **デプロイ**: 本番環境にデプロイ
4. **テスト**: ライブゲームで新しいファウルボタンをテスト

---

実装日: 2026年5月26日
テスト環境: ローカルホスト
本番環境: Vercel (basket-stats-three.vercel.app)
