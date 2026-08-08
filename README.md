[Uploading index.html…]()
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0f1115">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>自己管理</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧭</text></svg>">
<style>
  :root{
    --bg:#0f1115;
    --bg2:#161a21;
    --card:#1b202a;
    --card2:#232936;
    --line:#2c3342;
    --fg:#e8ecf3;
    --fg-dim:#9aa5b8;
    --fg-faint:#6b7688;
    --accent:#5b9cff;
    --accent2:#ffd166;
    --ok:#4ecb8f;
    --warn:#ffa552;
    --danger:#ff6b6b;
    --radius:14px;
  }
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html,body{margin:0;padding:0}
  body{
    background:var(--bg);
    color:var(--fg);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Hiragino Kaku Gothic ProN","Yu Gothic UI","Meiryo",sans-serif;
    font-size:16px;line-height:1.6;
    padding-bottom:100px;
    -webkit-font-smoothing:antialiased;
  }
  .wrap{max-width:680px;margin:0 auto;padding:0 16px}

  /* ---------- header ---------- */
  header{padding:22px 0 6px}
  .date{color:var(--fg-faint);font-size:13px;letter-spacing:.08em}
  .greet{font-size:22px;font-weight:700;margin-top:2px}
  .clock{float:right;font-size:28px;font-weight:300;letter-spacing:.02em;color:var(--fg-dim);font-variant-numeric:tabular-nums}

  /* ---------- philosophy banner ---------- */
  .philo-bar{
    margin:14px 0 18px;padding:16px 18px;
    background:linear-gradient(135deg,#1d2431,#171b24);
    border:1px solid var(--line);border-left:3px solid var(--accent2);
    border-radius:var(--radius);cursor:pointer;position:relative;
  }
  .philo-bar .label{font-size:11px;letter-spacing:.14em;color:var(--accent2);opacity:.8}
  .philo-bar .text{font-size:17px;line-height:1.7;margin-top:6px;white-space:pre-wrap}
  .philo-bar .hint{font-size:11px;color:var(--fg-faint);margin-top:8px}

  /* ---------- tabs ---------- */
  nav{
    position:fixed;left:0;right:0;bottom:0;z-index:50;
    background:rgba(15,17,21,.92);backdrop-filter:blur(12px);
    border-top:1px solid var(--line);
    padding-bottom:env(safe-area-inset-bottom);
  }
  nav .inner{max-width:680px;margin:0 auto;display:flex}
  nav button{
    flex:1;background:none;border:none;color:var(--fg-faint);
    padding:10px 0 12px;font-size:11px;font-family:inherit;cursor:pointer;
    display:flex;flex-direction:column;align-items:center;gap:3px;
  }
  nav button .ic{font-size:20px;line-height:1}
  nav button.on{color:var(--accent)}

  section{display:none;animation:fade .18s ease}
  section.on{display:block}
  @keyframes fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}

  h2{font-size:13px;letter-spacing:.12em;color:var(--fg-faint);font-weight:600;margin:26px 0 10px}
  h2:first-child{margin-top:6px}

  /* ---------- now card ---------- */
  .now{
    background:linear-gradient(135deg,#213050,#1a2030);
    border:1px solid #33456b;border-radius:18px;padding:20px;margin-bottom:6px;
  }
  .now .label{font-size:11px;letter-spacing:.16em;color:var(--accent)}
  .now .txt{font-size:24px;font-weight:700;line-height:1.45;margin:8px 0 6px;white-space:pre-wrap}
  .now .sub{font-size:13px;color:var(--fg-dim);margin-bottom:16px}
  .now .empty{font-size:17px;font-weight:500;color:var(--fg-dim);margin:10px 0 4px}
  .now button{
    background:var(--accent);color:#0b1017;border:none;border-radius:10px;
    padding:11px 20px;font-size:15px;font-weight:700;font-family:inherit;cursor:pointer;
  }
  .now button:active{opacity:.75}

  /* ---------- list items ---------- */
  .item{
    display:flex;align-items:center;gap:12px;
    background:var(--card);border:1px solid var(--line);border-radius:var(--radius);
    padding:13px 14px;margin-bottom:8px;
  }
  .item .grow{flex:1;min-width:0}
  .item .t{font-size:16px;word-break:break-word}
  .item .s{font-size:12px;color:var(--fg-faint);word-break:break-all;margin-top:2px}
  .item.done{opacity:.45}
  .item.done .t{text-decoration:line-through}
  .item.met{opacity:.55}

  .check{
    width:28px;height:28px;flex:none;border-radius:50%;
    border:2px solid var(--fg-faint);background:none;cursor:pointer;
    display:flex;align-items:center;justify-content:center;color:transparent;
    font-size:13px;font-weight:700;font-family:inherit;
  }
  .check.on{background:var(--ok);border-color:var(--ok);color:#0b1017}
  .check.part{border-color:var(--accent);color:var(--accent)}

  .iconbtn{
    background:none;border:none;color:var(--fg-faint);font-size:16px;
    padding:6px 8px;cursor:pointer;font-family:inherit;flex:none;border-radius:8px;
  }
  .iconbtn:active{background:var(--card2)}
  .iconbtn.del:active{color:var(--danger)}
  .iconbtn.faint{opacity:.28}

  /* ---------- progress ---------- */
  .prog{display:flex;align-items:center;gap:8px;margin-top:6px}
  .bar{flex:1;height:5px;background:var(--card2);border-radius:99px;overflow:hidden;min-width:40px}
  .bar i{display:block;height:100%;background:var(--accent);border-radius:99px;transition:width .25s}
  .bar i.met{background:var(--ok)}
  .bar i.late{background:var(--warn)}
  .pmeta{font-size:11px;color:var(--fg-faint);flex:none;font-variant-numeric:tabular-nums}
  .pmeta b{color:var(--fg-dim);font-weight:700}
  .tag{font-size:11px;padding:1px 7px;border-radius:99px;flex:none;font-weight:600}
  .tag.late{background:rgba(255,165,82,.16);color:var(--warn)}
  .tag.ok{background:rgba(78,203,143,.14);color:var(--ok)}

  /* ---------- forms ---------- */
  .form{background:var(--bg2);border:1px solid var(--line);border-radius:var(--radius);padding:12px;margin-bottom:14px}
  .row{display:flex;gap:8px;align-items:center}
  input,textarea,select{
    width:100%;background:var(--card);border:1px solid var(--line);color:var(--fg);
    border-radius:10px;padding:11px 12px;font-size:16px;font-family:inherit;outline:none;
  }
  input:focus,textarea:focus,select:focus{border-color:var(--accent)}
  textarea{resize:vertical;min-height:80px;line-height:1.6}
  input::placeholder,textarea::placeholder{color:var(--fg-faint)}
  input[type=number]{width:64px;flex:none;text-align:center;padding:9px 4px}
  .btn{
    background:var(--accent);color:#0b1017;border:none;border-radius:10px;
    padding:11px 18px;font-size:15px;font-weight:700;font-family:inherit;cursor:pointer;flex:none;
  }
  .btn.ghost{background:none;border:1px solid var(--line);color:var(--fg-dim);font-weight:500}
  .btn:active{opacity:.75}
  .mt8{margin-top:8px}
  .mt10{margin-top:10px}

  .chips{display:flex;gap:6px;flex-wrap:wrap}
  .chip{
    background:var(--card);border:1px solid var(--line);color:var(--fg-dim);
    border-radius:99px;padding:7px 14px;font-size:14px;font-family:inherit;cursor:pointer;
  }
  .chip.on{background:var(--accent);border-color:var(--accent);color:#0b1017;font-weight:700}
  .freqline{display:flex;gap:8px;align-items:center;color:var(--fg-dim);font-size:14px;flex-wrap:wrap}

  .empty-note{color:var(--fg-faint);font-size:14px;padding:14px 2px}

  /* ---------- ホーム（今日やること） ---------- */
  .today-head{
    display:flex;align-items:baseline;justify-content:space-between;
    margin:24px 0 10px;
  }
  .today-head .ttl{font-size:15px;font-weight:700}
  .today-head .cnt{font-size:12px;color:var(--fg-faint)}
  .tag.freq{background:var(--card2);color:var(--fg-faint)}
  .tag.now{background:rgba(91,156,255,.18);color:var(--accent)}

  /* 朝 / 夜 の見出し */
  .slot-head{
    display:flex;align-items:center;gap:6px;
    font-size:12px;color:var(--fg-faint);letter-spacing:.1em;
    margin:16px 0 8px;padding-left:2px;
  }
  .slot-head.now{color:var(--accent2)}
  .slot-head.now::after{
    content:"いまここ";font-size:10px;letter-spacing:0;
    background:rgba(255,209,102,.14);color:var(--accent2);
    padding:1px 7px;border-radius:99px;
  }
  .item.current{border-color:var(--accent);background:#1d2534}

  /* ---------- タスクに紐づいたリンク ---------- */
  .tasklink{
    color:inherit;text-decoration:none;
    display:inline-flex;align-items:baseline;gap:6px;
  }
  .tasklink .ico{font-size:13px;color:var(--accent);flex:none}
  .tasklink:active{opacity:.6}
  .now .txt a{color:inherit;text-decoration:none}
  .now .btnrow{display:flex;gap:8px;align-items:center}
  .now .open{
    background:none;border:1px solid rgba(255,255,255,.22);color:var(--fg);
    font-weight:600;text-decoration:none;display:inline-flex;align-items:center;
    padding:11px 18px;border-radius:10px;font-size:15px;
  }
  .now .open:active{opacity:.7}
  .now .skip{
    background:none;border:none;color:var(--fg-dim);
    font-size:13px;padding:11px 4px;text-decoration:underline;
    font-family:inherit;cursor:pointer;font-weight:400;
  }
  .item.skipped{opacity:.5}
  .item.skipped .t{color:var(--fg-dim)}
  .allclear{
    text-align:center;color:var(--fg-faint);font-size:15px;
    padding:34px 10px;line-height:2;
  }
  .allclear .big{font-size:34px;display:block;margin-bottom:6px;opacity:.9}
  .fold{
    width:100%;background:none;border:none;color:var(--fg-faint);
    font-size:13px;font-family:inherit;text-align:left;cursor:pointer;
    padding:14px 2px 8px;
  }
  .fold:active{color:var(--fg-dim)}
  .addtoggle{
    background:none;border:1px dashed var(--line);color:var(--fg-dim);
    border-radius:var(--radius);padding:12px;width:100%;
    font-size:14px;font-family:inherit;cursor:pointer;margin-bottom:14px;
  }
  .addtoggle:active{background:var(--card)}

  .philo-item{
    background:var(--card);border:1px solid var(--line);border-left:3px solid var(--accent2);
    border-radius:var(--radius);padding:14px;margin-bottom:8px;display:flex;gap:10px;align-items:flex-start;
  }
  .philo-item .t{flex:1;white-space:pre-wrap;font-size:16px;line-height:1.7}

  .kv{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line);font-size:14px;color:var(--fg-dim)}
  .toast{
    position:fixed;left:50%;transform:translateX(-50%);bottom:90px;z-index:99;
    background:var(--card2);border:1px solid var(--line);color:var(--fg);
    padding:10px 18px;border-radius:999px;font-size:14px;opacity:0;pointer-events:none;transition:opacity .2s;
  }
  .toast.on{opacity:1}
  .toast .undo{
    background:none;border:none;color:var(--accent);font-weight:700;
    font-size:14px;font-family:inherit;cursor:pointer;padding:0 0 0 14px;
    pointer-events:auto;
  }
  .toast.on{pointer-events:auto}

  /* ---------- アプリ内ダイアログ ---------- */
  .modal{
    position:fixed;inset:0;z-index:200;display:none;
    background:rgba(0,0,0,.6);
    align-items:center;justify-content:center;padding:20px;
  }
  .modal.on{display:flex}
  .modal .sheet{
    background:var(--bg2);border:1px solid var(--line);border-radius:18px;
    padding:20px;width:100%;max-width:380px;
    box-shadow:0 20px 60px rgba(0,0,0,.5);
  }
  .modal .mtitle{font-size:17px;font-weight:700;line-height:1.5;word-break:break-word}
  .modal .mdesc{font-size:13px;color:var(--fg-faint);margin-top:6px;word-break:break-all}
  .modal input{margin-top:14px}
  .modal .mbtns{display:flex;gap:8px;justify-content:flex-end;margin-top:18px}
  .modal .mbtns .btn{flex:1}
  .modal .btn.danger{background:var(--danger);color:#fff}
</style>
</head>
<body>

<div class="wrap">
  <header>
    <div class="clock" id="clock">--:--</div>
    <div class="date" id="date"></div>
    <div class="greet" id="greet"></div>
  </header>

  <div class="philo-bar" id="philoBar">
    <div class="label">今日の指針</div>
    <div class="text" id="philoText">哲学タブから、大事にしたい言葉を登録してください。</div>
    <div class="hint">タップで次の言葉へ</div>
  </div>

  <!-- ============ ホーム（今日やることだけ） ============ -->
  <section id="sec-now" class="on">
    <div class="now" id="nowCard"></div>
    <div id="todayList"></div>
    <div id="skippedList"></div>
    <div id="doneToday"></div>
  </section>

  <!-- ============ タスク管理 ============ -->
  <section id="sec-tasks">
    <h2>タスクを追加</h2>
    <div class="form">
      <input id="taskInput" placeholder="やることを入力" autocomplete="off">
      <input class="mt8" id="taskUrl" placeholder="リンク（任意） https://..." autocomplete="off" inputmode="url" list="taskUrlList">
      <datalist id="taskUrlList"></datalist>
      <div class="chips mt10" id="whenChips">
        <button class="chip on" data-when="any">いつでも</button>
        <button class="chip" data-when="morning">🌅 朝</button>
        <button class="chip" data-when="night">🌙 夜</button>
      </div>
      <div class="chips mt10" id="freqChips">
        <button class="chip on" data-unit="once">単発</button>
        <button class="chip" data-unit="day">毎日</button>
        <button class="chip" data-unit="week">週に</button>
        <button class="chip" data-unit="month">月に</button>
        <button class="chip" data-unit="days">N日に</button>
      </div>
      <div class="freqline mt10" id="freqLine" style="display:none">
        <span id="freqPre"></span>
        <input type="number" id="freqN" min="1" max="365" value="3" style="display:none">
        <span id="freqMid" style="display:none">日に</span>
        <input type="number" id="freqCount" min="1" max="99" value="1">
        <span>回</span>
      </div>
      <div class="row mt10" style="justify-content:flex-end">
        <button class="btn" id="taskAdd">追加</button>
      </div>
    </div>

    <div id="taskList"></div>
  </section>


  <!-- ============ 哲学 ============ -->
  <section id="sec-philo">
    <h2>人生哲学</h2>
    <button class="addtoggle" data-form="philoForm">＋ 言葉を追加</button>
    <div class="form" id="philoForm" style="display:none">
      <textarea id="philoInput" placeholder="大事にしたい考え方を書く&#10;例: 迷ったら、面倒な方を選ぶ"></textarea>
      <div class="row mt8" style="justify-content:flex-end">
        <button class="btn" id="philoAdd">追加</button>
      </div>
    </div>
    <div id="philoList"></div>
  </section>

  <!-- ============ 設定 ============ -->
  <section id="sec-set">
    <h2>データ</h2>
    <div id="stats"></div>
    <div class="row mt8" style="margin-top:16px">
      <button class="btn ghost" id="btnExport">バックアップ書き出し</button>
      <button class="btn ghost" id="btnImport">読み込み</button>
    </div>
    <input type="file" id="fileInput" accept="application/json" style="display:none">
    <h2>リセット</h2>
    <button class="btn ghost" id="btnClearDone">完了した単発タスクを消す</button>
    <div class="empty-note">
      データはこの端末のブラウザ内にのみ保存されます。<br>
      機種変更やブラウザのデータ削除に備えて、ときどき書き出しておくと安全です。
    </div>
  </section>
</div>

<nav>
  <div class="inner">
    <button data-tab="now" class="on"><span class="ic">🎯</span>今日</button>
    <button data-tab="tasks"><span class="ic">📋</span>タスク</button>
    <button data-tab="philo"><span class="ic">🧭</span>哲学</button>
    <button data-tab="set"><span class="ic">⚙️</span>設定</button>
  </div>
</nav>

<div class="toast" id="toast"></div>

<!-- アプリ内ダイアログ（confirm/prompt の代わり） -->
<div class="modal" id="modal">
  <div class="sheet">
    <div class="mtitle" id="mTitle"></div>
    <div class="mdesc" id="mDesc"></div>
    <input id="mInput" style="display:none" autocomplete="off">
    <div class="mbtns">
      <button class="btn ghost" id="mCancel">やめる</button>
      <button class="btn" id="mOk">OK</button>
    </div>
  </div>
</div>

<script>
"use strict";

/* ================= storage ================= */
const KEY = "jiko-kanri-v1";
const DEFAULTS = { v: 2, tasks: [], links: [], philos: [], philoIdx: 0, lastOpen: "", foldDone: false, foldSkip: false };

function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return structuredClone(DEFAULTS);
    return migrate(Object.assign(structuredClone(DEFAULTS), JSON.parse(raw)));
  }catch(e){
    return structuredClone(DEFAULTS);
  }
}
/* v1（単発タスク＋習慣）を v2（頻度つきタスク）へ */
function migrate(d){
  if(d.v >= 2 && !d.habits) return d;
  d.tasks = (d.tasks || []).map(t => t.freq ? t : ({
    id: t.id, text: t.text, freq: { unit: "once" },
    done: !!t.done, log: [], createdAt: t.createdAt || Date.now()
  }));
  (d.habits || []).forEach(h => {
    const log = Object.keys(h.hist || {}).map(k => {
      const [y,m,dd] = k.split("-").map(Number);
      return new Date(y, m-1, dd, 12).getTime();
    });
    d.tasks.push({ id: h.id, text: h.name, freq: { unit:"day", count:1 }, done:false, log, createdAt: Date.now() });
  });
  delete d.habits;
  d.v = 2;
  return d;
}
function save(){
  try{ localStorage.setItem(KEY, JSON.stringify(S)); }
  catch(e){ toast("保存に失敗しました"); }
}
let S = load();

/* ================= helpers ================= */
const $ = id => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const DAY = 86400000;

function todayKey(d){
  d = d || new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }

let toastTimer;
/* undo を渡すと「取り消す」ボタン付きで出る */
function toast(msg, undo){
  const t = $("toast");
  t.innerHTML = "";
  t.appendChild(document.createTextNode(msg));
  if(undo){
    const b = document.createElement("button");
    b.className = "undo";
    b.textContent = "取り消す";
    b.onclick = ()=>{ t.classList.remove("on"); undo(); };
    t.appendChild(b);
  }
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove("on"), undo ? 5000 : 1800);
}

/* ================= アプリ内ダイアログ =================
   この画面では window.confirm / prompt が無効化されることがあるため、
   ネイティブダイアログは使わず自前で出す
====================================================== */
let modalDone = null;
function openModal(opt){
  const m = $("modal");
  $("mTitle").textContent = opt.title || "";
  $("mDesc").textContent  = opt.desc || "";
  $("mDesc").style.display = opt.desc ? "" : "none";
  const inp = $("mInput");
  inp.style.display = opt.input ? "" : "none";
  inp.value = opt.value || "";
  inp.placeholder = opt.placeholder || "";
  $("mOk").textContent = opt.ok || "OK";
  $("mOk").className = "btn" + (opt.danger ? " danger" : "");
  $("mCancel").textContent = opt.cancel || "やめる";
  m.classList.add("on");
  if(opt.input) setTimeout(()=>{ inp.focus(); inp.select(); }, 30);
  return new Promise(res => { modalDone = res; });
}
function closeModal(val){
  $("modal").classList.remove("on");
  const f = modalDone; modalDone = null;
  if(f) f(val);
}
$("mOk").onclick     = ()=> closeModal($("mInput").style.display === "none" ? true : $("mInput").value);
$("mCancel").onclick = ()=> closeModal(null);
$("modal").onclick   = e => { if(e.target === $("modal")) closeModal(null); };
$("mInput").addEventListener("keydown", e => { if(e.key === "Enter") $("mOk").click(); });
document.addEventListener("keydown", e => { if(e.key === "Escape" && modalDone) closeModal(null); });

const askConfirm = (title, ok, desc) => openModal({ title, desc, ok: ok || "OK", danger: ok === "削除" });
const askInput   = (title, value, placeholder) => openModal({ title, value, placeholder, input: true, ok: "決定" });

/* ================= 頻度モデル =================
   freq = { unit: "once" | "day" | "week" | "month" | "days", count, n }
   day   : 1日に count 回        （期間 = 今日）
   week  : 週に count 回          （期間 = 今週 月曜〜）
   month : 月に count 回          （期間 = 今月1日〜）
   days  : n 日に count 回        （期間 = 直近 n 日間のローリング）
   進捗は log（実行時刻の配列）から数える
================================================ */
function periodOf(f){
  const now = new Date();
  if(f.unit === "day"){
    const s = startOfDay(now);
    return { start: s.getTime(), end: s.getTime() + DAY, label: "今日" };
  }
  if(f.unit === "week"){
    const s = startOfDay(now);
    s.setDate(s.getDate() - ((now.getDay() + 6) % 7)); // 月曜はじまり
    return { start: s.getTime(), end: s.getTime() + 7*DAY, label: "今週" };
  }
  if(f.unit === "month"){
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    const e = new Date(now.getFullYear(), now.getMonth()+1, 1);
    return { start: s.getTime(), end: e.getTime(), label: "今月" };
  }
  // days: ローリング
  const n = Math.max(1, f.n || 1);
  return { start: Date.now() - n*DAY, end: Date.now(), label: "直近" + n + "日", rolling: true };
}
function freqLabel(f){
  if(f.unit === "once")  return "単発";
  if(f.unit === "day")   return f.count === 1 ? "毎日" : "1日" + f.count + "回";
  if(f.unit === "week")  return "週" + f.count + "回";
  if(f.unit === "month") return "月" + f.count + "回";
  return f.n + "日に" + f.count + "回";
}
/* 進捗・ペースをまとめて計算 */
function statOf(t){
  const f = t.freq, p = periodOf(f);
  const count = Math.max(1, f.count || 1);
  const actual = (t.log || []).filter(ts => ts >= p.start && ts < Math.max(p.end, Date.now()+1)).length;
  let expected = count, remainDays = 0;
  if(f.unit === "week" || f.unit === "month"){
    const total = p.end - p.start;
    const elapsed = Math.min(total, Date.now() - p.start);
    expected = count * (elapsed / total);
    remainDays = Math.ceil((p.end - Date.now()) / DAY);
  }
  const met = actual >= count;
  const deficit = Math.max(0, expected - actual);
  const todayDone = (t.log || []).some(ts => ts >= startOfDay(new Date()).getTime());
  return { period: p, count, actual, expected, met, deficit, remainDays, todayDone, ratio: Math.min(1, actual / count) };
}
/* 連続日数（毎日タスクのみ） */
function streakOf(t){
  if(t.freq.unit !== "day") return 0;
  const need = Math.max(1, t.freq.count || 1);
  const per = {};
  (t.log || []).forEach(ts => { const k = todayKey(new Date(ts)); per[k] = (per[k]||0) + 1; });
  let n = 0;
  const d = new Date();
  if((per[todayKey(d)] || 0) < need) d.setDate(d.getDate() - 1); // 今日未達でも昨日までは保つ
  for(let i = 0; i < 400; i++){
    if((per[todayKey(d)] || 0) >= need){ n++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return n;
}

/* ================= header ================= */
function renderHeader(){
  const now = new Date();
  const wd = ["日","月","火","水","木","金","土"][now.getDay()];
  $("date").textContent = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日（${wd}）`;
  $("clock").textContent = String(now.getHours()).padStart(2,"0") + ":" + String(now.getMinutes()).padStart(2,"0");
  const h = now.getHours();
  $("greet").textContent =
    h < 5  ? "まだ起きてる？" :
    h < 11 ? "おはよう" :
    h < 17 ? "こんにちは" :
    h < 22 ? "こんばんは" : "今日もおつかれさま";
}

/* ================= philosophy banner ================= */
function renderPhiloBar(){
  if(!S.philos.length){
    $("philoText").textContent = "哲学タブから、大事にしたい言葉を登録してください。";
    return;
  }
  if(S.philoIdx >= S.philos.length) S.philoIdx = 0;
  $("philoText").textContent = S.philos[S.philoIdx].text;
}
$("philoBar").addEventListener("click", ()=>{
  if(!S.philos.length){ switchTab("philo"); return; }
  S.philoIdx = (S.philoIdx + 1) % S.philos.length;
  save(); renderPhiloBar();
});

/* ================= 「今日やること」の判定 =================
   ホームに出すのは、今日ほんとうに手を動かす必要があるものだけ。
   - 単発        : 未完了なら出す
   - 毎日        : 今日の回数が足りなければ出す
   - 週/月       : ペースから1回分以上遅れている、または
                   残り日数ぶん毎日やらないと間に合わないなら出す
   - N日ごと     : 直近N日で回数が足りなければ出す
   urgency は並び順（大きいほど上）
========================================================= */
/* 毎日のもの以外は「今日はやらない」で今日ぶんを見送れる */
function canSkip(t){ return t.freq.unit !== "day"; }

/* ---------- 朝 / 夜 ---------- */
const WHEN = {
  morning: { label: "朝", icon: "🌅" },
  night:   { label: "夜", icon: "🌙" },
  any:     { label: "いつでも", icon: "・" }
};
const whenOf = t => (t.when === "morning" || t.when === "night") ? t.when : "any";
/* いまが朝か夜か（4〜12時=朝、18〜4時=夜、その間は昼） */
function nowSlot(){
  const h = new Date().getHours();
  if(h >= 4 && h < 12) return "morning";
  if(h >= 18 || h < 4) return "night";
  return "day";
}
/* いまの時間帯に合うものを上に持ってくるための加点 */
function slotBonus(t){
  const w = whenOf(t), s = nowSlot();
  if(w === "any") return 0;
  if(s === "morning") return w === "morning" ? 10 : -10;   // 朝は夜タスクを下げる
  if(s === "day")     return w === "morning" ? 5  : -5;    // 昼は朝の残りを優先
  return w === "night" ? 10 : 0;                            // 夜は朝の残りもそのまま
}
function todayNeed(t){
  // 「今日はやらない」を選んだものは今日だけ隠す（毎日タスクは対象外）
  if(canSkip(t) && t.skipDay === todayKey()) return null;
  if(t.freq.unit === "once") return t.done ? null : { urgency: 2, st: null };
  const st = statOf(t);
  if(st.met) return null;
  if(t.freq.unit === "day")  return { urgency: 1, st };
  if(t.freq.unit === "days") return { urgency: 3, st };
  // week / month
  const needed = st.count - st.actual;
  const daysLeft = Math.max(1, st.remainDays);
  const mustToday = needed >= daysLeft;          // 残り全日やらないと間に合わない
  const behind = st.deficit >= 1;                 // ペースから1回分以上の遅れ
  if(mustToday) return { urgency: 5, st };
  if(behind)    return { urgency: 4, st };
  return null;
}
function todayTasks(){
  return S.tasks
    .map(t => { const n = todayNeed(t); return n ? { t, ...n, score: n.urgency + slotBonus(t) } : null; })
    .filter(Boolean)
    .sort((a,b) => b.score - a.score);
}

function renderToday(){
  const el = $("todayList");
  const list = todayTasks();

  if(!S.tasks.length){
    el.innerHTML = '<div class="allclear"><span class="big">📋</span>まだタスクがありません。<br>下の「タスク」タブから追加してください。</div>';
    return;
  }
  if(!list.length){
    const sk = skippedToday().length;
    el.innerHTML = sk
      ? '<div class="allclear"><span class="big">🌙</span>今日やることは残っていない。<br>（' + sk + ' 件は今日は見送り）</div>'
      : '<div class="allclear"><span class="big">🌙</span>今日ぶんは全部おわり。<br>安心して休んでいい。</div>';
    return;
  }
  const currentId = list[0].t.id;   // 「いま、これ」に出ているもの
  const used = list.some(o => whenOf(o.t) !== "any");

  let body;
  if(!used){
    // 朝／夜を一度も使っていないうちは、見出しなしのただの一覧
    body = list.map(o => todayRow(o, currentId)).join("");
  }else{
    body = ["morning","any","night"].map(w => {
      const part = list.filter(o => whenOf(o.t) === w);
      if(!part.length) return "";
      return '<div class="slot-head' + (w === nowSlot() ? " now" : "") + '">' +
          WHEN[w].icon + ' ' + WHEN[w].label +
        '</div>' + part.map(o => todayRow(o, currentId)).join("");
    }).join("");
  }

  el.innerHTML =
    '<div class="today-head"><span class="ttl">今日やること</span>' +
      '<span class="cnt">残り ' + list.length + ' 件</span></div>' + body;
}
function todayRow(o, currentId){
  const t = o.t;
  const skipBtn = canSkip(t)
    ? '<button class="iconbtn" data-act="skip" title="今日はやらない">⏭</button>' : '';
  const cur = t.id === currentId ? " current" : "";
  const curTag = cur ? '<span class="tag now">いま</span>' : '';

  if(t.freq.unit === "once"){
    return '<div class="item' + cur + '" data-id="' + t.id + '">' +
      '<button class="check" data-act="toggle">✓</button>' +
      '<div class="grow">' + taskTitle(t) + '</div>' +
      curTag + '<span class="tag freq">単発</span>' + skipBtn +
    '</div>';
  }
  const st = o.st;
  const late = o.urgency >= 4;
  const sub = st.count > 1
    ? freqLabel(t.freq) + ' ・ ' + st.period.label + ' ' + st.actual + '/' + st.count +
      (st.remainDays ? '（残り' + st.remainDays + '日）' : '')
    : freqLabel(t.freq);
  return '<div class="item' + cur + '" data-id="' + t.id + '">' +
    '<button class="check' + (st.actual > 0 ? " part" : "") + '" data-act="do">' +
      (st.actual > 0 ? st.actual : "＋") + '</button>' +
    '<div class="grow">' +
      taskTitle(t) +
      '<div class="s">' + esc(sub) + '</div>' +
    '</div>' +
    curTag +
    (late ? '<span class="tag late">遅れ</span>' : '') + skipBtn +
  '</div>';
}

/* 今日はやらない（完了でも未達成でもない・明日また出てくる） */
function skipToday(id){
  const t = S.tasks.find(x => x.id === id); if(!t || !canSkip(t)) return;
  t.skipDay = todayKey();
  save(); renderAll(); toast("今日は見送り。明日また出ます");
}
function unskip(id){
  const t = S.tasks.find(x => x.id === id); if(!t) return;
  delete t.skipDay;
  save(); renderAll();
}
function skippedToday(){
  const k = todayKey();
  return S.tasks.filter(t => canSkip(t) && t.skipDay === k && !(t.freq.unit === "once" && t.done));
}
function renderSkipped(){
  const el = $("skippedList");
  const list = skippedToday();
  if(!list.length){ el.innerHTML = ""; return; }
  el.innerHTML =
    '<button class="fold" id="foldSkip">' + (S.foldSkip ? "▸" : "▾") + ' 今日は見送り ' + list.length + ' 件</button>' +
    (S.foldSkip ? "" : list.map(t =>
      '<div class="item skipped" data-id="' + t.id + '">' +
        '<div class="grow"><div class="t">' + esc(t.text) + '</div>' +
          '<div class="s">' + esc(freqLabel(t.freq)) + '</div></div>' +
        '<button class="iconbtn" data-act="unskip" title="やっぱりやる">↩</button>' +
      '</div>').join(""));
  $("foldSkip").onclick = ()=>{ S.foldSkip = !S.foldSkip; save(); renderSkipped(); };
}

/* 今日おわった分（たたんで表示） */
function renderDoneToday(){
  const el = $("doneToday");
  const from = startOfDay(new Date()).getTime();
  const done = S.tasks.filter(t =>
    (t.freq.unit === "once" && t.done && t.doneAt >= from) ||
    (t.freq.unit !== "once" && (t.log || []).some(ts => ts >= from))
  );
  if(!done.length){ el.innerHTML = ""; return; }
  el.innerHTML =
    '<button class="fold" id="foldDone">' + (S.foldDone ? "▸" : "▾") + ' 今日やったこと ' + done.length + ' 件</button>' +
    (S.foldDone ? "" : done.map(t => {
      const n = t.freq.unit === "once" ? 1 : (t.log || []).filter(ts => ts >= from).length;
      return '<div class="item done" data-id="' + t.id + '">' +
        '<button class="check on" data-act="undoToday" title="取り消す">✓</button>' +
        '<div class="grow"><div class="t">' + esc(t.text) + '</div></div>' +
        (n > 1 ? '<span class="tag freq">' + n + '回</span>' : '') +
        '<button class="iconbtn" data-act="undoToday" title="1回取り消す">↩</button>' +
      '</div>';
    }).join(""));
  $("foldDone").onclick = ()=>{ S.foldDone = !S.foldDone; save(); renderDoneToday(); };
}

/* ================= now card ================= */
function renderNow(){
  const el = $("nowCard");
  const top = todayTasks()[0];

  if(!top){
    el.innerHTML =
      '<div class="label">いま、これ</div>' +
      '<div class="empty">' + (S.tasks.length ? "今日やることは残っていない。" : "「タスク」タブから、やることを1つ書く。") + '</div>';
    return;
  }

  const t = top.t, st = top.st;
  const w = whenOf(t);
  const sub = (w === "any" ? "" : WHEN[w].icon + WHEN[w].label + ' ・ ') +
    (t.freq.unit === "once"
      ? "単発タスク"
      : freqLabel(t.freq) + ' ・ ' + st.period.label + ' ' + st.actual + '/' + st.count +
        (st.remainDays ? '（残り' + st.remainDays + '日）' : ''));

  const title = t.url
    ? '<a href="' + esc(t.url) + '" target="_blank" rel="noopener noreferrer">' + esc(t.text) + ' <span style="font-size:18px">🔗</span></a>'
    : esc(t.text);

  el.innerHTML =
    '<div class="label">いま、これ</div>' +
    '<div class="txt">' + title + '</div>' +
    '<div class="sub">' + esc(sub) + (t.url ? ' ・ ' + esc(hostOf(t.url)) : '') + '</div>' +
    '<div class="btnrow">' +
      '<button id="nowDone">' + (t.freq.unit === "once" ? "できた" : "やった") + '</button>' +
      (t.url ? '<a class="open" href="' + esc(t.url) + '" target="_blank" rel="noopener noreferrer">開く</a>' : '') +
      (canSkip(t) ? '<button class="skip" id="nowSkip">今日はやらない</button>' : '') +
    '</div>';

  $("nowDone").onclick = ()=>{
    if(t.freq.unit === "once"){
      t.done = true; t.doneAt = Date.now(); save(); renderAll();
      toast("よくやった", ()=>{ t.done = false; delete t.doneAt; save(); renderAll(); toast("戻しました"); });
    } else {
      logDo(t.id);   // 記録＋「取り消す」の案内は logDo 側で出す
    }
  };
  if($("nowSkip")) $("nowSkip").onclick = ()=> skipToday(t.id);
}

/* ================= タスク追加フォーム ================= */
let taskWhen = "any";
$("whenChips").addEventListener("click", e => {
  const c = e.target.closest(".chip"); if(!c) return;
  taskWhen = c.dataset.when;
  document.querySelectorAll("#whenChips .chip").forEach(x => x.classList.toggle("on", x === c));
});

let freqUnit = "once";
$("freqChips").addEventListener("click", e => {
  const c = e.target.closest(".chip"); if(!c) return;
  freqUnit = c.dataset.unit;
  document.querySelectorAll("#freqChips .chip").forEach(x => x.classList.toggle("on", x === c));
  syncFreqLine();
});
function syncFreqLine(){
  const line = $("freqLine");
  if(freqUnit === "once"){ line.style.display = "none"; return; }
  line.style.display = "flex";
  const pre = { day:"1日に", week:"1週間に", month:"1か月に", days:"" }[freqUnit];
  $("freqPre").textContent = pre;
  $("freqN").style.display   = freqUnit === "days" ? "" : "none";
  $("freqMid").style.display = freqUnit === "days" ? "" : "none";
}
function addTask(){
  const v = $("taskInput").value.trim();
  if(!v) return;
  let freq = { unit: "once" };
  if(freqUnit !== "once"){
    const count = Math.min(99, Math.max(1, parseInt($("freqCount").value, 10) || 1));
    const n = Math.min(365, Math.max(1, parseInt($("freqN").value, 10) || 1));
    freq = { unit: freqUnit, count };
    if(freqUnit === "days") freq.n = n;
  }
  const url = normalizeUrl($("taskUrl").value);
  S.tasks.push({ id: uid(), text: v, url, when: taskWhen, freq, done: false, log: [], createdAt: Date.now() });
  $("taskInput").value = ""; $("taskUrl").value = "";
  save(); renderAll(); toast("追加しました");
}
$("taskAdd").onclick = addTask;
$("taskInput").addEventListener("keydown", e => { if(e.key === "Enter") addTask(); });

/* ================= タスク一覧 ================= */
/* リンクつきタスクのタイトル（タップでリンクを開く） */
function taskTitle(t){
  if(!t.url) return '<div class="t">' + esc(t.text) + '</div>';
  return '<div class="t"><a class="tasklink" href="' + esc(t.url) + '" target="_blank" rel="noopener noreferrer">' +
    '<span>' + esc(t.text) + '</span><span class="ico">🔗</span></a></div>';
}
/* 朝 → 夜 → いつでも を順に切り替えるボタン */
function whenBtn(t){
  const w = whenOf(t);
  return '<button class="iconbtn' + (w === "any" ? " faint" : "") + '" data-act="when" title="朝／夜の切り替え">' +
    (w === "any" ? "🕘" : WHEN[w].icon) + '</button>';
}
function cycleWhen(id){
  const t = S.tasks.find(x => x.id === id); if(!t) return;
  const order = ["any","morning","night"];
  t.when = order[(order.indexOf(whenOf(t)) + 1) % 3];
  save(); renderAll(); toast(WHEN[t.when].label + " に設定");
}
function linkBtn(t){
  return '<button class="iconbtn' + (t.url ? "" : " faint") + '" data-act="link" title="リンクを設定">🔗</button>';
}
function hostOf(url){
  try{ return new URL(url).hostname.replace(/^www\./,""); }catch(e){ return ""; }
}
/* リンクの付け外し */
async function editUrl(id){
  const t = S.tasks.find(x => x.id === id); if(!t) return;
  const v = await openModal({
    title: "「" + t.text + "」を開くリンク",
    desc: "空にすると解除します",
    input: true, value: t.url || "", placeholder: "https://...", ok: "決定"
  });
  if(v === null) return;
  if(!v.trim()){ t.url = ""; save(); renderAll(); toast("リンクを外しました"); return; }
  const u = normalizeUrl(v);
  if(!u){ toast("URLを確認してください"); return; }
  t.url = u; save(); renderAll(); toast("リンクを設定しました");
}

/* 1回ぶん記録する。数え間違いに備えて「取り消す」付きで知らせる */
function logDo(id){
  const t = S.tasks.find(x => x.id === id); if(!t) return;
  t.log = t.log || [];
  const stamp = Date.now();
  t.log.push(stamp);
  if(t.log.length > 1000) t.log = t.log.slice(-1000);
  save(); renderAll();
  const st = statOf(t);
  toast("記録した（" + st.actual + "/" + st.count + "）", ()=>{
    const i = t.log.lastIndexOf(stamp);
    if(i >= 0) t.log.splice(i, 1);
    save(); renderAll(); toast("取り消しました");
  });
}
/* いまの期間の記録を1つ減らす */
function undoDo(id){
  const t = S.tasks.find(x => x.id === id); if(!t || !t.log || !t.log.length) return;
  const st = statOf(t);
  const idx = t.log.map((ts,i) => ({ts,i})).filter(o => o.ts >= st.period.start).map(o => o.i).pop();
  if(idx === undefined){ toast("この期間の記録はありません"); return; }
  t.log.splice(idx, 1);
  save(); renderAll();
  toast("1回ぶん減らした（" + statOf(t).actual + "/" + st.count + "）");
}
/* 今日ぶんの記録を1つ取り消す（完了した単発なら未完了に戻す） */
function undoToday(id){
  const t = S.tasks.find(x => x.id === id); if(!t) return;
  if(t.freq.unit === "once"){
    t.done = false; delete t.doneAt;
    save(); renderAll(); toast("未完了に戻しました");
    return;
  }
  const from = startOfDay(new Date()).getTime();
  const idx = (t.log || []).map((ts,i) => ({ts,i})).filter(o => o.ts >= from).map(o => o.i).pop();
  if(idx === undefined){ toast("今日の記録はありません"); return; }
  t.log.splice(idx, 1);
  save(); renderAll(); toast("1回ぶん取り消しました");
}

const GROUPS = [
  { key:"once",  title:"単発タスク" },
  { key:"day",   title:"毎日" },
  { key:"week",  title:"今週" },
  { key:"month", title:"今月" },
  { key:"days",  title:"◯日ごと" }
];
function renderTasks(){
  const el = $("taskList");
  if(!S.tasks.length){ el.innerHTML = '<div class="empty-note">タスクはまだありません。</div>'; return; }

  let html = "";
  GROUPS.forEach(g => {
    let list = S.tasks.filter(t => t.freq.unit === g.key);
    if(!list.length) return;
    if(g.key === "once") list = list.slice().sort((a,b) => (a.done?1:0) - (b.done?1:0));
    html += '<h2>' + g.title + '</h2>';
    html += list.map(t => g.key === "once" ? onceRow(t) : repeatRow(t)).join("");
  });
  el.innerHTML = html;
}
function onceRow(t){
  return '<div class="item' + (t.done ? " done" : "") + '" data-id="' + t.id + '">' +
    '<button class="check' + (t.done ? " on" : "") + '" data-act="toggle">✓</button>' +
    '<div class="grow">' + taskTitle(t) +
      (t.url ? '<div class="s">' + esc(hostOf(t.url)) + '</div>' : '') +
    '</div>' +
    (t.done ? "" : '<button class="iconbtn" data-act="up">↑</button>') +
    whenBtn(t) + linkBtn(t) +
    '<button class="iconbtn del" data-act="del">✕</button>' +
  '</div>';
}
function repeatRow(t){
  const st = statOf(t);
  // 「遅れ」は期間のあるもの（週/月/N日ごと）だけ。毎日は未実行なだけなので出さない
  const late = !st.met && st.deficit >= 1 && t.freq.unit !== "day";
  const streak = streakOf(t);
  const barCls = st.met ? "met" : (late ? "late" : "");
  const meta =
    '<b>' + st.actual + '/' + st.count + '</b>' +
    (st.remainDays ? ' ・残' + st.remainDays + '日' : '') +
    (streak > 1 ? ' ・🔥' + streak : '');
  return '<div class="item' + (st.met ? " met" : "") + '" data-id="' + t.id + '">' +
    '<button class="check' + (st.met ? " on" : (st.actual > 0 ? " part" : "")) + '" data-act="do">' +
      (st.met ? "✓" : (st.actual > 0 ? st.actual : "＋")) +
    '</button>' +
    '<div class="grow">' +
      taskTitle(t) +
      '<div class="prog">' +
        '<div class="bar"><i class="' + barCls + '" style="width:' + Math.round(st.ratio*100) + '%"></i></div>' +
        '<span class="pmeta">' + meta + '</span>' +
        (late ? '<span class="tag late">遅れ</span>' : (st.met ? '<span class="tag ok">達成</span>' : '')) +
      '</div>' +
      '<div class="s">' + freqLabel(t.freq) + ' ・ ' + st.period.label + '</div>' +
    '</div>' +
    (st.actual > 0 ? '<button class="iconbtn" data-act="undo">−</button>' : '') +
    whenBtn(t) + linkBtn(t) +
    '<button class="iconbtn del" data-act="del">✕</button>' +
  '</div>';
}
async function taskClick(e){
  const btn = e.target.closest("[data-act]"); if(!btn) return;
  const row = e.target.closest(".item"); if(!row || !row.dataset.id) return;
  const id = row.dataset.id;
  const i = S.tasks.findIndex(t => t.id === id); if(i < 0) return;
  const act = btn.dataset.act, t = S.tasks[i];

  if(act === "toggle"){ t.done = !t.done; t.doneAt = Date.now(); save(); renderAll(); return; }
  if(act === "do")       { logDo(id); return; }
  if(act === "undo")     { undoDo(id); return; }
  if(act === "undoToday"){ undoToday(id); return; }
  if(act === "link")  { editUrl(id); return; }
  if(act === "when")  { cycleWhen(id); return; }
  if(act === "skip")  { skipToday(id); return; }
  if(act === "unskip"){ unskip(id); return; }
  if(act === "up" && i > 0){ const [x] = S.tasks.splice(i,1); S.tasks.unshift(x); save(); renderAll(); return; }
  if(act === "del"){
    const ok = await askConfirm("「" + t.text + "」を削除しますか？", "削除",
      t.freq.unit === "once" ? "" : "これまでの記録もいっしょに消えます");
    if(!ok) return;
    const idx = S.tasks.findIndex(x => x.id === id);   // 待っている間にずれる可能性に備える
    if(idx < 0) return;
    const removed = S.tasks.splice(idx, 1)[0];
    save(); renderAll();
    toast("削除しました", ()=>{                        // すぐなら元に戻せる
      S.tasks.splice(idx, 0, removed);
      save(); renderAll(); toast("戻しました");
    });
  }
}
$("taskList").addEventListener("click", taskClick);
$("todayList").addEventListener("click", taskClick);
$("skippedList").addEventListener("click", taskClick);
$("doneToday").addEventListener("click", taskClick);

/* 追加フォームの開閉（リンク・哲学） */
const ADD_LABEL = { philoForm: "＋ 言葉を追加" };
function setForm(name, open){
  const b = document.querySelector('.addtoggle[data-form="' + name + '"]');
  $(name).style.display = open ? "" : "none";
  b.textContent = open ? "× 閉じる" : ADD_LABEL[name];
}
document.querySelectorAll(".addtoggle").forEach(b => b.onclick = ()=>{
  setForm(b.dataset.form, $(b.dataset.form).style.display === "none");
});

/* ================= URL ================= */
function normalizeUrl(u){
  u = u.trim();
  if(!u) return "";
  if(/^javascript:/i.test(u) || /^data:/i.test(u)) return "";
  if(!/^https?:\/\//i.test(u)) u = "https://" + u;
  try{ new URL(u); }catch(e){ return ""; }
  return u;
}
/* ================= philosophy ================= */
function addPhilo(){
  const v = $("philoInput").value.trim();
  if(!v) return;
  S.philos.push({ id: uid(), text: v });
  $("philoInput").value = "";
  setForm("philoForm", false);
  save(); renderAll(); toast("追加しました");
}
$("philoAdd").onclick = addPhilo;

function renderPhilos(){
  const el = $("philoList");
  if(!S.philos.length){ el.innerHTML = '<div class="empty-note">迷ったときに立ち返る言葉を書いておくと、上に表示されます。</div>'; return; }
  el.innerHTML = S.philos.map(p =>
    '<div class="philo-item" data-id="' + p.id + '">' +
      '<div class="t">' + esc(p.text) + '</div>' +
      '<button class="iconbtn" data-act="pin" title="上に表示">📌</button>' +
      '<button class="iconbtn del" data-act="del">✕</button>' +
    '</div>'
  ).join("");
}
$("philoList").addEventListener("click", async e => {
  const btn = e.target.closest("[data-act]"); if(!btn) return;
  const id = e.target.closest(".philo-item").dataset.id;
  const i = S.philos.findIndex(p => p.id === id); if(i < 0) return;
  if(btn.dataset.act === "pin"){ S.philoIdx = i; toast("上に表示しました"); }
  if(btn.dataset.act === "del"){
    const ok = await askConfirm("この言葉を削除しますか？", "削除", S.philos[i].text);
    if(!ok) return;
    const idx = S.philos.findIndex(p => p.id === id); if(idx < 0) return;
    const removed = S.philos.splice(idx,1)[0];
    if(S.philoIdx >= S.philos.length) S.philoIdx = 0;
    save(); renderAll();
    toast("削除しました", ()=>{ S.philos.splice(idx,0,removed); save(); renderAll(); toast("戻しました"); });
    return;
  }
  save(); renderAll();
});

/* ================= settings ================= */
function renderStats(){
  const once = S.tasks.filter(t => t.freq.unit === "once");
  const rep  = S.tasks.filter(t => t.freq.unit !== "once");
  const late = rep.filter(t => { const s = statOf(t); return !s.met && s.deficit >= 1; }).length;
  $("stats").innerHTML =
    '<div class="kv"><span>単発タスク</span><span>' + once.length + '件（完了 ' + once.filter(t=>t.done).length + '）</span></div>' +
    '<div class="kv"><span>くり返しタスク</span><span>' + rep.length + '件（遅れ ' + late + '）</span></div>' +
    '<div class="kv"><span>リンク付きタスク</span><span>' + S.tasks.filter(t => t.url).length + '件</span></div>' +
    '<div class="kv"><span>哲学</span><span>' + S.philos.length + '件</span></div>';
}
$("btnExport").onclick = ()=>{
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "自己管理_" + todayKey() + ".json";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
};
$("btnImport").onclick = ()=> $("fileInput").click();
$("fileInput").onchange = e => {
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = async ()=>{
    let d;
    try{
      d = JSON.parse(r.result);
      if(typeof d !== "object" || d === null) throw 0;
    }catch(err){ toast("読み込めませんでした"); return; }
    const ok = await askConfirm("読み込むデータで置き換えますか？", "置き換える",
      "いまのタスク・リンク・哲学はすべて消えます");
    if(!ok) return;
    S = migrate(Object.assign(structuredClone(DEFAULTS), d));
    save(); renderAll(); toast("読み込みました");
  };
  r.readAsText(f);
  e.target.value = "";
};
$("btnClearDone").onclick = async ()=>{
  const gone = S.tasks.filter(t => t.freq.unit === "once" && t.done);
  if(!gone.length){ toast("完了タスクはありません"); return; }
  const ok = await askConfirm("完了した " + gone.length + " 件を削除しますか？", "削除",
    gone.map(t => t.text).join("、"));
  if(!ok) return;
  const before = S.tasks.slice();
  S.tasks = S.tasks.filter(t => !(t.freq.unit === "once" && t.done));
  save(); renderAll();
  toast("削除しました", ()=>{ S.tasks = before; save(); renderAll(); toast("戻しました"); });
};

/* ================= tabs ================= */
function switchTab(name){
  document.querySelectorAll("nav button").forEach(b => b.classList.toggle("on", b.dataset.tab === name));
  document.querySelectorAll("section").forEach(s => s.classList.toggle("on", s.id === "sec-" + name));
  window.scrollTo(0,0);
}
document.querySelectorAll("nav button").forEach(b => b.onclick = ()=> switchTab(b.dataset.tab));

/* ================= boot ================= */
function renderAll(){
  renderHeader();
  renderPhiloBar();
  renderNow();
  renderToday();
  renderSkipped();
  renderDoneToday();
  renderTasks();
  // リンク欄の候補は、いま使っているタスクのURLから作る
  $("taskUrlList").innerHTML = [...new Set(S.tasks.map(t => t.url).filter(Boolean))]
    .map(u => '<option value="' + esc(u) + '"></option>').join("");
  renderPhilos();
  renderStats();
}

// 日付が変わったら哲学を1つ進める
(function rollDay(){
  const k = todayKey();
  if(S.lastOpen !== k){
    if(S.lastOpen && S.philos.length) S.philoIdx = (S.philoIdx + 1) % S.philos.length;
    S.lastOpen = k;
    save();
  }
})();

syncFreqLine();
renderAll();
setInterval(renderHeader, 10000);
document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) renderAll(); });
</script>
</body>
</html>
