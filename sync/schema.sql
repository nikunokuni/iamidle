-- ============================================================
-- 自己管理アプリ 同期用のテーブル（2026-08-14）
-- Supabase の SQL Editor に、このファイルを丸ごと貼って実行する。
-- 何度実行しても同じ結果になるように書いてある（作り直しても壊れない）。
--
-- 仕様は SPEC.md「追加仕様：端末をまたいで使う（2026-08-14 決定）」。
--   ・塊ごとではなく1件ごとに突き合わせる
--   ・同じものを同時に触ったら、あとの方が勝つ
--   ・消したことも記録する（墓標）。でないと、消したものが生き返る
-- ============================================================

-- 変更のたびに増える番号。「前に見たところから後ろだけ」を取るために使う
create sequence if not exists sync_seq;

create table if not exists sync_items (
  user_id text   not null,                       -- いまは1人だが、後で困らないように持つ
  kind    text   not null,                       -- 'diary' | 'day' | 'task' | 'routine' ...
  item_id text   not null,                       -- 日付キー / やりたいことのID など
  body    jsonb,                                 -- ▼ null は「消した」印（墓標）。行は消さない
  at      bigint not null default 0,             -- 端末で触った時刻(ms)。勝ち負けはこれだけで決める
  seq     bigint not null default nextval('sync_seq'),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, item_id)
);

-- 「前に見たところから後ろだけ」を引くための索引
create index if not exists sync_items_seq_idx on sync_items (user_id, seq);

-- ▼ 書き込みのたびに seq を進める。
--   これを呼び出し側の責任にすると、いつか必ず付け忘れて「同期したのに来ない」になる。
--   データベース側で必ず進むようにしておく
create or replace function sync_items_touch() returns trigger
language plpgsql as $$
begin
  new.seq := nextval('sync_seq');
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists sync_items_touch_trg on sync_items;
create trigger sync_items_touch_trg
  before insert or update on sync_items
  for each row execute function sync_items_touch();

-- ============================================================
-- 送り込み。あとの方が勝つ、という規則は「ここ1か所」だけに書く
-- ============================================================
-- ▼ 2026-10-14：p_max（1人あたりの行数の上限）を足した。
--   引数が変わると別の関数として増えてしまうので、古い形を先に消す。
--   p_max を渡さない呼び方（古い api/sync.js）も、そのまま通る
drop function if exists sync_push(text, jsonb);
create or replace function sync_push(p_user text, p_items jsonb, p_max int default null)
returns void
language plpgsql as $$
declare it jsonb;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    insert into sync_items (user_id, kind, item_id, body, at)
    values (
      p_user,
      it->>'kind',
      it->>'id',
      case when it->'body' = 'null'::jsonb then null else it->'body' end,
      coalesce((it->>'at')::bigint, 0)
    )
    on conflict (user_id, kind, item_id) do update
      set body = excluded.body,
          at   = excluded.at
      -- ▼ 古いものを書かせない。電波の悪い端末が、あとから古い中身で上書きするのを防ぐ
      where excluded.at >= sync_items.at;
  end loop;
  -- ▼ 上限を超えたら、この回のぶんを丸ごと取り消す（例外で巻き戻る）
  if p_max is not null and (select count(*) from sync_items where user_id = p_user) > p_max then
    raise exception 'sync_quota';
  end if;
end $$;

-- ============================================================
-- 鍵が漏れても、ここは誰にも読めないようにしておく
-- ▼ 鍵を隠すだけでは足りない。anon キーは公開されているものと考えること。
--   service_role（Vercel の環境変数にだけ置く）は下の制限を素通りするので、
--   Function からは読み書きできる
-- ============================================================
alter table sync_items enable row level security;
-- ポリシーは1つも作らない。「1つも無い」ことが「誰も読めない」の意味になる

revoke all on table sync_items from anon, authenticated;
revoke all on function sync_push(text, jsonb, int) from public, anon, authenticated;

-- ============================================================
-- 招待コードと、自分で登録した人（2026-10-14）
-- 仕様は SPEC.md「追加仕様：招待コードで人を増やす」。
--
--   ・niku と Haru はこれまでどおり環境変数 SYNC_USERS にいる。ここには入れない
--   ・新しい人は招待コードを使って、自分で sync_users に入る
--   ・コードもそのまま置かない。ハッシュだけ置く（漏れても使えない）
-- ============================================================
create table if not exists sync_invites (
  id         bigserial primary key,
  code_hash  text not null unique,              -- コードの SHA-256。コードそのものはどこにも残さない
  hint       text not null,                     -- 見分けるための末尾4文字だけ
  label      text not null default '',          -- 誰に渡したかのメモ（発行した人が書く）
  max_uses   int  not null,                     -- 使える回数
  used       int  not null default 0,
  expires_at timestamptz not null,
  revoked    boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists sync_users (
  name       text primary key,                  -- 入れたときの綴りのまま（塩に混ざるので変えられない）
  name_lc    text not null unique,              -- 大文字小文字ちがいの同名を作らせないため
  auth_hash  text not null,                     -- 入口用の値の SHA-256
  invite_id  bigint references sync_invites(id),
  created_at timestamptz not null default now()
);

-- ▼ 登録は1か所で、まとめて決める。
--   「コードを確かめる → 名前が空いているか → 入れる → 回数を減らす」を
--   別々に呼ぶと、同じコードで同時に2人が入れてしまう（for update で順番待ちにする）
create or replace function sync_register(p_code_hash text, p_name text, p_auth_hash text, p_reserved text[])
returns text
language plpgsql as $$
declare inv sync_invites;
begin
  select * into inv from sync_invites where code_hash = p_code_hash for update;
  if not found or inv.revoked then return 'bad_code'; end if;
  if inv.expires_at <= now()   then return 'expired'; end if;
  if inv.used >= inv.max_uses  then return 'used_up'; end if;

  -- 環境変数にいる人の名前・登録ずみの名前・預かりものが残っている名前は使わせない
  -- （最後の1つが無いと、昔いた人の引き出しをそのまま引き継げてしまう）
  if lower(p_name) = any(p_reserved)
     or exists (select 1 from sync_users where name_lc = lower(p_name))
     or exists (select 1 from sync_items where lower(user_id) = lower(p_name)) then
    return 'name_taken';
  end if;

  insert into sync_users (name, name_lc, auth_hash, invite_id)
  values (p_name, lower(p_name), p_auth_hash, inv.id);
  update sync_invites set used = used + 1 where id = inv.id;
  return 'ok';
exception when unique_violation then
  return 'name_taken';
end $$;

-- ============================================================
-- 失敗の回数（総当たりよけ）
--   key は "ip:<伏せたIP>" / "name:<名前>" / "reg:<伏せたIP>"。IP はそのまま置かない
-- ============================================================
create table if not exists sync_fails (
  key   text primary key,
  n     int  not null default 0,
  since timestamptz not null default now()
);

-- いまの回数を見る（窓の外に出たものは 0 と数える）
create or replace function sync_fail_get(p_keys text[], p_window int)
returns jsonb
language sql as $$
  select coalesce(jsonb_object_agg(key, n), '{}'::jsonb)
  from sync_fails
  where key = any(p_keys) and since > now() - make_interval(secs => p_window);
$$;

-- 1回足す。窓の外に出ていたら数え直す
create or replace function sync_fail_add(p_keys text[], p_window int)
returns void
language plpgsql as $$
declare k text;
begin
  foreach k in array p_keys loop
    insert into sync_fails (key, n, since) values (k, 1, now())
    on conflict (key) do update
      set n     = case when sync_fails.since > now() - make_interval(secs => p_window) then sync_fails.n + 1 else 1 end,
          since = case when sync_fails.since > now() - make_interval(secs => p_window) then sync_fails.since else now() end;
  end loop;
  -- 古いものは捨てる（ここで掃除しておけば、別の仕組みが要らない）
  delete from sync_fails where since < now() - interval '1 day';
end $$;

-- ▼ 3つとも、ここまでと同じく誰にも読ませない。service_role（Function）だけが通る
alter table sync_invites enable row level security;
alter table sync_users   enable row level security;
alter table sync_fails   enable row level security;
revoke all on table sync_invites, sync_users, sync_fails from anon, authenticated;
revoke all on sequence sync_invites_id_seq from anon, authenticated;
revoke all on function sync_register(text, text, text, text[]) from public, anon, authenticated;
revoke all on function sync_fail_get(text[], int) from public, anon, authenticated;
revoke all on function sync_fail_add(text[], int) from public, anon, authenticated;
