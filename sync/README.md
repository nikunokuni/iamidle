# 同期の置き場（Vercel ＋ Supabase）

仕様は `SPEC.md`「追加仕様：端末をまたいで使う（2026-08-14 決定）」。
ここには**サーバー側のもの**だけを置く。アプリ本体（`index.html` / `style.css` / `app.js`）は
これまでどおり、この3つだけで動く。

| ファイル | 中身 |
|---|---|
| `schema.sql` | Supabase に1回貼って実行するもの。テーブル1つ・関数1つ |

## 手順

### 1. Supabase

`schema.sql` を SQL Editor に丸ごと貼って実行する。何度実行してもよい。

作られるもの：

- `sync_items` … 1件＝1行。`(user_id, kind, item_id)` が主キー
- `sync_push(user, items)` … 送り込み。**「あとの方が勝つ」規則はこの関数の中だけにある**

> **`body` が `null` の行は「消した」印**（墓標）。行そのものは消さない。
> 消してしまうと、まだ知らない端末が次に送ってきたときに**復活する**。

### 2. Vercel（環境変数）

| 名前 | 中身 |
|---|---|
| `SUPABASE_URL` | Supabase の Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **service_role** キー。**anon キーではない。絶対にアプリ側へ出さない** |
| `APP_KEY` | 合言葉。端末で初回だけ入力するもの |
| `ALLOW_ORIGIN` | `https://nikunokuni.github.io` |

> **このリポジトリを Vercel に入れたので、Vercel 側にもアプリ本体が並ぶ。**
> ふだん開くのは **GitHub Pages のURL のまま**にして、Vercel は API 専用として扱うこと。
> 両方のURLで開くと、**localStorage はURLごとに別の引き出し**なので、
> 「書いたものが消えた」と見える。
