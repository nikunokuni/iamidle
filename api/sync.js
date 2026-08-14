/* ============================================================
   同期の入口（Vercel の Function）
   仕様は SPEC.md「追加仕様：端末をまたいで使う（2026-08-14 決定）」

   ▼ ここは「預かるだけ」の場所。中身は読めないし、読む必要もない。
     端末が暗号化して送ってきたものを、そのまま置いて、そのまま返す。
     突き合わせに要るのは at（触った時刻）の大小だけ

   ▼ このファイルは GitHub Pages からも読める（公開されている）。
     鍵になるものを書かないこと。全部 Vercel の環境変数から読む

   要る環境変数
     SUPABASE_URL                Supabase の Project URL
     SUPABASE_SERVICE_ROLE_KEY   service_role キー（anon ではない）
     SYNC_USERS                  "niku:<入口用の値>,Haru:<入口用の値>"
     ALLOW_ORIGIN                https://nikunokuni.github.io
============================================================ */
"use strict";

const SUPA   = process.env.SUPABASE_URL || "";
const SKEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const USERS  = process.env.SYNC_USERS || "";
const ORIGIN = process.env.ALLOW_ORIGIN || "";

const MAX_ITEMS = 800;      // 1回に送れる件数
const MAX_ROWS  = 5000;     // 1回に返す件数

/* "niku:abc,Haru:def" → { niku:"abc", Haru:"def" } */
function userTable(){
  const m = {};
  USERS.split(",").forEach(pair => {
    const i = pair.indexOf(":");
    if(i > 0) m[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  });
  return m;
}
/* ▼ 先頭から順に比べて違ったところで抜けると、返事の速さから
   合言葉を1文字ずつ当てられる。長さを見たあとは、必ず最後まで比べること */
function sameSecret(a, b){
  if(typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for(let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function supaHeaders(){
  return { apikey: SKEY, Authorization: "Bearer " + SKEY, "Content-Type": "application/json" };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ORIGIN || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-sync-user, x-sync-key");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Cache-Control", "no-store");

  if(req.method === "OPTIONS") return res.status(204).end();
  if(req.method !== "POST")    return res.status(405).json({ error: "POST だけです" });
  if(!SUPA || !SKEY)           return res.status(500).json({ error: "環境変数が足りません" });

  /* ---- だれか ---- */
  const name = String(req.headers["x-sync-user"] || "");
  const key  = String(req.headers["x-sync-key"]  || "");
  const want = userTable()[name];
  if(!want || !sameSecret(key, want)){
    return res.status(401).json({ error: "名前か合言葉が違います" });
  }

  /* ---- 受け取り ---- */
  let body = req.body;
  if(typeof body === "string"){ try{ body = JSON.parse(body); }catch(e){ body = null; } }
  if(!body || typeof body !== "object") return res.status(400).json({ error: "中身がありません" });

  const since = Number(body.since) > 0 ? Math.floor(Number(body.since)) : 0;
  const items = Array.isArray(body.items) ? body.items : [];
  if(items.length > MAX_ITEMS) return res.status(413).json({ error: "一度に送りすぎです" });

  const clean = [];
  for(const it of items){
    if(!it || typeof it !== "object") continue;
    if(typeof it.kind !== "string" || typeof it.id !== "string") continue;
    if(!it.kind || !it.id) continue;
    clean.push({
      kind: it.kind.slice(0, 32),
      id:   it.id.slice(0, 128),
      // body は端末が暗号化した文字列。null は「消した」印（墓標）
      body: (typeof it.body === "string") ? it.body : null,
      at:   Number(it.at) > 0 ? Math.floor(Number(it.at)) : 0
    });
  }

  try{
    /* ---- 1. 先に読む ----
       ▼ 読むのを書くより先にする。逆にすると、読みと書きの間に
         もう一方の端末が入れたぶんを、二度と拾えなくなる */
    const q = SUPA + "/rest/v1/sync_items" +
      "?user_id=eq." + encodeURIComponent(name) +
      "&seq=gt." + since +
      "&select=kind,item_id,body,at,seq&order=seq.asc&limit=" + MAX_ROWS;
    const got = await fetch(q, { headers: supaHeaders() });
    if(!got.ok) return res.status(502).json({ error: "読めませんでした", detail: await got.text() });
    const rows = await got.json();

    /* ---- 2. そのあと書く ----
       「あとの方が勝つ」の判断は sync_push の中だけにある。ここでは何も決めない */
    if(clean.length){
      const put = await fetch(SUPA + "/rest/v1/rpc/sync_push", {
        method: "POST",
        headers: supaHeaders(),
        body: JSON.stringify({ p_user: name, p_items: clean })
      });
      if(!put.ok) return res.status(502).json({ error: "書けませんでした", detail: await put.text() });
    }

    /* ▼ 次に「ここから後ろ」を頼むための番号。
       返した行の中の最大までしか進めない。書いたぶんまで進めると、
       上の1と2のあいだに入った行を飛ばしてしまう */
    let cursor = since;
    for(const r of rows) if(r.seq > cursor) cursor = r.seq;

    return res.status(200).json({
      ok: true,
      cursor,
      more: rows.length >= MAX_ROWS,      // まだ続きがある。もう一度呼ぶ
      items: rows.map(r => ({ kind: r.kind, id: r.item_id, body: r.body, at: r.at, seq: r.seq }))
    });
  }catch(e){
    return res.status(500).json({ error: "つながりませんでした", detail: String(e && e.message || e) });
  }
};
