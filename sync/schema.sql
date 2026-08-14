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
create or replace function sync_push(p_user text, p_items jsonb)
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
revoke all on function sync_push(text, jsonb) from public, anon, authenticated;
