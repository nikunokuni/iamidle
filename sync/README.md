# 同期の置き場（Vercel ＋ Supabase）

仕様は `SPEC.md`「追加仕様：端末をまたいで使う（2026-08-14 決定）」。
ここには**サーバー側のもの**だけを置く。アプリ本体（`index.html` / `style.css` / `app.js`）は
これまでどおり、その3つだけで動く。

| ファイル | 中身 |
|---|---|
| `schema.sql` | Supabase に貼って実行するもの。同期の表と関数、招待コード・登録した人・失敗の回数の表（2026-10-14〜） |
| `key.html` | 合言葉から「入口用の値」を作る道具。**計算はブラウザの中だけ**で、合言葉はどこにも送らない。いまは `SYNC_USERS` の2人用（新しい人はアプリから登録するので使わない） |
| `../api/sync.js` | Vercel の Function。**中身は読めないし、読む必要もない** |

---

## 中身は預かるが、読めない

端末が暗号化してから送る。サーバーに置かれるのは、こうなる。

| 置かれるもの | 中身 | 読めるか |
|---|---|---|
| `user_id` | `niku` / `Haru` | 読める（名札だけ） |
| `kind` | `diary` / `task` / `day` … | 読める（種類だけ） |
| `item_id` | **ハッシュ**（日付もIDも伏せてある） | 読めない |
| `body` | **暗号文**（文字も数字も全部この中） | **読めない** |
| `at` `seq` | 触った時刻・順番 | 読める |

**鍵は端末から出ない。** だから **Supabase を持っている人でも、他の人の中身は読めない。**

> ### 忘れたら終わり
> 合言葉を無くすと、そのデータは**誰にも開けない**。管理者もサーバーも鍵を預かっていない。
> **バックアップ書き出し（設定タブ）を続けること。** 書き出したJSONは暗号化されていないので、
> これが唯一の避難経路になる。

---

## 手順

### 1. Supabase：`schema.sql` を実行する

SQL Editor に丸ごと貼って実行。何度実行してもよい。

### 2. 使う人ごとに「入口用の値」を作る

各自が `key.html` を開いて、**名前**（`niku` / `Haru`）と**自分で決めた合言葉**を入れる。
出てきた64文字を管理者に渡す。**合言葉そのものは渡さない。渡す必要もない。**

- 置き場所： https://nikunokuni.github.io/iamidle/sync/key.html
- この値から合言葉は割り出せない。渡しても中身は読まれない

### 3. Vercel：環境変数を入れる

| 名前 | 中身 |
|---|---|
| `SUPABASE_URL` | Supabase の Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **service_role** キー。**anon ではない。アプリ側へ絶対に出さない** |
| `SYNC_USERS` | `niku:<入口用の値>,Haru:<入口用の値>` |
| `ALLOW_ORIGIN` | `https://nikunokuni.github.io` |

入れたら **Redeploy**（環境変数は再デプロイしないと効かない）。

| `ADMIN_USERS` | 招待コードを出せる人。**入れなければ `niku`**（2026-10-14〜） |

#### 人を増やすとき（2026-10-14〜：招待コード）

**環境変数はもう触らなくてよい。** `niku` がアプリの設定タブ「招待コード」でコードを出して渡すだけ。
新しい人は設定タブ「招待コードで新しく始める」から、自分で名前と合言葉を決めて登録する。
登録した人はテーブル `sync_users` に入る（入口用の値はハッシュにして置く）。

- `niku` と `Haru` は `SYNC_USERS` にいるまま。**消さないこと**（消すと2人が入れなくなる）
- 登録した人を止めたいときは、Supabase で `sync_users` のその行を消す。預けたもの（`sync_items`）は残る。
  同じ名前はもう誰も取れない（預かりものが残っている名前は登録で弾く）
- 間違いが続いて止まったのを今すぐ戻したいときは `truncate sync_fails;`

#### 2026-10-14 の版に上げる順番

1. **先に** Supabase で `schema.sql` をもう一度丸ごと実行する（テーブルが3つ・関数が3つ増える。今のデータはそのまま）
2. そのあと `api/sync.js` を Vercel に出す（main に入れば自動）

逆にすると、新しい `api/sync.js` が無いテーブルを呼んで**同期が全員止まる**。
古い `api/sync.js` のまま `schema.sql` だけ新しくするのは問題ない。

### 4. 通じるか確かめる

```bash
# 空で1回叩く。ok が返れば、鍵も権限も通っている
curl -i -X POST https://iamidle.vercel.app/api/sync \
  -H "content-type: application/json" \
  -H "x-sync-user: niku" \
  -H "x-sync-key: <入口用の値>" \
  -d '{"since":0,"items":[]}'
```

| 返り | 意味 |
|---|---|
| `{"ok":true,"cursor":0,...}` | **通った** |
| `401 名前か合言葉が違います` | `SYNC_USERS` の綴りか、渡した値が違う |
| `500 環境変数が足りません` | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` が未設定。再デプロイを忘れていないか |
| `502 読めませんでした` | `schema.sql` を実行していない、または service_role キーではない |

置いて取れるかも見る。

```bash
# 置く
curl -s -X POST https://iamidle.vercel.app/api/sync \
  -H "content-type: application/json" -H "x-sync-user: niku" -H "x-sync-key: <値>" \
  -d '{"since":0,"items":[{"kind":"check","id":"test","body":"ためし","at":1}]}'

# 取る（さっき置いたものが返ってくる）
curl -s -X POST https://iamidle.vercel.app/api/sync \
  -H "content-type: application/json" -H "x-sync-user: niku" -H "x-sync-key: <値>" \
  -d '{"since":0,"items":[]}'
```

確かめたら、ためしの行は消しておく。

```sql
delete from sync_items where kind = 'check' and item_id = 'test';
```

### 5. GitHub Pages から通じるか（いちばん大事）

アプリを開いた状態で、ブラウザの Console に貼る。

```js
fetch("https://iamidle.vercel.app/api/sync", {
  method: "POST",
  headers: { "content-type":"application/json", "x-sync-user":"niku", "x-sync-key":"<値>" },
  body: JSON.stringify({ since:0, items:[] })
}).then(r => r.json()).then(d => console.log("OK", d)).catch(e => console.log("NG", e.message));
```

`OK {ok:true,...}` が出れば、**アプリ側を書き始められる**。
`NG` なら `ALLOW_ORIGIN` の綴りを疑う（`https://nikunokuni.github.io`。末尾に `/` を付けない）。

---

## 注意

- **Vercel に上げるのは `api/` だけ**（`.vercelignore` で絞ってある）。
  以前はアプリ本体も一緒に並んでいて、`vercel.app` の方でもアプリが開けてしまった。
  `localStorage` は**ホスト名ごと**に別の引き出しなので、そちらで開くと中身が空に見え、
  「書いたものが消えた」と誤解する。**開く入口は次の1つだけ**にすること。
  https://nikunokuni.github.io/iamidle/
- ⚠️ **`.vercelignore` に `api/` を書かないこと。** 書くと Function ごと消えて同期が止まる。
  逆に、アプリ側にファイルを足したときは `.vercelignore` にも足すこと
- `api/sync.js` は GitHub Pages からも**中身が読める**。鍵になるものを書かないこと
  （全部 Vercel の環境変数から読んでいる）
