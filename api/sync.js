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
     ADMIN_USERS                 招待コードを出せる人。無ければ "niku"

   ▼ 人は2か所にいる（2026-10-14〜）
     ・環境変数 SYNC_USERS … niku と Haru。これまでどおり。動かさない
     ・テーブル sync_users … 招待コードで自分で登録した人
     名前は両方を通して1つしか作れない（sync_register が見張る）

   ▼ 中身の op で何をするかを分ける。無ければ同期（これまでの呼び方のまま）
     register       … 招待コードで登録。名前と合言葉はまだ通っていないので、入口の確認より前で受ける
     invite.create  … コードを出す（ADMIN_USERS だけ）
     invite.list    … 出したコードの一覧（ADMIN_USERS だけ）
     invite.revoke  … コードを取り消す（ADMIN_USERS だけ）
============================================================ */
"use strict";

const crypto = require("crypto");

const SUPA   = process.env.SUPABASE_URL || "";
const SKEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const USERS  = process.env.SYNC_USERS || "";
const ORIGIN = process.env.ALLOW_ORIGIN || "";
const ADMINS = (process.env.ADMIN_USERS || "niku").split(",").map(s => s.trim()).filter(Boolean);

const MAX_ITEMS = 800;      // 1回に送れる件数
const MAX_ROWS  = 5000;     // 1回に返す件数
/* ▼ 登録した人1人が預けられる行数。日記を毎日書いても何十年ぶんある。
   環境変数の2人（niku / Haru）には掛けない。いまの使い方を止めないため */
const MAX_USER_ROWS = 20000;

/* ▼ 総当たりよけ。数えるのは「失敗」だけ（登録は成功も数える）。止まっても窓が過ぎれば戻る */
const FAIL_WINDOW  = 15 * 60;   // 秒
const FAIL_PER_IP  = 30;
const FAIL_PER_NAME = 20;
const REG_WINDOW   = 60 * 60;
const REG_PER_IP   = 10;

/* 名前に使える文字。ヘッダーで送るので英数字だけ（日本語はヘッダーに載らない） */
const NAME_RE = /^[A-Za-z0-9_-]{2,20}$/;
/* 招待コードの文字。0/O・1/I/L のような見間違えるものは入れない */
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

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
const sha256 = s => crypto.createHash("sha256").update(String(s)).digest("hex");

/* Supabase の関数を呼ぶ。失敗したら投げる */
async function rpc(fn, args){
  const r = await fetch(SUPA + "/rest/v1/rpc/" + fn, { method: "POST", headers: supaHeaders(), body: JSON.stringify(args) });
  const text = await r.text();
  if(!r.ok){ const e = new Error(text); e.status = r.status; throw e; }
  return text ? JSON.parse(text) : null;
}
/* テーブルを読む（PostgREST の書き方そのまま） */
async function select(path){
  const r = await fetch(SUPA + "/rest/v1/" + path, { headers: supaHeaders() });
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

/* 相手のIP。そのまま置かず、伏せてから数える */
function ipKey(req){
  const raw = String(req.headers["x-real-ip"] || String(req.headers["x-forwarded-for"] || "").split(",")[0] || "").trim();
  return sha256("ip:" + raw).slice(0, 24);
}
/* 打ち間違いを吸収する。小文字→大文字、ハイフン・空白は抜く */
const normCode = c => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
function newCode(){
  const b = crypto.randomBytes(12);
  let s = "";
  for(let i = 0; i < 12; i++) s += CODE_CHARS[b[i] % CODE_CHARS.length];
  return s.slice(0,4) + "-" + s.slice(4,8) + "-" + s.slice(8);     // 12文字 ≒ 59ビット
}

/* ▼ この人で合っているか。環境変数の人を先に見る（いまの2人は DB に何があっても変わらない） */
async function whoIs(name, key){
  const want = userTable()[name];
  if(want !== undefined) return sameSecret(key, want) ? { name, env: true } : null;
  if(!NAME_RE.test(name) || !/^[0-9a-f]{64}$/.test(key)) return null;
  const rows = await select("sync_users?name=eq." + encodeURIComponent(name) + "&select=auth_hash");
  if(!rows.length) return null;
  return sameSecret(sha256(key), rows[0].auth_hash) ? { name, env: false } : null;
}

/* ---- 招待コードで登録 ---- */
async function register(req, res, body){
  const ip = "reg:" + ipKey(req);
  const seen = await rpc("sync_fail_get", { p_keys: [ip], p_window: REG_WINDOW });
  if((seen[ip] || 0) >= REG_PER_IP) return res.status(429).json({ error: "試しすぎです。1時間ほど待ってください" });
  await rpc("sync_fail_add", { p_keys: [ip], p_window: REG_WINDOW });

  const code = normCode(body.code);
  const name = String(body.name || "");
  const auth = String(body.auth || "");
  if(code.length !== 12)       return res.status(400).json({ error: "招待コードの形が違います" });
  if(!NAME_RE.test(name))      return res.status(400).json({ error: "名前は英数字と - _ で2〜20文字にしてください" });
  if(!/^[0-9a-f]{64}$/.test(auth)) return res.status(400).json({ error: "入口用の値が作れていません" });

  const reserved = Object.keys(userTable()).map(n => n.toLowerCase());
  const got = await rpc("sync_register", {
    p_code_hash: sha256(code), p_name: name, p_auth_hash: sha256(auth), p_reserved: reserved
  });
  const msg = {
    bad_code:   [403, "招待コードが違うか、取り消されています"],
    expired:    [403, "招待コードの期限が切れています"],
    used_up:    [403, "招待コードはもう使い切られています"],
    name_taken: [409, "その名前はもう使われています。別の名前にしてください"]
  }[got];
  if(msg) return res.status(msg[0]).json({ error: msg[1] });
  if(got !== "ok") return res.status(500).json({ error: "登録できませんでした" });
  return res.status(200).json({ ok: true, name });
}

/* ---- 招待コードを出す・見る・取り消す（ADMIN_USERS だけ） ---- */
async function invites(res, op, body){
  if(op === "invite.create"){
    const uses = Math.floor(Number(body.uses));
    const days = Math.floor(Number(body.days));
    if(!(uses >= 1 && uses <= 100)) return res.status(400).json({ error: "回数は1〜100にしてください" });
    if(!(days >= 1 && days <= 90))  return res.status(400).json({ error: "期限は1〜90日にしてください" });
    const label = String(body.label || "").slice(0, 40);
    const code = newCode();
    const r = await fetch(SUPA + "/rest/v1/sync_invites", {
      method: "POST",
      headers: Object.assign(supaHeaders(), { Prefer: "return=minimal" }),
      body: JSON.stringify({
        code_hash: sha256(normCode(code)), hint: normCode(code).slice(-4), label,
        max_uses: uses, expires_at: new Date(Date.now() + days * 86400000).toISOString()
      })
    });
    if(!r.ok) return res.status(502).json({ error: "出せませんでした", detail: await r.text() });
    // ▼ コードそのものを返すのは、この1回だけ。サーバーにはハッシュしか残らない
    return res.status(200).json({ ok: true, code });
  }
  if(op === "invite.list"){
    const list = await select("sync_invites?select=id,hint,label,max_uses,used,expires_at,revoked,created_at&order=id.desc&limit=100");
    const users = await select("sync_users?select=name,invite_id&invite_id=not.is.null");
    const by = {};
    users.forEach(u => { (by[u.invite_id] = by[u.invite_id] || []).push(u.name); });
    return res.status(200).json({ ok: true, invites: list.map(x => Object.assign(x, { names: by[x.id] || [] })) });
  }
  if(op === "invite.revoke"){
    const id = Math.floor(Number(body.id));
    if(!(id > 0)) return res.status(400).json({ error: "どのコードか分かりません" });
    const r = await fetch(SUPA + "/rest/v1/sync_invites?id=eq." + id, {
      method: "PATCH",
      headers: Object.assign(supaHeaders(), { Prefer: "return=minimal" }),
      body: JSON.stringify({ revoked: true })
    });
    if(!r.ok) return res.status(502).json({ error: "取り消せませんでした", detail: await r.text() });
    return res.status(200).json({ ok: true });
  }
  return res.status(400).json({ error: "知らない頼みごとです" });
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

  /* ---- 受け取り ---- */
  let body = req.body;
  if(typeof body === "string"){ try{ body = JSON.parse(body); }catch(e){ body = null; } }
  if(!body || typeof body !== "object") return res.status(400).json({ error: "中身がありません" });
  const op = typeof body.op === "string" ? body.op : "sync";

  /* ---- 登録は、名前と合言葉がまだ無いので、ここで受ける ---- */
  if(op === "register"){
    try{ return await register(req, res, body); }
    catch(e){ return res.status(502).json({ error: "登録できませんでした", detail: String(e && e.message || e) }); }
  }

  /* ---- だれか ----
     ▼ 確かめる前に、失敗の回数を見る。確かめたあとで見ても、
       当たりを引いたときに通してしまうので意味がない */
  const name = String(req.headers["x-sync-user"] || "");
  const key  = String(req.headers["x-sync-key"]  || "");
  const fk   = ["ip:" + ipKey(req), "name:" + name.toLowerCase().slice(0, 40)];
  let who = null;
  try{
    const seen = await rpc("sync_fail_get", { p_keys: fk, p_window: FAIL_WINDOW });
    /* ▼ 名前ごとの方は「その場所からも間違えている」ときだけ止める。
       でないと、他人が niku の名前で20回間違えるだけで、本人が締め出される。
       一度も間違えていない端末は通す（総当たりする側は、場所を変えるたびに1回しか試せない） */
    const ipN = seen[fk[0]] || 0, nameN = seen[fk[1]] || 0;
    if(ipN >= FAIL_PER_IP || (ipN > 0 && nameN >= FAIL_PER_NAME)){
      return res.status(429).json({ error: "間違いが続いたので止めています。15分ほど待ってください" });
    }
    who = await whoIs(name, key);
    if(!who) await rpc("sync_fail_add", { p_keys: fk, p_window: FAIL_WINDOW });
  }catch(e){
    return res.status(502).json({ error: "確かめられませんでした", detail: String(e && e.message || e) });
  }
  if(!who) return res.status(401).json({ error: "名前か合言葉が違います" });

  if(op.startsWith("invite.")){
    if(!ADMINS.includes(who.name)) return res.status(403).json({ error: "招待コードを扱えるのは管理者だけです" });
    try{ return await invites(res, op, body); }
    catch(e){ return res.status(502).json({ error: "つながりませんでした", detail: String(e && e.message || e) }); }
  }
  if(op !== "sync") return res.status(400).json({ error: "知らない頼みごとです" });

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
        body: JSON.stringify({ p_user: name, p_items: clean, p_max: who.env ? null : MAX_USER_ROWS })
      });
      if(!put.ok){
        const detail = await put.text();
        if(/sync_quota/.test(detail)) return res.status(413).json({ error: "預けられる量の上限に達しました" });
        return res.status(502).json({ error: "書けませんでした", detail });
      }
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
