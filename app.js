"use strict";
/* ============================================================
   自己管理アプリ（箱モデル）
   - 1箱 = 30分。箱は時間そのもの。1箱に入るやりたいことは1つ
   - 日付の切り替えは午前2時。午前 2:00-14:00 / 午後 14:00-翌2:00
   - 仕様は SPEC.md。勝手に広げないこと
   ============================================================ */

/* ▼ バージョン。上げるときは index.html の3か所（meta app-version、
   style.css?v=、app.js?v=）も同じ値に揃えること。
   揃っていないと「新しい版があります」が出っぱなしになる */
const APP_VERSION = "2026-08-16.2";

/* ================= storage ================= */
const KEY = "jiko-kanri-v1";

/* ▼ ここの2つは「リンクとアプリ」の道具だが、わざと上に置いてある。
   migrate() が normLink() を呼び、normLink() がこの2つを見るため。
   migrate() は load() の途中＝この下のどの const よりも先に動くので、
   下に置くと TDZ で落ちる。落ちると catch が初期状態を返し、
   本人のデータを空で上書きしてしまう。動かさないこと */
function lid(){ return "lk" + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
/* 起動ファイルから呼ぶブラウザ。
   ▼ `start "" chrome "url"` のように名前で呼ぶのは駄目。名前が実行ファイルとして
     解決されないと、start はその引数をただのURLとして扱い、結局**既定のブラウザ**で開く。
     しかも黙って開くので気づけない（実際にそうなった）。
     だから実体の exe を探して、フルパスで叩く。paths は上から順に見て、
     最初に見つかったものを使う */
const BROWSERS = [
  { key:"", label:"既定のブラウザ", paths: [] },
  { key:"chrome",  label:"Chrome", paths: [
    "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe",
    "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe",
    "%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe"
  ]},
  { key:"brave", label:"Brave", paths: [
    "%ProgramFiles%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    "%ProgramFiles(x86)%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    "%LocalAppData%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"
  ]},
  { key:"edge", label:"Edge", paths: [
    "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe",
    "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"
  ]},
  { key:"firefox", label:"Firefox", paths: [
    "%ProgramFiles%\\Mozilla Firefox\\firefox.exe",
    "%ProgramFiles(x86)%\\Mozilla Firefox\\firefox.exe"
  ]}
];

/* 最初から入れておく一言。消したぶんは保存側が空配列で上書きするので復活しない */
const SEED_CHEERS = ["やったぜ！", "よくやった", "えらい", "その調子", "ひとつ片づいた"];
/* 箱を使い切ったときに出す一言（仮。差し替えたければここ） */
const SLEEP_LINE = "あとは寝るだけ。";

const DEFAULTS = {
  v: 7,
  tasks: [],
  images: [],         // { id, data:dataURL, at } ごほうびの画像
  philos: [],
  philoIdx: 0,
  // { id, text } 完了したときに1つ出る一言
  cheers: SEED_CHEERS.map((t,i) => ({ id: "cheer" + i, text: t })),
  routines: [],       // { id, text, slot:"am"|"pm" }
  routineDone: {},    // { "2026-08-09": [routineId, ...] }
  // { "2026-08-09": { count, holiday, slots:[taskId|null], cuts:[{at,label}], roulette:[taskId] } }
  days: {},
  base: { weekday: 8, holiday: 12 },
  // 1箱目の開始時刻。箱は時刻を持たないが、何番目が何時かの見当をつけるために使う
  boxStart: { weekday: "18:00", holiday: "10:00" },
  // 今週だけの回数の上書き { "2026-W33": { taskId: 3 } }。週が変われば prune で消える
  weekOverrides: {},
  // 起動ファイル用。自動で見つからないブラウザだけ、設定タブで場所を教えてもらう
  browserPaths: {},   // { chrome:"C:\\...\\chrome.exe", brave:"", edge:"", firefox:"" }
  // タイマーが0になったときに鳴らす音。null なら既定の「ピッピッピッ」
  timerSound: null,   // { name, data:dataURL, sec, rate, at }
  lastOpen: "",
  foldDone: false,
  foldSkip: false
};

/* 読み込みに失敗したときの理由。起動時に知らせるために持っておく */
let loadFailed = "";
function load(){
  let raw = null;
  try{
    raw = localStorage.getItem(KEY);
    if(!raw) return structuredClone(DEFAULTS);
    return migrate(Object.assign(structuredClone(DEFAULTS), JSON.parse(raw)));
  }catch(e){
    /* ここに来たら初期状態を返すことになり、起動時の save() が
       読めたはずのデータを空で上書きしてしまう。
       消える前に必ず横へ退避して、黙って無かったことにしない。
       （実際に v6 の移行で踏んだ。migrate() の中で、あとから const 宣言される
         ものに触れると TDZ で落ちてここへ来る） */
    if(raw){
      try{ localStorage.setItem(KEY + "-broken", raw); }catch(_){}
      loadFailed = String((e && e.message) || e);
    }
    return structuredClone(DEFAULTS);
  }
}
/* v1（単発＋習慣） → v2（頻度つきのやりたいこと） → v3（箱モデル） */
function migrate(d){
  // v1 → v2
  if(d.habits){
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
  }
  // v2 → v3 : 朝/夜 → 午前/午後、必要箱数
  if(!(d.v >= 3)){
    (d.tasks || []).forEach(t => {
      if(t.when === "morning") t.when = "am";
      else if(t.when === "night") t.when = "pm";
      else t.when = "any";
    });
    d.v = 3;
  }
  // v3 → v4 : 休みは曜日ではなく手入力。完了したときの一言
  if(!(d.v >= 4)){
    // ここは load() の途中で動く。あとで宣言される uid / CUT には触れないこと
    if(!Array.isArray(d.cheers) || !d.cheers.length){
      d.cheers = SEED_CHEERS.map((t,i) => ({ id: "cheer" + i + Date.now().toString(36), text: t }));
    }
    // これまで土日から作られていた箱数は、その日の休みフラグとして引き継ぐ
    Object.keys(d.days || {}).forEach(k => {
      const day = d.days[k];
      if(day && typeof day.holiday !== "boolean"){
        const [y,m,dd] = k.split("-").map(Number);
        const w = new Date(y, m-1, dd).getDay();
        day.holiday = (w === 0 || w === 6);
      }
    });
    d.v = 4;
  }
  // v4 → v5 : ごほうびの画像（増えるのは器だけ。移すものは無い）
  if(!(d.v >= 5)) d.v = 5;
  // v5 → v6 : リンクは1本 → 複数本（アプリの起動も持てる links[] に移す）
  if(!(d.v >= 6)){
    // ここは load() の途中で動く。あとで宣言される uid には触れないこと（lid は関数宣言なので使える）
    (d.tasks || []).forEach(t => {
      if(!Array.isArray(t.links)){
        t.links = [];
        if(t.url) t.links.push({ id: lid(), kind: "url", url: t.url, browser: "" });
      }
      delete t.url;
    });
    d.v = 6;
  }
  // v6 → v7 : 単発も log で数える（回数を持てるようにする）＋ 曜日/時刻/遠い日程
  if(!(d.v >= 7)){
    // ここは load() の途中で動く。あとで宣言される const には触れないこと
    (d.tasks || []).forEach(t => {
      if(!Array.isArray(t.log)) t.log = [];
      // これまでの単発は done フラグだけだった。1回やったものとして log に移す
      if(t.freq && t.freq.unit === "once" && t.done && !t.log.length){
        t.log.push(typeof t.doneAt === "number" ? t.doneAt : Date.now());
      }
      delete t.done; delete t.doneAt;
    });
    d.v = 7;
  }
  // 取りこぼしの保険（壊れた値で描画が止まらないように）
  d.tasks = Array.isArray(d.tasks) ? d.tasks : [];
  d.tasks.forEach(t => {
    if(!t.freq) t.freq = { unit: "once" };
    if(!Array.isArray(t.log)) t.log = [];
    if(!Array.isArray(t.actuals)) t.actuals = [];
    if(typeof t.size !== "number" || !(t.size >= 1)) t.size = 1;
    t.size = Math.min(16, Math.round(t.size));
    if(t.when !== "am" && t.when !== "pm") t.when = "any";
    // 単発の総回数。期限は無い。やり切ったら「達成したもの」へ移る
    if(typeof t.goal !== "number" || !(t.goal >= 1)) t.goal = 1;
    t.goal = Math.min(999, Math.round(t.goal));
    // 曜日と時刻。決まっているものだけ持つ（無ければ null）
    if(!t.fixed || typeof t.fixed !== "object") t.fixed = null;
    else{
      const dow = t.fixed.dow;
      t.fixed = {
        dow: (typeof dow === "number" && dow >= 0 && dow <= 6) ? dow : null,   // null は毎日
        time: /^\d{1,2}:\d{2}$/.test(t.fixed.time) ? t.fixed.time : "18:00"
      };
    }
    // 遠い予定。この日までは、ふだんのリストに出さない
    if(!/^\d{4}-\d{2}-\d{2}$/.test(t.remindAt || "")) t.remindAt = "";
    // 壊れた行は黙って捨てる。ここで形を揃えておけば、あとは links[] だけを見ればよい
    t.links = Array.isArray(t.links) ? t.links.map(normLink).filter(Boolean) : [];
  });
  d.philos    = Array.isArray(d.philos) ? d.philos : [];
  d.cheers    = Array.isArray(d.cheers) ? d.cheers : [];
  d.images    = Array.isArray(d.images) ? d.images.filter(x => x && typeof x.data === "string") : [];
  d.routines  = Array.isArray(d.routines) ? d.routines : [];
  d.routineDone = (d.routineDone && typeof d.routineDone === "object") ? d.routineDone : {};
  d.days      = (d.days && typeof d.days === "object") ? d.days : {};
  d.base      = Object.assign({ weekday: 8, holiday: 12 }, d.base || {});
  d.boxStart  = Object.assign({ weekday: "18:00", holiday: "10:00" }, d.boxStart || {});
  d.weekOverrides = (d.weekOverrides && typeof d.weekOverrides === "object") ? d.weekOverrides : {};
  d.browserPaths = (d.browserPaths && typeof d.browserPaths === "object") ? d.browserPaths : {};
  // タイマーの音。中身が無ければ既定（ピッピッピッ）に戻す
  d.timerSound = (d.timerSound && typeof d.timerSound.data === "string") ? d.timerSound : null;
  delete d.links;   // v2 までの未使用フィールド
  return d;
}
/* 書けたら true。画像を足すときは、これで先に試して駄目なら戻す */
function trySave(){
  try{ localStorage.setItem(KEY, JSON.stringify(S)); return true; }
  catch(e){ return false; }
}
function save(){
  if(!trySave()) toast("保存に失敗しました。哲学タブから画像を減らしてください");
  // 同期を使っているなら、少し待ってからまとめて送る（下の「同期」の節）
  if(typeof syncSoon === "function") syncSoon();
}
/* いま保存に使っているおおよその量（KB） */
function usedKB(){
  try{ return Math.round(JSON.stringify(S).length / 1024); }catch(e){ return 0; }
}
let S = load();

/* ================= helpers ================= */
const $ = id => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const DAY = 86400000;
const CUT = 2;          // 日付の切り替え（午前2時）
const PM_FROM = 14;     // 午後のはじまり

/* 1箱 = 30分。箱数を「◯時間◯分」に */
function boxTime(n){
  const m = n * 30;
  if(m < 60) return m + "分";
  const h = Math.floor(m / 60), r = m % 60;
  return h + "時間" + (r ? r + "分" : "");
}

function ymd(d){
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
/* 午前2時区切りの「その日」。深夜1時はまだ前日 */
function dayKey(at){
  const x = new Date(at || Date.now());
  x.setHours(x.getHours() - CUT);
  return ymd(x);
}
/* 日付キーは "2026-08-13" の形の文字列だけ。
   ボタンの onclick にそのまま関数を渡すと、ここへイベントが流れ込んで
   ありえないキーの日ができてしまう。受け取る側でも必ず直しておく */
const DAYKEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const okKey = key => (typeof key === "string" && DAYKEY_RE.test(key)) ? key : dayKey();
function dayStart(key){
  const [y,m,d] = okKey(key).split("-").map(Number);
  return new Date(y, m-1, d, CUT, 0, 0, 0);
}
function dayStartTs(key){ return dayStart(key).getTime(); }
/* いまが午前か午後か */
function nowSlot(){
  const h = new Date().getHours();
  return (h >= CUT && h < PM_FROM) ? "am" : "pm";
}
const SLOT = { am:{label:"午前", icon:"☀"}, pm:{label:"午後", icon:"🌙"}, any:{label:"いつでも", icon:"・"} };
const WD = ["日","月","火","水","木","金","土"];

/* ================= 週（日曜はじまり） =================
   アプリ全体で週は日曜はじまりにそろえる。1週間ページも「週に何回」の集計も同じ。
   起点がそろうので、ページに並ぶ7日と「今週ぶん」が常に一致する
====================================================== */
/* その日が属する週の、日曜の dayKey */
function weekStartKey(key){
  const d = dayStart(key || dayKey());
  d.setDate(d.getDate() - d.getDay());     // 日曜はじまり
  return ymd(d);
}
/* 週の識別子。今週だけの上書きを持つときのキーにする */
const weekId = key => "W" + weekStartKey(key);
/* 週の7日ぶんの dayKey を、日曜から土曜の順で返す */
function weekDays(key){
  const d = dayStart(weekStartKey(key));
  const out = [];
  for(let i = 0; i < 7; i++){ out.push(ymd(d)); d.setDate(d.getDate() + 1); }
  return out;
}
const nextWeekKey = key => ymd(new Date(dayStart(weekStartKey(key)).getTime() + 7*DAY));

/* ================= 達成の数え方（行動ベース） =================
   達成は「その日に達成ボタンを押したとき」に数える。箱に置いただけでは達成にならない。
   単発もくり返しも log[] に積む。単発は goal 回ぶん積んだら達成
========================================================== */
const goalOf    = t => Math.max(1, t.goal || 1);
const doneCount = t => (t.log || []).length;
/* 単発をやり切ったか（＝「達成したもの」に移るか） */
const isDone    = t => t.freq.unit === "once" && doneCount(t) >= goalOf(t);

/* いまの期間に必要な回数。今週だけの上書きがあればそれを使う */
function countFor(t, key){
  if(t.freq.unit === "once") return goalOf(t);
  const base = Math.max(1, t.freq.count || 1);
  if(t.freq.unit !== "week") return base;
  const ov = S.weekOverrides[weekId(key)];
  const v = ov && ov[t.id];
  return (typeof v === "number" && v >= 0) ? v : base;
}
/* 今週だけ回数を変える。もとの回数に戻したら上書きを消す */
function setWeekOverride(id, key, n){
  const t = taskById(id); if(!t || t.freq.unit !== "week") return;
  const w = weekId(key);
  const base = Math.max(1, t.freq.count || 1);
  n = Math.max(0, Math.min(99, n));
  if(n === base){ if(S.weekOverrides[w]) delete S.weekOverrides[w][t.id]; }
  else { S.weekOverrides[w] = S.weekOverrides[w] || {}; S.weekOverrides[w][t.id] = n; }
  if(S.weekOverrides[w] && !Object.keys(S.weekOverrides[w]).length) delete S.weekOverrides[w];
  save();
}
const hasOverride = (t, key) => {
  const ov = S.weekOverrides[weekId(key)];
  return !!(ov && typeof ov[t.id] === "number");
};

let toastTimer;
/* action を渡すとボタン付きで出る。関数なら「取り消す」扱い */
function toast(msg, action){
  const t = $("toast");
  t.innerHTML = "";
  t.appendChild(document.createTextNode(msg));
  if(action){
    const a = typeof action === "function" ? { label:"取り消す", run:action } : action;
    const b = document.createElement("button");
    b.className = "act";
    b.textContent = a.label;
    b.onclick = ()=>{ t.classList.remove("on"); a.run(); };
    t.appendChild(b);
  }
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove("on"), action ? 6000 : 1800);
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
  // 自由に中身を差し込める枠（開けなかったリンクの一覧など）
  const ex = $("mExtra");
  ex.innerHTML = opt.html || "";
  ex.style.display = opt.html ? "" : "none";
  $("mOk").textContent = opt.ok || "OK";
  $("mOk").className = "btn" + (opt.danger ? " danger" : "");
  $("mCancel").textContent = opt.cancel || "やめる";
  $("mCancel").style.display = opt.hideCancel ? "none" : "";
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

const askConfirm = (title, ok, desc) => openModal({ title, desc, ok: ok || "OK", danger: ok === "削除" });
const askInput   = (title, value, placeholder) => openModal({ title, value, placeholder, input: true, ok: "決定" });

/* ================= 箱（1日の器） ================= */
/* 休みかどうかは曜日で決めない。どの日も平日（仕事）から始まり、手で切り替える */
function baseFor(holiday){
  const n = holiday ? S.base.holiday : S.base.weekday;
  return Math.max(0, Math.min(48, Math.round(n) || 0));
}
const isHoliday = key => !!getDay(key).holiday;
/* その日の箱。無ければ平日の基本値から作る */
function getDay(key){
  key = okKey(key);
  let d = S.days[key];
  if(!d) d = S.days[key] = { count: baseFor(false), holiday: false, slots: [], cuts: [], roulette: [] };
  if(typeof d.holiday !== "boolean") d.holiday = false;
  if(!Array.isArray(d.slots))    d.slots    = [];
  if(!Array.isArray(d.cuts))     d.cuts     = [];
  if(!Array.isArray(d.roulette)) d.roulette = [];
  if(typeof d.count !== "number") d.count = d.slots.length;
  while(d.slots.length < d.count) d.slots.push(null);
  if(d.slots.length > d.count) d.slots.length = d.count;
  // 消えたやりたいことが箱やルーレットに残っていたら片付ける
  for(let i = 0; i < d.slots.length; i++){
    if(d.slots[i] && !taskById(d.slots[i])) d.slots[i] = null;
  }
  d.roulette = d.roulette.filter(id => taskById(id));
  return d;
}
/* 平日 ⇄ 休み。箱数をその区分の基本値に合わせ直す */
function setDayType(holiday, key){
  const d = getDay(key);
  d.holiday = !!holiday;
  const target = baseFor(d.holiday);
  while(d.count < target){ d.count++; d.slots.push(null); }
  let stuck = false;
  while(d.count > target){
    let i = d.slots.length - 1;
    while(i >= 0 && d.slots[i] !== null) i--;
    if(i < 0){ stuck = true; break; }        // 埋まっていて減らせない
    d.slots.splice(i, 1); d.count--;
  }
  save(); renderAll();
  toast(dayLabel(key) + "を" + (d.holiday ? "休み" : "平日") + "にした（" + d.count + "箱 ＝ " + boxTime(d.count) + "）" +
    (stuck ? "／埋まっている箱があるのでここまで" : ""));
}
const taskById = id => S.tasks.find(t => t.id === id) || null;

/* ================= 箱と時刻 =================
   箱はこれまでどおり順番だけを持つ。時刻は持たない。
   ここで出すのは「何番目がだいたい何時か」の見当だけ。
   休憩を挟めば実時間はずれていく。あくまで目安
============================================ */
const HHMM = /^(\d{1,2}):(\d{2})$/;
/* 1箱目の開始時刻を「その日の始まりからの分」に。読めなければ 18:00 とみなす */
function startMin(key){
  const holiday = key === "__h" ? true : key === "__w" ? false : isHoliday(key);
  const s = S.boxStart[holiday ? "holiday" : "weekday"] || "18:00";
  const m = HHMM.exec(s);
  const h = m ? Math.min(23, Math.max(0, +m[1])) : 18;
  const mi = m ? Math.min(59, Math.max(0, +m[2])) : 0;
  return h*60 + mi;
}
/* i 番目（0はじまり）の箱が始まるおおよその時刻 */
function boxClock(key, i){
  const t = startMin(key) + i*30;
  const h = Math.floor(t / 60) % 24, m = t % 60;
  return String(h).padStart(2,"0") + ":" + String(m).padStart(2,"0");
}
/* 線を引く箱の位置。ちょうど「◯時00分」になる境目だけに出す */
function isClockMark(key, i){
  if(i === 0) return true;
  return (startMin(key) + i*30) % 60 === 0;
}
/* 「19:00」から、その日の何番目の箱かを逆算する（範囲外は端に寄せる） */
function boxIndexForTime(key, hhmm){
  const m = HHMM.exec(hhmm || "");
  if(!m) return 0;
  const want = Math.min(23, Math.max(0, +m[1]))*60 + Math.min(59, Math.max(0, +m[2]));
  let diff = want - startMin(key);
  if(diff < 0) diff += 24*60;                 // 開始より前の時刻は翌日まわりとみなす
  return Math.max(0, Math.round(diff / 30));
}

/* 日付の呼び名。今日・明日はそう呼ぶ。それ以外は「8/14（木）」 */
function dayLabel(key){
  const k = okKey(key);
  const today = dayKey();
  if(k === today) return "今日";
  if(k === ymd(new Date(dayStartTs(today) + DAY))) return "明日";
  const d = dayStart(k);
  return (d.getMonth()+1) + "/" + d.getDate() + "（" + WD[d.getDay()] + "）";
}

/* その日のうちに完了したか（単発は done、くり返しは log） */
function doneOn(t, key){
  const from = dayStartTs(key || dayKey()), to = from + DAY;
  return (t.log || []).some(ts => ts >= from && ts < to);
}
/* 箱の列を「連続した同じやりたいこと」でまとめる */
function boxGroups(d){
  const g = [];
  for(let i = 0; i < d.slots.length; i++){
    const id = d.slots[i], last = g[g.length-1];
    if(id && last && last.id === id && last.to === i-1) last.to = i;
    else g.push({ id, from: i, to: i });
  }
  return g;
}
const emptyBoxes = d => d.slots.filter(x => x === null).length;
/* 残り箱数 ＝ まだ消費していない箱（完了した箱を引いたもの） */
function usedBoxes(d){
  let n = 0;
  boxGroups(d).forEach(g => {
    const t = g.id && taskById(g.id);
    if(t && doneOn(t)) n += g.to - g.from + 1;
  });
  return n;
}
const remainBoxes = d => Math.max(0, d.count - usedBoxes(d));
/* 箱を使い切った ＝ 箱があって、空きが無く、全部完了している */
function dayFinished(d){
  return d.count > 0 && emptyBoxes(d) === 0 && remainBoxes(d) === 0;
}

/* 上から順に、空いている連続した箱へ入れる */
function placeTask(id){
  const t = taskById(id); if(!t) return;
  const d = getDay();
  if(d.slots.includes(id)){ toast("すでに箱に入っています"); return; }
  const size = Math.max(1, t.size || 1);
  let at = -1;
  for(let i = 0; i + size <= d.slots.length; i++){
    let ok = true;
    for(let k = 0; k < size; k++) if(d.slots[i+k] !== null){ ok = false; break; }
    if(ok){ at = i; break; }
  }
  if(at < 0){
    toast(size > 1 ? "連続した" + size + "箱の空きがありません" : "空き箱がありません");
    return;
  }
  for(let k = 0; k < size; k++) d.slots[at+k] = id;
  save(); renderAll();
  toast("箱 " + (at+1) + (size > 1 ? "–" + (at+size) : "") + " に入れた");
}
/* 落とした位置に入れる（すでに箱にあるものは、そこへ動かす） */
function placeTaskAt(id, at, key){
  const t = taskById(id); if(!t) return false;
  const d = getDay(key);
  const size = Math.max(1, t.size || 1);
  const prev = d.slots.slice();
  for(let i = 0; i < d.slots.length; i++) if(d.slots[i] === id) d.slots[i] = null;  // 動かす前にどける
  at = Math.max(0, Math.min(at, d.slots.length - 1));
  let ok = at + size <= d.slots.length;
  if(ok) for(let k = 0; k < size; k++) if(d.slots[at+k] !== null){ ok = false; break; }
  if(!ok){
    d.slots = prev;
    toast(size > 1 ? "そこには入りません（連続した" + size + "箱が必要）" : "その箱はふさがっています");
    return false;
  }
  for(let k = 0; k < size; k++) d.slots[at+k] = id;
  save(); renderAll();
  toast(dayLabel(key) + "の箱 " + (at+1) + (size > 1 ? "–" + (at+size) : "") + " に入れた");
  return true;
}
function unplace(id, key){
  const d = getDay(key);
  if(!d.slots.includes(id)) return;
  for(let i = 0; i < d.slots.length; i++) if(d.slots[i] === id) d.slots[i] = null;
  save(); renderAll(); toast("箱から出した");
}
function addBox(key){
  const d = getDay(key);
  if(d.count >= 48){ toast("これ以上は増やせません"); return; }
  d.count++; d.slots.push(null);
  save(); renderAll();
  toast(dayLabel(key) + "の箱を増やした（" + d.count + "箱 ＝ " + boxTime(d.count) + "）");
}
function removeBox(key){
  const d = getDay(key);
  if(d.count <= 0){ toast("箱がありません"); return; }
  let i = d.slots.length - 1;
  while(i >= 0 && d.slots[i] !== null) i--;
  if(i < 0){ toast("空いている箱がありません。先に箱から出してください"); return; }
  d.slots.splice(i, 1);
  d.count--;
  const cut = { at: Date.now(), label: "" };   // 理由はあとから任意でつける
  d.cuts.push(cut);
  save(); renderAll();
  toast(dayLabel(key) + "の箱を減らした（" + d.count + "箱 ＝ " + boxTime(d.count) + "）", {
    label: "理由をつける",
    run: async ()=>{
      const v = await askInput("この箱は何で潰れた？", "", "例：家庭教師");
      if(v === null) return;
      cut.label = v.trim();
      save(); renderStats();
      if(cut.label) toast("「" + cut.label + "」として記録した");
    }
  });
}

/* ================= 自動配置（曜日・時刻つきの予定） =================
   **自動で入るのは、その日が作られたときの1回だけ。**
   それ以降アプリは箱に手を出さない。移動も削除もユーザーの自由で、
   一度外したものを置き直すことはしない。
   置けなかったものは、勝手にずらしたり消したりせず、衝突として知らせる
================================================================ */
/* その日に自動で入るべきもの（曜日が合う・まだ達成していない・遠い予定でない） */
function fixedFor(key){
  const ts = dayStartTs(key);
  const dow = dayStart(key).getDay();
  return S.tasks.filter(t => {
    if(!t.fixed) return false;
    if(t.fixed.dow !== null && t.fixed.dow !== dow) return false;
    if(isDone(t)) return false;
    if(t.remindAt && t.remindAt > key) return false;
    // その期間ぶんの回数を、もう置ききっているなら足さない
    if(t.freq.unit !== "day" && remainingToPlan(t, key) <= 0) return false;
    return true;
  }).sort((a,b) => boxIndexForTime(key, a.fixed.time) - boxIndexForTime(key, b.fixed.time));
}
/* 新しく作られた日にだけ走らせる。置けなかったものは d.conflicts に残す */
function autoPlace(key){
  const d = S.days[key]; if(!d) return;
  const bad = [];
  fixedFor(key).forEach(t => {
    if(d.slots.includes(t.id)) return;
    const size = Math.max(1, t.size || 1);
    const at = boxIndexForTime(key, t.fixed.time);
    let ok = at >= 0 && at + size <= d.slots.length;
    if(ok) for(let k = 0; k < size; k++) if(d.slots[at+k] !== null){ ok = false; break; }
    if(!ok){
      // ずらさない。本人に直してもらう
      bad.push({ id: t.id, text: t.text, time: t.fixed.time,
        why: at + size > d.slots.length ? "箱が足りません" : "その時間の箱がふさがっています" });
      return;
    }
    for(let k = 0; k < size; k++) d.slots[at+k] = t.id;
  });
  if(bad.length) d.conflicts = bad;
}
/* 決まった時間を設定・変更したときに、すでに作られている先の日へも入れる。
   「日が作られたときだけ」に任せると、いま見えている週には二度と入らないため。
   これは**本人が時間を決めた操作の続き**であって、アプリが勝手に動かすのとは別 */
function autoPlaceAhead(id){
  const t = taskById(id); if(!t || !t.fixed) return 0;
  const k0 = dayKey();
  let n = 0;
  Object.keys(S.days).sort().forEach(k => {
    if(k < k0) return;
    const d = S.days[k];
    if(!Array.isArray(d.slots) || d.slots.includes(t.id)) return;
    if(t.fixed.dow !== null && dayStart(k).getDay() !== t.fixed.dow) return;
    if(isDone(t) || (t.remindAt && t.remindAt > k)) return;
    if(t.freq.unit !== "day" && remainingToPlan(t, k) <= 0) return;
    const size = Math.max(1, t.size || 1);
    const at = boxIndexForTime(k, t.fixed.time);
    let ok = at + size <= d.slots.length;
    if(ok) for(let j = 0; j < size; j++) if(d.slots[at+j] !== null){ ok = false; break; }
    if(!ok) return;                                  // ずらさない。置けなければ置かない
    for(let j = 0; j < size; j++) d.slots[at+j] = t.id;
    n++;
  });
  return n;
}
/* その日を用意する。まだ無ければ作って、そのときだけ自動配置を走らせる */
function ensureDay(key){
  key = okKey(key);
  const isNew = !S.days[key];
  getDay(key);
  if(isNew) autoPlace(key);
  return isNew;
}
/* 週の7日ぶんをまとめて用意する（1週間ページを開いたとき）。
   作ったぶんは必ず保存する。保存し損ねると、開くたびに作り直しになる */
function ensureWeek(key){
  let made = false;
  weekDays(key).forEach(k => { if(ensureDay(k)) made = true; });
  if(made) save();
}
/* まだ知らせていない衝突を集める */
function pendingConflicts(keys){
  const out = [];
  keys.forEach(k => {
    const d = S.days[k];
    if(d && d.conflicts && d.conflicts.length) out.push({ key: k, list: d.conflicts });
  });
  return out;
}
function clearConflicts(keys){
  keys.forEach(k => { if(S.days[k]) delete S.days[k].conflicts; });
  save();
}

/* ================= ごほうびの画像 =================
   localStorage に入れるので、1枚 400KB 以下に落としてから持つ。
   容量は他のデータと同じ引き出しを使う。**画像のせいでやりたいことが
   保存できなくなってはいけない**ので、追加は trySave() で試して
   駄目なら必ず元に戻すこと
=================================================== */
const IMG_MAX   = 400 * 1024;   // 1枚の上限（データURLの長さ）
const IMG_SIDE  = 1600;         // 長辺の上限
const IMG_LIMIT = 8;            // 保存できる枚数（localStorage の容量に収まる数）

/* 400KB 以下になるまで、画質 → 寸法の順に落とす */
function compressImage(file){
  return new Promise((resolve, reject) => {
    if(!/^image\//.test(file.type)) return reject(new Error("画像ではありません"));
    const fr = new FileReader();
    fr.onerror = ()=> reject(new Error("読み込めませんでした"));
    fr.onload = ()=>{
      const img = new Image();
      img.onerror = ()=> reject(new Error("画像として開けませんでした"));
      img.onload = ()=>{
        let w = img.naturalWidth, h = img.naturalHeight;
        if(!w || !h) return reject(new Error("画像として開けませんでした"));
        if(Math.max(w,h) > IMG_SIDE){
          const r = IMG_SIDE / Math.max(w,h);
          w = Math.round(w*r); h = Math.round(h*r);
        }
        let out = "";
        for(let round = 0; round < 7; round++){
          const c = document.createElement("canvas");
          c.width = w; c.height = h;
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#0f1115";                 // 透過PNGが黒く沈まないように
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          for(const q of [0.85, 0.75, 0.65, 0.55, 0.45, 0.35]){
            out = c.toDataURL("image/jpeg", q);
            if(out.length <= IMG_MAX) return resolve(out);
          }
          if(w < 320 || h < 320) break;
          w = Math.round(w*0.8); h = Math.round(h*0.8);
        }
        resolve(out);   // ここまで縮めても超えるなら、いちばん小さい版を返す（呼び出し側で断る）
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
/* 追加できたら true。枚数オーバー・容量オーバーなら元に戻して false */
function addImage(dataUrl){
  if(S.images.length >= IMG_LIMIT) return false;
  const prev = S.images.slice();
  S.images.push({ id: uid(), data: dataUrl, at: Date.now() });
  if(!trySave()){
    S.images = prev;
    trySave();
    return false;
  }
  return true;
}
function removeImage(id){
  const i = S.images.findIndex(x => x.id === id);
  if(i < 0) return;
  S.images.splice(i, 1);
  // その画像を今日のぶんに選んでいたら選び直す
  Object.keys(S.days).forEach(k => { if(S.days[k].img === id) delete S.days[k].img; });
  save(); renderAll(); toast("画像を削除しました");
}
/* その日の1枚。いちど選んだら日付が変わるまで変えない */
function dayImage(){
  if(!S.images.length) return null;
  const d = getDay();
  if(!d.img || !S.images.some(x => x.id === d.img)){
    d.img = S.images[Math.floor(Math.random() * S.images.length)].id;
    save();
  }
  return S.images.find(x => x.id === d.img) || null;
}

/* ================= 頻度モデル =================
   freq = { unit: "once" | "day" | "week" | "month" | "days", count, n }
   期間の区切りも午前2時に合わせる
================================================ */
function periodOf(f, key){
  const k = key || dayKey(), s0 = dayStartTs(k);
  // 単発は期限が無い。通算で goal 回ぶんやったら達成
  if(f.unit === "once") return { start: 0, end: Infinity, label: "通算" };
  if(f.unit === "day") return { start: s0, end: s0 + DAY, label: "今日" };
  if(f.unit === "week"){
    const s = dayStartTs(weekStartKey(k));            // 日曜はじまり
    return { start: s, end: s + 7*DAY, label: "今週" };
  }
  if(f.unit === "month"){
    const d = dayStart(k);
    const s = new Date(d.getFullYear(), d.getMonth(), 1, CUT);
    const e = new Date(d.getFullYear(), d.getMonth()+1, 1, CUT);
    return { start: s.getTime(), end: e.getTime(), label: "今月" };
  }
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
function statOf(t, key){
  const f = t.freq, p = periodOf(f, key);
  const count = countFor(t, key);
  const actual = (t.log || []).filter(ts => ts >= p.start && ts < Math.max(p.end, Date.now()+1)).length;
  let expected = count, remainDays = 0;
  if(f.unit === "week" || f.unit === "month"){
    const total = p.end - p.start;
    const elapsed = Math.min(total, Date.now() - p.start);
    expected = count * (elapsed / total);
    remainDays = Math.ceil((p.end - Date.now()) / DAY);
  }
  return {
    period: p, count, actual, expected,
    met: count > 0 && actual >= count,
    deficit: Math.max(0, expected - actual),
    remainDays,
    ratio: Math.min(1, actual / count)
  };
}
/* 連続日数（毎日のやりたいことのみ） */
function streakOf(t){
  if(t.freq.unit !== "day") return 0;
  const need = Math.max(1, t.freq.count || 1);
  const per = {};
  (t.log || []).forEach(ts => { const k = dayKey(ts); per[k] = (per[k] || 0) + 1; });
  let n = 0;
  const d = dayStart(dayKey());
  if((per[ymd(d)] || 0) < need) d.setDate(d.getDate() - 1);   // 今日未達でも昨日までは保つ
  for(let i = 0; i < 400; i++){
    if((per[ymd(d)] || 0) >= need){ n++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return n;
}

/* ================= 「今日のやりたいこと」の判定 ================= */
const canSkip = t => t.freq.unit !== "day";
const whenOf  = t => (t.when === "am" || t.when === "pm") ? t.when : "any";
function slotBonus(t){
  const w = whenOf(t);
  if(w === "any") return 0;
  return w === nowSlot() ? 10 : -10;
}
/* これから来る箱に置いてある数（今日以降・その期間のうち）。
   過ぎた日の未実行の箱はここに入らないので、**サボった分は勝手にリストへ戻ってくる** */
function plannedAhead(t, key){
  const k0 = key || dayKey();
  const p = periodOf(t.freq, k0);
  const from = dayStartTs(k0);
  // 「直近N日」は期間が後ろへ転がるので、今日からN日先までを置ける枠として見る
  const to = p.rolling ? from + Math.max(1, t.freq.n || 1) * DAY : p.end;
  let n = 0;
  Object.keys(S.days).forEach(dk => {
    const ts = dayStartTs(dk);
    if(ts < from || ts >= to) return;
    if(!(S.days[dk].slots || []).includes(t.id)) return;
    // すでにやった日の箱は「これから来る箱」ではない。
    // ここを数えると、やった数と二重に引いて残りが負になる
    if(doneOn(t, dk)) return;
    n++;
  });
  return n;
}
/* まだ箱に置いていない残り。これが 0 より大きいものだけリストに出す
   残り ＝ 回数 － その期間にやった数 － これから来る箱に置いてある数 */
function remainingToPlan(t, key){
  return countFor(t, key) - statOf(t, key).actual - plannedAhead(t, key);
}
function todayNeed(t){
  const k = dayKey();
  if(t.remindAt && t.remindAt > k) return null;               // 遠い予定。まだ隠しておく
  if(canSkip(t) && t.skipDay === k) return null;              // 今日は見送り
  if(isDone(t)) return null;                                  // 単発をやり切った
  const st = statOf(t);
  if(st.met) return null;
  if(remainingToPlan(t) <= 0) return null;                    // 置ききった（「入れきったら、もう終わり」）
  if(t.freq.unit === "once") return { urgency: 2, st };
  if(t.freq.unit === "day")  return { urgency: 1, st };
  if(t.freq.unit === "days") return { urgency: 3, st };
  const needed = st.count - st.actual;
  const daysLeft = Math.max(1, st.remainDays);
  if(needed >= daysLeft) return { urgency: 5, st };            // 残り全日やらないと間に合わない
  if(st.deficit >= 1)    return { urgency: 4, st };            // ペースから1回分以上の遅れ
  return { urgency: 3, st };                                   // ペース内でも、まだ置いていないなら出す
}
function todayTasks(){
  return S.tasks
    .map(t => { const n = todayNeed(t); return n ? { t, ...n, score: n.urgency + slotBonus(t) } : null; })
    .filter(Boolean)
    .sort((a,b) => b.score - a.score);
}
/* まだ箱に入れていない、今日やるべきもの */
function unplacedTasks(){
  const d = getDay();
  return todayTasks().filter(o => !d.slots.includes(o.t.id) && !doneOn(o.t));
}

/* ================= 記録する / 取り消す ================= */
function doTask(id){
  const t = taskById(id); if(!t) return;
  const d = getDay();
  const stamp = Date.now();
  // 単発もくり返しも同じ log に積む。単発は goal 回ぶんで達成
  t.log = t.log || [];
  t.log.push(stamp);
  if(t.log.length > 1000) t.log = t.log.slice(-1000);
  // 箱に入れてやったものだけ、実績の器を用意する（入力は任意）
  const planned = d.slots.filter(x => x === id).length;
  if(planned > 0){
    t.actuals = t.actuals || [];
    t.actuals.push({ ts: stamp, day: dayKey(), planned, actual: null });
  }
  if(d.roulette.includes(id)) removeFromRoulette(id);   // 済んだものは候補から外す
  save(); renderAll();
  cheer();
  const msg = t.freq.unit !== "once" ? "記録した"
    : (isDone(t) ? "やり切った！" : "できた（" + doneCount(t) + "/" + goalOf(t) + "）");
  toast(msg, ()=> undoStamp(id, stamp));
}
/* ▼ 記録を1つ取り消す。取り消しは必ずここを通すこと。
   同期では log を「足し算」で混ぜる（両方の端末で押したぶんを残すため）。
   だから「消した」ことを覚えておかないと、もう一方の端末から足し戻されて
   取り消しがいつまでも効かない。gone がその覚え書き */
function dropLog(t, idx){
  const ts = t.log[idx];
  t.log.splice(idx, 1);
  t.gone = t.gone || [];
  if(!t.gone.includes(ts)) t.gone.push(ts);
  if(t.gone.length > 400) t.gone = t.gone.slice(-400);
  const j = (t.actuals || []).findIndex(a => a.ts === ts);
  if(j >= 0) t.actuals.splice(j, 1);
}
function undoStamp(id, stamp){
  const t = taskById(id); if(!t) return;
  const i = (t.log || []).lastIndexOf(stamp);
  if(i >= 0) dropLog(t, i);
  save(); renderAll(); toast("戻しました");
}
/* 今日ぶんの記録を1つ取り消す */
function undoToday(id){
  const t = taskById(id); if(!t) return;
  const from = dayStartTs();
  const idx = (t.log || []).map((ts,i) => ({ts,i})).filter(o => o.ts >= from).map(o => o.i).pop();
  if(idx === undefined){ toast("今日の記録はありません"); return; }
  dropLog(t, idx);
  save(); renderAll(); toast("1回ぶん取り消しました");
}
/* いまの期間の記録を1つ減らす（「やりたいこと」タブの − ） */
function undoDo(id){
  const t = taskById(id); if(!t || !t.log || !t.log.length) return;
  const st = statOf(t);
  const idx = t.log.map((ts,i) => ({ts,i})).filter(o => o.ts >= st.period.start).map(o => o.i).pop();
  if(idx === undefined){ toast("この期間の記録はありません"); return; }
  dropLog(t, idx);
  save(); renderAll();
  toast("1回ぶん減らした（" + statOf(t).actual + "/" + st.count + "）");
}
function skipToday(id){
  const t = taskById(id); if(!t || !canSkip(t)) return;
  if(getDay().slots.includes(id)) unplaceSilent(id);
  t.skipDay = dayKey();
  save(); renderAll(); toast("今日は見送り。明日また出ます");
}
function unplaceSilent(id){
  const d = getDay();
  for(let i = 0; i < d.slots.length; i++) if(d.slots[i] === id) d.slots[i] = null;
}
/* 今日以降の箱から全部どける（箱数が変わったとき・消したとき） */
function unplaceEverywhere(id){
  const k0 = dayKey();
  Object.keys(S.days).forEach(dk => {
    if(dk < k0) return;                       // 過ぎた日は記録なので触らない
    const sl = S.days[dk].slots || [];
    for(let i = 0; i < sl.length; i++) if(sl[i] === id) sl[i] = null;
  });
}
function unskip(id){
  const t = taskById(id); if(!t) return;
  delete t.skipDay;
  save(); renderAll();
}
function skippedToday(){
  const k = dayKey();
  return S.tasks.filter(t => canSkip(t) && t.skipDay === k && !isDone(t));
}

/* ================= 「いま、これ」のカーソル ================= */
let cursor = 0;
/* 箱に入っていて、まだ終わっていないもの */
function pendingGroups(){
  return boxGroups(getDay()).filter(g => {
    const t = g.id && taskById(g.id);
    return t && !doneOn(t);
  });
}
function currentGroup(){
  const gs = pendingGroups();
  if(!gs.length) return null;
  return gs[((cursor % gs.length) + gs.length) % gs.length];
}
function moveCursor(n){
  const gs = pendingGroups();
  if(!gs.length) return;
  cursor = ((cursor + n) % gs.length + gs.length) % gs.length;
  renderNow(); renderBoxes();
}

/* ================= リンクとアプリ =================
   1つのやりたいことに何本でも持たせる。やりたいことの名前を押すと全部まとめて開く。
     kind:"url" … ふつうのリンク。browser を指定できるが、
                  ブラウザの中からは既定のブラウザでしか開けない（.bat 側でだけ効く）
     kind:"app" … PCのアプリ。中身は2通り
                  ・独自スキーム（steam:// discord:// obs:// など）… その場で起動できる
                  ・exe のパス（C:\...\obs64.exe）… ブラウザからは起動できない。.bat でだけ動く
   exe を直に叩けないのはブラウザの決まりごとで、迂回する方法は無い。
   そのぶんを「起動ファイル(.bat)の書き出し」で埋めている
============================================================ */
/* lid() と BROWSERS は storage の節の頭にある（migrate() から使うため） */
function browserOf(key){ return BROWSERS.find(b => b.key === key) || BROWSERS[0]; }

function normalizeUrl(u){
  u = (u || "").trim();
  if(!u) return "";
  if(/^javascript:/i.test(u) || /^data:/i.test(u)) return "";
  if(!/^https?:\/\//i.test(u)) u = "https://" + u;
  try{ new URL(u); }catch(e){ return ""; }
  return u;
}
function hostOf(url){
  try{ return new URL(url).hostname.replace(/^www\./,""); }catch(e){ return ""; }
}
/* アプリを呼び出す独自スキームか（steam:// obs:// discord:// …）。
   http と、危ないもの・意味の無いものは弾く。
   ▼ 頭を2文字以上にしているのは Windows のドライブレター（C:\...）を
     スキームと見なさないため。1文字だけのスキームは無いものとして扱う */
function isScheme(s){
  s = String(s || "").trim();
  return /^[a-z][a-z0-9+.\-]+:/i.test(s) &&
        !/^(https?|file|javascript|data|vbscript|about|blob):/i.test(s);
}
/* 1行ぶんの形を整える。駄目なら null（呼び出し側で捨てる）。
   migrate() から呼ぶので、あとで const 宣言されるものに触れないこと */
function normLink(x){
  if(!x || typeof x !== "object") return null;
  const id = typeof x.id === "string" && x.id ? x.id : lid();
  const raw = String(x.kind === "app" ? (x.path || x.url || "") : (x.url || x.path || "")).trim();
  if(!raw) return null;
  // 種類を間違えて入れていても、中身を見て正しい方へ寄せる
  if(x.kind !== "app" && isScheme(raw)) return { id, kind:"app", path: raw, args: String(x.args || "").trim() };
  if(x.kind === "app") return { id, kind:"app", path: raw, args: String(x.args || "").trim() };
  const u = normalizeUrl(raw);
  if(!u) return null;
  const b = BROWSERS.some(bb => bb.key === x.browser) ? x.browser : "";
  return { id, kind:"url", url: u, browser: b };
}
const linksOf = t => (t && Array.isArray(t.links)) ? t.links : [];
/* exe のパス。ブラウザからは起動できない行 */
const isExeLink  = l => l.kind === "app" && !isScheme(l.path);
/* 起動ファイル(.bat)でないと言うとおりに開かない行があるか */
function needsBat(t){
  return linksOf(t).some(l => isExeLink(l) || (l.kind === "url" && l.browser));
}
function linkLabel(l){
  if(l.kind === "url"){
    const h = hostOf(l.url) || l.url;
    return h + (l.browser ? "（" + browserOf(l.browser).label + "）" : "");
  }
  if(isScheme(l.path)) return l.path.length > 30 ? l.path.slice(0,29) + "…" : l.path;
  return l.path.split(/[\\/]/).filter(Boolean).pop() || l.path;
}
/* 一覧の小さい行に出す要約 */
function linkSummary(t){
  const ls = linksOf(t);
  if(!ls.length) return "";
  return linkLabel(ls[0]) + (ls.length > 1 ? " 他" + (ls.length - 1) + "件" : "");
}
function taskTitle(t){
  const ls = linksOf(t);
  if(!ls.length) return '<div class="t">' + esc(t.text) + '</div>';
  const href = (ls.find(l => l.kind === "url") || {}).url || "#";
  return '<div class="t"><a class="tasklink" href="' + esc(href) + '" data-act="openall"' +
    ' title="' + esc(ls.map(linkLabel).join(" / ")) + '" rel="noopener noreferrer">' +
    '<span>' + esc(t.text) + '</span><span class="ico">🔗</span>' +
    (ls.length > 1 ? '<span class="lc">' + ls.length + '</span>' : '') + '</a></div>';
}

/* ---------- 開く ----------
   ここは押した瞬間（ユーザー操作の中）で開き切ること。
   await をはさむと、その後の window.open はポップアップとして止められる */
function launchScheme(p){
  // 独自スキームは iframe に流し込む。ページから離れずに「◯◯を開きますか？」が出る
  const f = document.createElement("iframe");
  f.style.display = "none";
  document.body.appendChild(f);
  try{ f.contentWindow.location.href = p; }catch(e){}
  setTimeout(()=>{ try{ f.remove(); }catch(e){} }, 2000);
}
function openTask(id){
  const t = taskById(id); if(!t) return;
  const ls = linksOf(t);
  if(!ls.length) return;

  const blocked = [];   // ポップアップとして止められたリンク
  const manual  = [];   // exe。ブラウザからは起動できない
  ls.forEach(l => {
    if(l.kind === "url"){
      let w = null;
      // noopener を付けると Chrome は常に null を返すので、開けたかを見分けられない。
      // 代わりに開いたあとで opener を切る
      try{ w = window.open(l.url, "_blank"); }catch(e){}
      if(w){ try{ w.opener = null; }catch(e){} }
      else blocked.push(l);
    }else if(isScheme(l.path)){
      launchScheme(l.path);
    }else{
      manual.push(l);
    }
  });

  const n = ls.length - blocked.length - manual.length;
  if(!blocked.length && !manual.length){
    toast(n > 1 ? n + "件ひらきました" : "ひらきました");
    return;
  }
  openFallback(t, blocked, manual);
}
/* 開けなかったぶんの受け皿。ここのリンクは1つずつ押せば確実に開く */
function openFallback(t, blocked, manual){
  const rows = [];
  blocked.forEach(l => {
    rows.push('<a class="fbrow" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' +
      '<span class="fbi">🔗</span><span class="fbt">' + esc(l.url) + '</span></a>');
  });
  manual.forEach(l => {
    rows.push('<div class="fbrow off"><span class="fbi">🖥</span><span class="fbt">' +
      esc(l.path + (l.args ? " " + l.args : "")) + '</span></div>');
  });
  const desc = [];
  if(blocked.length) desc.push("ポップアップとして止められたものがあります。ブラウザの設定でこのページのポップアップを許可すると、次からは1クリックで全部開きます。");
  if(manual.length)  desc.push("PCのアプリは、ブラウザからは起動できません。下の「起動ファイル」を書き出して実行してください。");
  openModal({
    title: "開けなかったもの（" + (blocked.length + manual.length) + "件）",
    desc: desc.join("\n"),
    html: rows.join("") +
      (needsBat(t) ? '<div class="row mt10"><button class="btn ghost" id="fbBat">起動ファイル(.bat)を書き出す</button></div>' : ""),
    ok: "閉じる", hideCancel: true
  });
  if($("fbBat")) $("fbBat").onclick = ()=> exportBat(t);
}

/* ---------- 起動ファイル(.bat) ----------
   ブラウザには「Chromeで開く」「exeを起動する」ができない。
   その2つだけは Windows のバッチにして本人に実行してもらう */
function batStr(s){
  // " は消す（引数の切れ目になる）。% はバッチが変数として食うので %% にする
  return String(s).replace(/"/g, "").replace(/%/g, "%%");
}
/* 引数は本人が書いたものなので " をそのまま通す（複数のURLを渡したいことがある） */
function batArg(s){ return String(s).replace(/%/g, "%%"); }

/* 指定のブラウザを探して起動する行を作る。
   見つからなければ**黙って既定で開かず**、はっきり知らせて止まる */
function batBrowser(b, urls){
  const out = ["rem --- " + b.label + " で開く ---"];
  // 設定タブで場所を教えてもらっていれば、そちらを先に見る。
  // %LocalAppData% のような書き方も通したいので、ここは %% にしない
  const mine = String((S.browserPaths || {})[b.key] || "").trim().replace(/"/g, "");
  const paths = mine ? [mine].concat(b.paths) : b.paths;
  paths.forEach((p, i) => {
    out.push((i === 0 ? 'set "B=' : 'if not exist "%B%" set "B=') + p + '"');
  });
  out.push('if exist "%B%" start "" "%B%" ' + urls.map(u => '"' + batStr(u) + '"').join(" "));
  out.push('if not exist "%B%" echo *** ' + b.label +
    ' が見つかりませんでした。アプリの設定タブ「ブラウザの場所」に入れてください。');
  out.push('if not exist "%B%" pause');
  return out;
}
function batFor(t){
  const ls = linksOf(t);
  const out = [
    "@echo off",
    "chcp 65001 > nul",
    "rem 自己管理アプリが書き出した起動ファイル",
    "rem やりたいこと: " + batStr(t.text).replace(/[\r\n]+/g, " "),
    // リンクを変えても、書き出しずみのバッチは古いまま。いつのものか分かるようにしておく
    "rem 書き出し: " + dayKey() + "（アプリ側でリンクを変えたら、書き出し直すこと）",
    "rem ブラウザが見つからないと言われたら、アプリの設定タブ「ブラウザの場所」に入れて書き出し直してください",
    ""
  ];
  let i = 0;
  while(i < ls.length){
    const l = ls[i];
    if(l.kind === "app"){
      /* ▼ /d で「そのアプリが入っているフォルダ」を作業フォルダにして起動する。
         これが無いと、バッチを置いた場所が作業フォルダになる。
         OBS のように自分のフォルダから起動される前提のアプリは、
         そのままだと設定やロケールを見つけられずに落ちる。
         スキーム（steam:// など）にはフォルダが無いので付けない */
      const dir = isScheme(l.path) ? "" : l.path.replace(/[\\/][^\\/]*$/, "");
      out.push('start ""' + (dir && dir !== l.path ? ' /d "' + batStr(dir) + '"' : "") +
        ' "' + batStr(l.path) + '"' + (l.args ? " " + batArg(l.args) : ""));
      i++;
      continue;
    }
    // 同じブラウザが続くぶんは1回のコマンドにまとめる（1つの窓にタブで並ぶ）
    const b = browserOf(l.browser);
    const urls = [];
    while(i < ls.length && ls[i].kind === "url" && ls[i].browser === l.browser){
      urls.push(ls[i].url); i++;
    }
    // 既定のブラウザは、URLをそのまま Windows に渡せばよい（それが「既定」の意味）
    if(!b.paths.length) urls.forEach(u => out.push('start "" "' + batStr(u) + '"'));
    else batBrowser(b, urls).forEach(x => out.push(x));
    out.push("");
  }
  out.push("");
  return out.join("\r\n");
}
function exportBat(t){
  // BOM は付けない。cmd は chcp 65001 のあとの行を UTF-8 として読める
  const blob = new Blob([batFor(t)], { type: "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "起動_" + String(t.text).replace(/[\\/:*?"<>|\r\n]+/g, "_").slice(0, 40) + ".bat";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  toast("書き出しました。実行すると全部まとめて起動します");
}

/* やりたいことの名前（🔗つき）を押したら、そのやりたいことのリンクを全部開く。
   どの一覧から押されても効くように document で拾う */
document.addEventListener("click", e => {
  const a = e.target.closest('[data-act="openall"]'); if(!a) return;
  e.preventDefault();
  const row = a.closest("[data-id]");
  const id = a.dataset.taskId || (row ? row.dataset.id : "");
  if(id) openTask(id);
});

/* ================= 描画：ヘッダーと箱バー ================= */
function renderHeader(){
  const now = new Date();
  const key = dayKey();
  const ds  = dayStart(key);
  const wd  = ["日","月","火","水","木","金","土"][ds.getDay()];
  const late = now.getHours() < CUT ? "（深夜）" : "";
  $("date").textContent = `${ds.getFullYear()}年${ds.getMonth()+1}月${ds.getDate()}日（${wd}）${late}`;
  $("clock").textContent = String(now.getHours()).padStart(2,"0") + ":" + String(now.getMinutes()).padStart(2,"0");
  const s = nowSlot();
  $("greet").textContent = SLOT[s].icon + " " + SLOT[s].label + (isHoliday(key) ? " ・休み" : " ・平日");
}
/* ================= 描画：哲学バー ================= */
function renderPhiloBar(){
  if(!S.philos.length){
    $("philoText").textContent = "哲学タブから、大事にしたい言葉を登録してください。";
    return;
  }
  if(S.philoIdx >= S.philos.length){ S.philoIdx = 0; save(); }
  $("philoText").textContent = S.philos[S.philoIdx].text;
}
$("philoBar").addEventListener("click", ()=>{
  if(!S.philos.length){ switchTab("philo"); return; }
  S.philoIdx = (S.philoIdx + 1) % S.philos.length;
  save(); renderPhiloBar();
});

/* ================= タイマー（「いま、これ」の中） =================
   1箱＝30分なので、既定は30分。＋−で1分ずつ増減して、0になったら音が鳴る。
   ▼ 状態はメモリだけに持つ（localStorage に入れない）。
     途中の残り時間まで保存すると、閉じている間も進んでいたことにするのか、
     止まっていたことにするのかを決めなければならなくなる。
     タイマーは「いま座って使うもの」なので、読み込み直したら 30分に戻る、で通す
   ▼ 終わりは残り秒ではなく終了時刻（timerEndAt）で持つ。setInterval は遅れるので、
     残り秒を引き算していくと、じわじわずれていく
=================================================================== */
const TIMER_MIN_DEFAULT = 30;   // 既定の長さ（分）＝ 1箱ぶん
const TIMER_MIN_MAX = 480;      // 上限8時間。押しっぱなしで壊れないように
const RING_TIMES = 6;           // 既定の音（ピッピッピッ）を鳴らす回数
const RING_SEC = 10;            // 音を入れているときに鳴らす長さ（秒）。短ければ繰り返す

let timerState = "idle";        // "idle" 止まっている / "run" 動いている / "done" 鳴った
let timerMin   = TIMER_MIN_DEFAULT;
let timerEndAt = 0;             // 動いているとき、終わる時刻(ms)
let timerId    = 0;             // 表示更新の interval
let ringId     = 0;             // 鳴らしている interval
let ringLeft   = 0;

/* 残りミリ秒。止まっているときは、設定した長さそのもの */
function timerLeftMs(){
  if(timerState === "run") return Math.max(0, timerEndAt - Date.now());
  if(timerState === "done") return 0;
  return timerMin * 60000;
}
function timerText(){
  const s = Math.ceil(timerLeftMs() / 1000);
  return String(Math.floor(s / 60)).padStart(2,"0") + ":" + String(s % 60).padStart(2,"0");
}

/* ▼ 音は音声ファイルを持たずに、その場で作る。
   file:// でも動かないといけないし、外部ファイルを増やしたくないため。
   AudioContext は「ユーザーが押した」流れの中でしか鳴らせないので、
   始めるよ を押したときに作って起こしておく */
let actx = null;
function audioOn(){
  try{
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return null;
    if(!actx) actx = new AC();
    if(actx.state === "suspended") actx.resume();
    return actx;
  }catch(e){ return null; }
}
function beep(){
  const ac = audioOn(); if(!ac) return;
  try{
    const t0 = ac.currentTime;
    // ピッ・ピッ・ピッ と3回。1回だと聞き逃す
    [0, .24, .48].forEach(off => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(880, t0 + off);
      g.gain.setValueAtTime(.0001, t0 + off);
      g.gain.exponentialRampToValueAtTime(.28, t0 + off + .02);
      g.gain.exponentialRampToValueAtTime(.0001, t0 + off + .2);
      o.connect(g); g.connect(ac.destination);
      o.start(t0 + off); o.stop(t0 + off + .22);
    });
  }catch(e){ /* 音が出せない環境でも、タイマー自体は動かす */ }
}
/* ▼ 入れた音（S.timerSound）は、鳴らす前に AudioBuffer にしておく。
   鳴る瞬間に読み込みを始めると間に合わないので、始めるよ を押した時点で用意する */
let soundBuf = null;
let soundKey = "";              // どのデータから作ったバッファか。変わったら作り直す
let ringSrc = null, ringGain = null;

function dataUrlBytes(url){
  const bin = atob(String(url).split(",")[1] || "");
  const u8 = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}
async function primeSound(){
  const snd = S.timerSound;
  if(!snd){ soundBuf = null; soundKey = ""; return; }
  const key = (snd.at || 0) + ":" + snd.data.length;
  if(soundBuf && soundKey === key) return;
  const ac = audioOn(); if(!ac) return;
  try{
    // decodeAudioData は渡した ArrayBuffer を空にするので、毎回そのつど作る
    soundBuf = await ac.decodeAudioData(dataUrlBytes(snd.data));
    soundKey = key;
  }catch(e){
    soundBuf = null; soundKey = "";
  }
}
/* 入れた音を sec 秒ぶん鳴らす。鳴らせたら true（鳴らせなければ既定の音に落とす） */
function playSound(sec){
  const ac = audioOn();
  if(!ac || !soundBuf) return false;
  try{
    const t0 = ac.currentTime, end = t0 + sec;
    const src = ac.createBufferSource();
    src.buffer = soundBuf;
    src.loop = true;                        // 10秒に足りなければ繰り返す
    const g = ac.createGain();
    g.gain.setValueAtTime(1, t0);
    g.gain.setValueAtTime(1, Math.max(t0, end - .6));
    g.gain.linearRampToValueAtTime(.0001, end);   // 終わりをぶつっと切らない
    src.connect(g); g.connect(ac.destination);
    src.start(t0); src.stop(end + .05);
    ringSrc = src; ringGain = g;
    src.onended = ()=>{ if(ringSrc === src){ ringSrc = null; ringGain = null; } };
    return true;
  }catch(e){ return false; }
}
function stopRing(){
  if(ringId){ clearInterval(ringId); ringId = 0; }
  ringLeft = 0;
  if(ringSrc){
    // すぐ止めるとブツッと鳴るので、ごく短くしぼってから止める
    try{
      const ac = audioOn();
      if(ac && ringGain){
        ringGain.gain.cancelScheduledValues(ac.currentTime);
        ringGain.gain.setValueAtTime(ringGain.gain.value, ac.currentTime);
        ringGain.gain.linearRampToValueAtTime(.0001, ac.currentTime + .08);
      }
      ringSrc.stop((audioOn() ? audioOn().currentTime : 0) + .1);
    }catch(e){ try{ ringSrc.stop(); }catch(_){} }
    ringSrc = null; ringGain = null;
  }
}
function startRing(){
  stopRing();
  // 音を入れているなら10秒。入れていない（または読めなかった）なら既定のピッピッピッ
  if(playSound(RING_SEC)) return;
  beep();
  ringLeft = RING_TIMES - 1;
  ringId = setInterval(()=>{
    if(ringLeft <= 0){ stopRing(); return; }
    ringLeft--;
    beep();
  }, 1500);
}

function stopTicking(){ if(timerId){ clearInterval(timerId); timerId = 0; } }

function startTimer(){
  audioOn();                       // 押したこの流れの中で起こしておく（あとからでは鳴らない）
  primeSound();                    // 入れた音を先に読んでおく。鳴る瞬間では間に合わない
  timerEndAt = Date.now() + timerMin * 60000;
  timerState = "run";
  stopTicking();
  timerId = setInterval(tickTimer, 250);
  renderNow();
}
/* 止める＝設定した長さに戻す。一時停止は持たない（迷う操作を増やさない） */
function resetTimer(){
  stopRing(); stopTicking();
  timerState = "idle";
  timerEndAt = 0;
  renderNow();
}
function finishTimer(){
  stopTicking();
  timerState = "done";
  timerEndAt = 0;
  startRing();
  renderNow();
  toast(timerMin + "分たちました", { label:"音を止める", run: stopRing });
}
function tickTimer(){
  if(timerState !== "run") return;
  if(timerLeftMs() <= 0){ finishTimer(); return; }
  paintTimer();
}
/* 1秒ごとの書き換えは数字だけ。ここで renderNow() を呼ぶと、
   押そうとしていたボタンが毎秒作り直されて押せなくなる */
function paintTimer(){
  const el = $("timerTime");
  if(el) el.textContent = timerText();
}
/* ＋−。動いている最中も効く（終わる時刻をずらす）。残りは1分を下回らない */
function adjTimer(n){
  if(timerState === "run"){
    const left = Math.min(TIMER_MIN_MAX * 60000, Math.max(60000, timerLeftMs() + n * 60000));
    timerEndAt = Date.now() + left;
    paintTimer();
    return;
  }
  stopRing();
  timerState = "idle";
  timerMin = Math.min(TIMER_MIN_MAX, Math.max(1, timerMin + n));
  renderNow();
}

function timerHTML(){
  const run  = timerState === "run";
  const done = timerState === "done";
  return '<div class="timer' + (run ? " run" : "") + (done ? " done" : "") + '">' +
    '<button class="tadj" id="timerMinus" title="1分減らす">−</button>' +
    '<div class="ttime" id="timerTime">' + timerText() + '</div>' +
    '<button class="tadj" id="timerPlus" title="1分増やす">＋</button>' +
    (run
      ? '<button class="tgo off" id="timerGo">やめる</button>'
      : done
        ? '<button class="tgo" id="timerGo">もう一回</button>'
        : '<button class="tgo" id="timerGo">始めるよ</button>') +
    '<span class="tnote">' +
      (done ? "時間になりました" : run ? "1分ずつ増減できます" : "1箱ぶん＝30分。＋−で1分ずつ") +
    '</span>' +
    (done ? '<button class="tquiet" id="timerQuiet">音を止める</button>' : '') +
  '</div>';
}
function bindTimer(){
  if(!$("timerGo")) return;
  $("timerGo").onclick    = ()=> (timerState === "run" ? resetTimer() : startTimer());
  $("timerMinus").onclick = ()=> adjTimer(-1);
  $("timerPlus").onclick  = ()=> adjTimer(1);
  if($("timerQuiet")) $("timerQuiet").onclick = ()=>{ stopRing(); toast("音を止めました"); };
}

/* ================= 描画：いま、これ ================= */
function renderNow(){
  const el = $("nowCard");
  const d = getDay();
  const g = currentGroup();
  const img = dayImage();

  // やり切ったら、箱の背景にあった画像がここへ移ってはっきり出る
  el.className = "now";
  el.style.backgroundImage = "";
  if(img && !g && dayFinished(d)){
    el.classList.add("reward");
    el.style.backgroundImage = 'url("' + img.data + '")';
  }

  if(!g){
    let msg;
    if(d.count === 0)              msg = "今日は箱がありません。\n右上の ＋ で足せます。";
    else if(dayFinished(d))        msg = "箱を使い切りました。今日は終了。\n" + SLEEP_LINE;
    else if(emptyBoxes(d) === d.count) msg = "箱にやりたいことを入れてください。\n右の一覧からクリックで入ります。";
    else                           msg = "入れたぶんは終わりました。\n空き箱にまだ入れられます。";
    el.innerHTML =
      '<div class="label">いま、これ</div>' +
      '<div class="empty">' + esc(msg) + '</div>' +
      timerHTML();
    bindTimer();
    return;
  }

  const t = taskById(g.id);
  const size = g.to - g.from + 1;
  const st = t.freq.unit === "once" ? null : statOf(t);
  const w = whenOf(t);
  const parts = [];
  parts.push("箱 " + (g.from+1) + (size > 1 ? "–" + (g.to+1) : "") + "（" + boxTime(size) + "）");
  if(w !== "any") parts.push(SLOT[w].icon + SLOT[w].label);
  parts.push(t.freq.unit === "once"
    ? (goalOf(t) > 1 ? "単発 " + doneCount(t) + "/" + goalOf(t) : "単発のやりたいこと")
    : freqLabel(t.freq) + ' ・ ' + st.period.label + ' ' + st.actual + '/' + st.count +
      (st.remainDays ? '（残り' + st.remainDays + '日）' : ''));
  const ls = linksOf(t);
  if(ls.length) parts.push(linkSummary(t));

  const title = ls.length
    ? '<a href="' + esc((ls.find(l => l.kind === "url") || {}).url || "#") + '" data-act="openall" data-task-id="' +
      esc(t.id) + '" rel="noopener noreferrer">' + esc(t.text) + ' <span style="font-size:18px">🔗</span></a>'
    : esc(t.text);

  el.innerHTML =
    '<div class="label">いま、これ</div>' +
    '<div class="txt">' + title + '</div>' +
    '<div class="sub">' + esc(parts.join(" ・ ")) + '</div>' +
    '<div class="btnrow">' +
      '<button id="nowDone">' + (t.freq.unit === "once" ? "できた" : "やった") + '</button>' +
      (ls.length ? '<button class="open" id="nowOpen">' + (ls.length > 1 ? ls.length + "件ひらく" : "開く") + '</button>' : '') +
      (needsBat(t) ? '<button class="open" id="nowBat" title="Chrome指定やPCのアプリは、この起動ファイルからでないと開けません">起動ファイル</button>' : '') +
      '<button class="skip" id="nowNext">次の箱へ</button>' +
      (canSkip(t) ? '<button class="skip" id="nowSkip">今日はやらない</button>' : '') +
    '</div>' +
    timerHTML() +
    '<div class="kbd">Space で完了 ／ N で次の箱へ</div>';

  bindTimer();
  $("nowDone").onclick = ()=> doTask(t.id);
  $("nowNext").onclick = ()=> moveCursor(1);
  if($("nowOpen")) $("nowOpen").onclick = ()=> openTask(t.id);
  if($("nowBat"))  $("nowBat").onclick  = ()=> exportBat(t);
  if($("nowSkip")) $("nowSkip").onclick = ()=> skipToday(t.id);
}

/* ================= 描画：今日の箱の列 =================
   ▼ 2026-08-15 に「残り○箱」の帯（#boxBar）をやめて、この中に畳んだ。
     平日／休みの切り替えは見出しの右、箱の ＋− は最後の箱の下（.bfoot）。
     どちらも描き直すたびに作り直すので、onclick は毎回つけ直すこと */
function renderBoxes(){
  const d = getDay();
  const cur = currentGroup();
  const el = $("boxList");

  // 画像は箱に隠れていて、終わった箱から透けてくる。やり切ったら「いま、これ」へ移る
  const img = dayImage();
  const showHere = img && !dayFinished(d) && d.count > 0;
  el.className = "boxarea" + (showHere ? " has-img" : "");
  el.style.backgroundImage = showHere ? 'url("' + img.data + '")' : "";

  const rest = remainBoxes(d), empty = emptyBoxes(d);
  const filled = d.slots.filter(x => x !== null).length;   // やりたいことが入っている箱
  const restCls = rest === 0 ? " zero" : (rest <= 2 ? " low" : "");
  const head =
    '<div class="bhead">' +
      '<h2>今日の箱（1箱 ＝ 30分）</h2>' +
      (d.count ? '<span class="bcount' + restCls + '">残り <b>' + rest + '</b> ・ 空き ' + empty + '</span>' : '') +
      '<div class="sp"></div>' +
      (showHere ? '<span class="bhint">終わった箱から見えてきます</span>' : '') +
      (dayFinished(d) ? '<span class="bend">今日は終了</span>' : '') +
      '<button class="daytype' + (d.holiday ? " off" : "") + '" id="dayType" ' +
        'title="平日／休みを切り替える">' + (d.holiday ? "休み" : "平日") + '</button>' +
    '</div>';
  // 箱が0でも ＋ は出す。出さないと、減らし切ったあと増やせなくなる
  const foot =
    '<div class="bfoot">' +
      '<button id="boxMinus" title="箱を1つ減らす（-）">−</button>' +
      '<span class="bfnote">空き ' + empty + ' 箱（' + boxTime(empty) + '）' +
        ' ・ 埋まった箱 ' + filled + ' 個（' + boxTime(filled) + '）</span>' +
      '<button id="boxPlus" title="箱を1つ増やす（+）">＋</button>' +
    '</div>';
  // 関数をそのまま渡すと click イベントが日付キーとして流れ込む。必ず包むこと
  const wire = ()=>{
    $("boxPlus").onclick  = ()=> addBox();
    $("boxMinus").onclick = ()=> removeBox();
    $("dayType").onclick  = ()=> setDayType(!getDay().holiday);
  };

  if(d.count === 0){
    el.innerHTML = head + '<div class="allclear"><span class="big">📦</span>今日は箱がありません。</div>' + foot;
    wire();
    return;
  }
  const key = dayKey();
  const rows = boxGroups(d).map(g => {
    const no = (g.from+1) + (g.to > g.from ? "–" + (g.to+1) : "");
    // 時刻はちょうど◯時のところだけ。箱は順番だけを持つので、これは目安
    const clock = isClockMark(key, g.from) ? '<span class="bclock">' + boxClock(key, g.from) + '</span>' : '';
    if(!g.id){
      return '<div class="boxrow empty" data-i="' + g.from + '">' + clock +
        '<span class="bi">' + no + '</span>' +
        '<div class="bt">空き　（右からドラッグして入れる）</div>' +
      '</div>';
    }
    const t = taskById(g.id);
    const size = g.to - g.from + 1;
    const done = doneOn(t);
    const isCur = cur && cur.from === g.from;
    const sub = [boxTime(size), freqLabel(t.freq)];
    if(whenOf(t) !== "any") sub.unshift(SLOT[whenOf(t)].icon + SLOT[whenOf(t)].label);
    return '<div class="boxrow' + (done ? " done" : "") + (isCur ? " current" : "") +
        (size > 1 ? " span2" : "") + '" data-id="' + t.id + '" data-i="' + g.from + '"' +
        (done ? "" : ' draggable="true"') + '>' + clock +
      '<span class="bi">' + no + '</span>' +
      '<button class="check' + (done ? " on" : "") + '" data-act="boxdo" title="完了">✓</button>' +
      '<div class="bt">' + esc(t.text) + '<div class="bs">' + esc(sub.join(" ・ ")) + '</div></div>' +
      (linksOf(t).length
        ? '<button class="iconbtn" data-act="openall" title="' + esc(linksOf(t).map(linkLabel).join(" / ")) + '">🔗' +
          (linksOf(t).length > 1 ? '<span class="badge">' + linksOf(t).length + '</span>' : '') + '</button>'
        : '') +
      (done
        ? '<button class="iconbtn" data-act="boxundo" title="取り消す">↩</button>'
        : '<button class="iconbtn" data-act="boxout" title="箱から出す">✕</button>') +
    '</div>';
  }).join("");

  el.innerHTML = head + rows +
    (dayFinished(d)
      ? '<div class="allclear"><span class="big">🌙</span>箱を使い切りました。今日は終了。<br>' +
        esc(SLEEP_LINE) + '<br>まだやるなら、下の ＋ で箱を足してください。</div>'
      : '') + foot;
  wire();
}
$("boxList").addEventListener("click", e => {
  const btn = e.target.closest("[data-act]"); if(!btn) return;
  const row = e.target.closest(".boxrow"); if(!row || !row.dataset.id) return;
  const id = row.dataset.id;
  if(btn.dataset.act === "boxdo")   doTask(id);
  if(btn.dataset.act === "boxout")  unplace(id);
  if(btn.dataset.act === "boxundo") undoToday(id);
});

/* ================= ドラッグで箱に入れる ================= */
let dragId = null;
function dragStart(e){
  const row = e.target.closest("[data-id]"); if(!row) return;
  dragId = row.dataset.id;
  try{ e.dataTransfer.setData("text/plain", dragId); }catch(_){}
  // 箱へは move、ルーレットへは copy。どちらも許すこと（片方だけだと drop が起きない）
  e.dataTransfer.effectAllowed = "copyMove";
  row.classList.add("dragging");
}
function dragEnd(){
  dragId = null;
  document.querySelectorAll(".dragging").forEach(x => x.classList.remove("dragging"));
  document.querySelectorAll(".over").forEach(x => x.classList.remove("over"));
}
function draggedId(e){
  if(dragId) return dragId;
  try{ return e.dataTransfer.getData("text/plain"); }catch(_){ return ""; }
}
document.addEventListener("dragend", dragEnd);

$("boxList").addEventListener("dragstart", dragStart);
$("boxList").addEventListener("dragover", e => {
  const row = e.target.closest(".boxrow"); if(!row) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".boxrow.over").forEach(x => x.classList.remove("over"));
  row.classList.add("over");
});
$("boxList").addEventListener("dragleave", e => {
  const row = e.target.closest(".boxrow");
  if(row && !row.contains(e.relatedTarget)) row.classList.remove("over");
});
$("boxList").addEventListener("drop", e => {
  e.preventDefault();
  const row = e.target.closest(".boxrow");
  const id = draggedId(e);
  dragEnd();
  if(!row || !id || !taskById(id)) return;
  placeTaskAt(id, parseInt(row.dataset.i, 10) || 0);
});

/* ================= 1週間ページ =================
   週は日曜はじまり。今週と来週を切り替えて見る。
   やりたいことリストからドラッグして、どの日の箱にも入れられる
============================================== */
let weekAnchor = "";     // 見ている週の中の1日。空なら今週
const weekKeyNow = () => weekAnchor || dayKey();
const isNextWeek = () => weekStartKey(weekKeyNow()) !== weekStartKey(dayKey());

function renderWeek(){
  const el = $("weekWrap"); if(!el) return;
  const key = weekKeyNow();
  ensureWeek(key);
  const days = weekDays(key);
  const today = dayKey();

  // 衝突は勝手に直さない。何が置けなかったかを知らせて、本人に直してもらう
  const conf = pendingConflicts(days);
  const alertHtml = !conf.length ? "" :
    '<div class="wkalert"><b>置けなかった予定があります。</b>箱を増やすか、時間をずらしてください。' +
      conf.map(c => '<div>' + esc(dayLabel(c.key)) + '：' +
        esc(c.list.map(x => x.text + "（" + x.time + "・" + x.why + "）").join(" / ")) + '</div>').join("") +
      '<button class="btn ghost" id="wkAlertOk">わかった</button></div>';

  const head =
    '<div class="wkhead">' +
      '<div class="wktabs">' +
        '<button class="wktab' + (isNextWeek() ? "" : " on") + '" data-week="this">今週</button>' +
        '<button class="wktab' + (isNextWeek() ? " on" : "") + '" data-week="next">来週</button>' +
      '</div>' +
      '<div class="wkrange">' + esc(dayLabel(days[0]) + " 〜 " + dayLabel(days[6])) + '</div>' +
    '</div>';

  const cols = days.map(k => {
    const d = getDay(k);
    const past = k < today;
    const isToday = k === today;
    const ds = dayStart(k);
    const rows = boxGroups(d).map(g => {
      const no = (g.from+1) + (g.to > g.from ? "–" + (g.to+1) : "");
      const mark = isClockMark(k, g.from) ? '<span class="wkclock">' + boxClock(k, g.from) + '</span>' : '';
      if(!g.id){
        return '<div class="wkbox empty" data-i="' + g.from + '" data-day="' + k + '">' +
          mark + '<span class="wkno">' + no + '</span></div>';
      }
      const t = taskById(g.id);
      const done = doneOn(t, k);
      return '<div class="wkbox' + (done ? " done" : "") + '" data-i="' + g.from + '" data-day="' + k +
          '" data-id="' + t.id + '"' + (past || done ? "" : ' draggable="true"') + '>' +
        mark + '<span class="wkno">' + no + '</span>' +
        '<span class="wktxt">' + esc(t.text) + '</span>' +
        (past || done ? '' : '<button class="wkx" data-act="wkout" title="箱から出す">✕</button>') +
      '</div>';
    }).join("");

    return '<div class="wkcol' + (isToday ? " today" : "") + (past ? " past" : "") + '" data-day="' + k + '">' +
      '<div class="wkday">' +
        '<span class="wkdn">' + WD[ds.getDay()] + '</span>' +
        '<span class="wkdd">' + (ds.getMonth()+1) + '/' + ds.getDate() + '</span>' +
        (isToday ? '<span class="wktoday">今日</span>' : '') +
      '</div>' +
      '<div class="wkbtns">' +
        '<button class="wktype' + (d.holiday ? " off" : "") + '" data-act="wktype" data-day="' + k + '">' +
          (d.holiday ? "休み" : "仕事") + '</button>' +
        '<button data-act="wkminus" data-day="' + k + '" title="箱を減らす">−</button>' +
        '<span class="wkcnt">' + d.count + '</span>' +
        '<button data-act="wkplus" data-day="' + k + '" title="箱を増やす">＋</button>' +
      '</div>' +
      '<div class="wkboxes">' + (d.count ? rows : '<div class="wknone">箱なし</div>') + '</div>' +
    '</div>';
  }).join("");

  el.innerHTML = alertHtml + head + '<div class="wkgrid">' + cols + '</div>';
  if($("wkAlertOk")) $("wkAlertOk").onclick = ()=>{ clearConflicts(days); renderWeek(); };
  el.querySelectorAll(".wktab").forEach(b => b.onclick = ()=>{
    weekAnchor = b.dataset.week === "next" ? nextWeekKey(dayKey()) : "";
    renderWeek(); renderWeekSide();
  });
}
/* 1週間ページの一番上。ここからドラッグして、どの日の箱にも入れる。
   画面をスクロールしても、この帯は上に貼り付いたままになる */
function renderWeekSide(){
  const el = $("weekSide"); if(!el) return;
  const key = weekKeyNow();
  const list = S.tasks
    .map(t => {
      if(isDone(t)) return null;
      if(t.remindAt && t.remindAt > dayKey()) return null;
      const left = remainingToPlan(t, key);
      return left > 0 ? { t, left } : null;
    })
    .filter(Boolean);

  const body = !list.length
    ? '<div class="empty-note" style="padding:4px 2px">この週に置くものは、もうありません。</div>'
    : '<div class="wksidelist">' + list.map(o => {
        const t = o.t;
        const sub = [t.size > 1 ? t.size + "箱" : "1箱"];
        sub.push(t.freq.unit === "once" ? "単発" : freqLabel(t.freq));
        if(t.fixed) sub.push(fixedLabel(t));
        const ovr = t.freq.unit === "week" && hasOverride(t, key);
        // ▼ 名前と下の行は1行で打ち切る（CSS の .nm / .s）。ここが折り返すと丈が揃わず、
        //   2段に収めた枠から溢れる。全部読みたいときのために title で出しておく
        const full = t.text + "（あと" + o.left + "回 ・ " + sub.join(" ・ ") + "）";
        return '<div class="item" data-id="' + t.id + '" draggable="true" title="' + esc(full) + '">' +
          '<span class="grip" title="ドラッグして箱へ">⠿</span>' +
          '<div class="grow">' +
            '<div class="nm">' + esc(t.text) + '</div>' +
            '<div class="s">あと' + o.left + '回 ・ ' + esc(sub.join(" ・ ")) + '</div>' +
          '</div>' +
          (t.freq.unit === "week"
            ? '<span class="wkov' + (ovr ? " on" : "") + '">' +
                '<button data-act="ovminus" title="今週だけ1回減らす">−</button>' +
                '<b>' + countFor(t, key) + '</b>' +
                '<button data-act="ovplus" title="今週だけ1回増やす">＋</button>' +
              '</span>'
            : '') +
        '</div>';
      }).join("") + '</div>';

  el.innerHTML =
    '<div class="panel">' +
      '<div class="ph">' +
        '<span>この週に置くもの</span>' +
        '<span class="cnt">' + list.length + ' 件</span>' +
        '<span class="tip">下の箱へドラッグ ・ <b>週に何回</b>のものは ＋− で' +
          (isNextWeek() ? "来週" : "今週") + 'だけ回数を変えられます（翌週はもとに戻ります）</span>' +
      '</div>' +
      body +
    '</div>';
}

/* 1週間ページの操作。日付は data-day で持ち回る */
$("weekWrap").addEventListener("click", e => {
  const btn = e.target.closest("[data-act]"); if(!btn) return;
  const k = btn.dataset.day || (e.target.closest("[data-day]") || {}).dataset?.day;
  if(!k) return;
  const act = btn.dataset.act;
  if(act === "wktype")  { setDayType(!getDay(k).holiday, k); return; }
  if(act === "wkplus")  { addBox(k); return; }
  if(act === "wkminus") { removeBox(k); return; }
  if(act === "wkout"){
    const row = e.target.closest(".wkbox");
    if(row && row.dataset.id) unplace(row.dataset.id, k);
  }
});
$("weekSide").addEventListener("click", e => {
  const btn = e.target.closest("[data-act]"); if(!btn) return;
  const row = e.target.closest(".item"); if(!row) return;
  const id = row.dataset.id, t = taskById(id); if(!t) return;
  const key = weekKeyNow();
  const act = btn.dataset.act;
  if(act === "ovplus" || act === "ovminus"){
    setWeekOverride(id, key, countFor(t, key) + (act === "ovplus" ? 1 : -1));
    renderAll();
    toast((isNextWeek() ? "来週" : "今週") + "だけ " + countFor(t, key) + " 回にした");
  }
});
$("weekSide").addEventListener("dragstart", dragStart);
$("weekWrap").addEventListener("dragstart", dragStart);
$("weekWrap").addEventListener("dragover", e => {
  const b = e.target.closest(".wkbox"); if(!b) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".wkbox.over").forEach(x => x.classList.remove("over"));
  b.classList.add("over");
});
$("weekWrap").addEventListener("dragleave", e => {
  const b = e.target.closest(".wkbox");
  if(b && !b.contains(e.relatedTarget)) b.classList.remove("over");
});
$("weekWrap").addEventListener("drop", e => {
  e.preventDefault();
  const b = e.target.closest(".wkbox");
  const id = draggedId(e);
  dragEnd();
  if(!b || !id || !taskById(id)) return;
  const k = b.dataset.day;
  if(k < dayKey()){ toast("過ぎた日には入れられません"); return; }
  placeTaskAt(id, parseInt(b.dataset.i, 10) || 0, k);
});

/* ================= 描画：箱に入れていないやりたいこと ================= */
function renderUnplaced(){
  const list = unplacedTasks();
  const d = getDay();
  if(!S.tasks.length){
    $("unplaced").innerHTML =
      '<div class="panel"><div class="ph"><span>箱に入れていないやりたいこと</span></div>' +
      '<div class="empty-note">まだやりたいことがありません。「やりたいこと」タブから追加してください。</div></div>';
    return;
  }
  const body = !list.length
    ? '<div class="empty-note">今日のやりたいことは、全部箱に入っています。</div>'
    : list.map(o => {
        const t = o.t, st = o.st;
        const late = o.urgency >= 4;
        const sub = [];
        if(whenOf(t) !== "any") sub.push(SLOT[whenOf(t)].icon + SLOT[whenOf(t)].label);
        sub.push(t.size > 1 ? t.size + "箱" : "1箱");
        sub.push(t.freq.unit === "once"
          ? (goalOf(t) > 1 ? "単発 " + doneCount(t) + "/" + goalOf(t) : "単発")
          : freqLabel(t.freq) + ' ' + st.actual + '/' + st.count + (st.remainDays ? '（残' + st.remainDays + '日）' : ''));
        return '<div class="item" data-id="' + t.id + '" draggable="true">' +
          '<span class="grip" title="ドラッグして箱かルーレットへ">⠿</span>' +
          '<div class="grow">' + taskTitle(t) + '<div class="s">' + esc(sub.join(" ・ ")) + '</div></div>' +
          (late ? '<span class="tag late">遅れ</span>' : '') +
          (canSkip(t) ? '<button class="iconbtn" data-act="skip" title="今日はやらない">⏭</button>' : '') +
        '</div>';
      }).join("");

  $("unplaced").innerHTML =
    '<div class="panel">' +
      '<div class="ph"><span>箱に入れていないやりたいこと</span><span class="cnt">' +
        list.length + ' 件 ・ 空き ' + emptyBoxes(d) + ' 箱</span></div>' +
      body +
      (list.length ? '<div class="empty-note" style="padding:10px 2px 0">左の箱か、下のルーレットへドラッグ。</div>' : '') +
    '</div>';
}
$("unplaced").addEventListener("click", e => {
  const btn = e.target.closest("[data-act]"); if(!btn) return;
  const row = e.target.closest(".item"); if(!row) return;
  if(btn.dataset.act === "skip") skipToday(row.dataset.id);
});
$("unplaced").addEventListener("dragstart", dragStart);

/* ================= 描画：ルーティーン ================= */
function routinesNow(){
  const s = nowSlot();
  return S.routines.filter(r => r.slot === s);
}
const routineDoneIds = () => S.routineDone[dayKey()] || [];
function toggleRoutine(id){
  const k = dayKey();
  const arr = S.routineDone[k] = S.routineDone[k] || [];
  const i = arr.indexOf(id);
  if(i >= 0) arr.splice(i, 1); else arr.push(id);
  save(); renderRoutines();
}
function renderRoutines(){
  const list = routinesNow();
  const s = nowSlot();
  if(!list.length){
    $("routineBox").innerHTML =
      '<div class="panel"><div class="ph"><span>' + SLOT[s].icon + ' ' + SLOT[s].label + 'のルーティーン</span></div>' +
      '<div class="empty-note">「やりたいこと」タブの下から登録できます。箱は消費しません。</div></div>';
    return;
  }
  const done = routineDoneIds();
  $("routineBox").innerHTML =
    '<div class="panel">' +
      '<div class="ph"><span>' + SLOT[s].icon + ' ' + SLOT[s].label + 'のルーティーン</span>' +
        '<span class="cnt">' + list.filter(r => done.includes(r.id)).length + '/' + list.length + '</span></div>' +
      list.map(r => {
        const on = done.includes(r.id);
        return '<div class="routine' + (on ? " on" : "") + '" data-id="' + r.id + '">' +
          '<button class="check' + (on ? " on" : "") + '" data-act="rt">✓</button>' +
          '<div class="rt">' + esc(r.text) + '</div>' +
        '</div>';
      }).join("") +
    '</div>';
}
$("routineBox").addEventListener("click", e => {
  const btn = e.target.closest("[data-act]"); if(!btn) return;
  const row = e.target.closest(".routine"); if(!row) return;
  toggleRoutine(row.dataset.id);
});

/* ================= ルーレット =================
   決めるのが面倒なとき用。ドラッグで候補を入れて、回して1つ選ぶ
============================================================ */
let spinning = false;
let winner = null;      // 選ばれたやりたいことのid（保存しない。その場かぎり）

function addToRoulette(id){
  const d = getDay();
  if(!taskById(id)) return;
  if(d.roulette.includes(id)){ toast("すでに入っています"); return; }
  d.roulette.push(id);
  save(); renderRoulette(); toast("ルーレットに追加");
}
function removeFromRoulette(id){
  const d = getDay();
  const i = d.roulette.indexOf(id);
  if(i < 0) return;
  d.roulette.splice(i, 1);
  if(winner === id) winner = null;
  save(); renderRoulette();
}
function spinRoulette(){
  if(spinning) return;
  const ids = getDay().roulette.filter(id => taskById(id));
  if(ids.length < 2){ toast("2つ以上入れてから回してください"); return; }
  spinning = true; winner = null;
  renderRoulette();
  const face = $("spinFace");
  let i = Math.floor(Math.random() * ids.length), t = 0, wait = 55;
  const step = ()=>{
    if(!face.isConnected){ spinning = false; return; }
    face.textContent = taskById(ids[i % ids.length]).text;
    i++; t += wait;
    if(t < 1500){
      if(t > 950) wait += 22;                 // 終わりに向けてゆっくりに
      setTimeout(step, wait);
    } else {
      winner = ids[Math.floor(Math.random() * ids.length)];
      spinning = false;
      renderRoulette();
    }
  };
  step();
}
function renderRoulette(){
  if(spinning && $("spinFace")) return;        // 回転中は組み替えない
  const d = getDay();
  const ids = d.roulette.filter(id => taskById(id));
  const cands = ids.map(id => {
    const t = taskById(id);
    return '<div class="cand" data-id="' + id + '">' +
      '<div class="cn">' + esc(t.text) + '</div>' +
      '<span class="s">' + boxTime(t.size) + '</span>' +
      '<button class="iconbtn" data-act="rout" title="外す">✕</button>' +
    '</div>';
  }).join("");

  const w = winner && taskById(winner);
  const face = spinning
    ? '<div class="face spin" id="spinFace">…</div>'
    : (w ? '<div class="face won" id="spinFace">' + esc(w.text) + '</div>' : '');

  $("rouletteBox").innerHTML =
    '<div class="panel roulette">' +
      '<div class="ph"><span>🎲 ルーレット</span><span class="cnt">' + ids.length + ' 件</span></div>' +
      '<div class="drop" id="rouDrop">' +
        (ids.length ? 'ここにドラッグして候補を足す' : '決められないときは、ここにやりたいことをドラッグ') +
      '</div>' +
      cands + face +
      (ids.length >= 2
        ? '<button class="spinbtn" id="spinBtn"' + (spinning ? ' disabled' : '') + '>' +
            (spinning ? '回っています…' : '回す') + '</button>'
        : '') +
      (w && !spinning
        ? '<div class="wonrow">' +
            '<button class="btn" data-act="rwin">これを箱に入れる</button>' +
            '<button class="btn ghost" data-act="rspin">もう一回</button>' +
          '</div>'
        : '') +
    '</div>';
  if($("spinBtn")) $("spinBtn").onclick = spinRoulette;
}
$("rouletteBox").addEventListener("click", e => {
  const btn = e.target.closest("[data-act]"); if(!btn) return;
  const act = btn.dataset.act;
  if(act === "rout"){ removeFromRoulette(e.target.closest(".cand").dataset.id); return; }
  if(act === "rspin"){ spinRoulette(); return; }
  if(act === "rwin" && winner){
    const id = winner;
    placeTask(id);
    if(getDay().slots.includes(id)){ removeFromRoulette(id); renderAll(); }
  }
});
$("rouletteBox").addEventListener("dragover", e => {
  const z = e.target.closest(".roulette"); if(!z) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  const drop = $("rouDrop"); if(drop) drop.classList.add("over");
});
$("rouletteBox").addEventListener("dragleave", e => {
  if(!e.target.closest(".roulette")) return;
  const drop = $("rouDrop"); if(drop) drop.classList.remove("over");
});
$("rouletteBox").addEventListener("drop", e => {
  e.preventDefault();
  const id = draggedId(e);
  dragEnd();
  const drop = $("rouDrop"); if(drop) drop.classList.remove("over");
  if(id && taskById(id)) addToRoulette(id);
});

/* ================= 完了したときの一言（ドーン） ================= */
let cheerTimer, cheerOut;
function cheer(){
  if(!S.cheers.length) return;
  const el = $("cheer");
  $("cheerText").textContent = S.cheers[Math.floor(Math.random() * S.cheers.length)].text;
  clearTimeout(cheerTimer); clearTimeout(cheerOut);
  el.classList.remove("out");
  el.classList.add("on");
  // 取り消しの邪魔をしないよう、すぐ引っこめる
  cheerTimer = setTimeout(()=>{
    el.classList.add("out");
    cheerOut = setTimeout(()=> el.classList.remove("on", "out"), 350);
  }, 1100);
}

/* ================= 描画：見送り / 今日やったこと ================= */
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
function renderDoneToday(){
  const el = $("doneToday");
  const from = dayStartTs();
  const done = S.tasks.filter(t => doneOn(t));
  if(!done.length){ el.innerHTML = ""; return; }
  el.innerHTML =
    '<button class="fold" id="foldDone">' + (S.foldDone ? "▸" : "▾") + ' 今日やったこと ' + done.length + ' 件</button>' +
    (S.foldDone ? "" : done.map(t => {
      const n = t.freq.unit === "once" ? 1 : (t.log || []).filter(ts => ts >= from).length;
      const a = (t.actuals || []).filter(x => x.ts >= from).pop();
      // 実績（実際に何箱かかったか）は任意入力。空のままでよい
      const act = a
        ? '<span class="s">実績</span>' +
          '<input class="actin" type="number" min="1" max="16" data-act="actual" ' +
            'value="' + (a.actual == null ? "" : a.actual) + '" placeholder="' + a.planned + '" title="実際にかかった箱数（任意）">' +
          '<span class="s">箱</span>'
        : '';
      return '<div class="item done" data-id="' + t.id + '">' +
        '<button class="check on" data-act="undoToday" title="取り消す">✓</button>' +
        '<div class="grow"><div class="t">' + esc(t.text) + '</div></div>' +
        (n > 1 ? '<span class="tag freq">' + n + '回</span>' : '') + act +
        '<button class="iconbtn" data-act="undoToday" title="1回取り消す">↩</button>' +
      '</div>';
    }).join(""));
  $("foldDone").onclick = ()=>{ S.foldDone = !S.foldDone; save(); renderDoneToday(); };
}
/* 実績の入力（任意・飛ばしてよい） */
$("doneToday").addEventListener("change", e => {
  const inp = e.target.closest('[data-act="actual"]'); if(!inp) return;
  const id = e.target.closest(".item").dataset.id;
  const t = taskById(id); if(!t) return;
  const a = (t.actuals || []).filter(x => x.ts >= dayStartTs()).pop();
  if(!a) return;
  const v = parseInt(inp.value, 10);
  a.actual = (inp.value === "" || isNaN(v)) ? null : Math.min(16, Math.max(1, v));
  save();
  if(a.actual != null) toast("実績 " + a.actual + " 箱（" + boxTime(a.actual) + "）");
});
$("doneToday").addEventListener("click", e => {
  const btn = e.target.closest("[data-act]"); if(!btn || btn.dataset.act !== "undoToday") return;
  undoToday(e.target.closest(".item").dataset.id);
});
$("skippedList").addEventListener("click", e => {
  const btn = e.target.closest("[data-act]"); if(!btn || btn.dataset.act !== "unskip") return;
  unskip(e.target.closest(".item").dataset.id);
});

/* ================= やりたいこと追加フォーム ================= */
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
  line.style.display = "flex";
  // 単発も回数を持てる（期限なしの総回数。やり切ったら「達成したもの」へ）
  $("freqPre").textContent = { once:"全部で", day:"1日に", week:"1週間に", month:"1か月に", days:"" }[freqUnit];
  $("freqN").style.display   = freqUnit === "days" ? "" : "none";
  $("freqMid").style.display = freqUnit === "days" ? "" : "none";
}
$("taskSize").addEventListener("input", ()=>{
  const n = Math.min(16, Math.max(1, parseInt($("taskSize").value, 10) || 1));
  $("taskSizeNote").textContent = "箱 ＝ " + boxTime(n);
});
function addTask(){
  const v = $("taskInput").value.trim();
  if(!v) return;
  const count = Math.min(99, Math.max(1, parseInt($("freqCount").value, 10) || 1));
  let freq = { unit: "once" }, goal = 1;
  if(freqUnit === "once"){
    goal = count;                                        // 単発の総回数（期限なし）
  }else{
    const n = Math.min(365, Math.max(1, parseInt($("freqN").value, 10) || 1));
    freq = { unit: freqUnit, count };
    if(freqUnit === "days") freq.n = n;
  }
  const size = Math.min(16, Math.max(1, parseInt($("taskSize").value, 10) || 1));
  // ここでは1本だけ。2本目からは一覧の🔗ボタンで足す
  const first = normLink({ kind: "url", url: $("taskUrl").value });
  S.tasks.push({
    id: uid(), text: v, links: first ? [first] : [],
    when: taskWhen, freq, size, goal, fixed: null, remindAt: "",
    log: [], actuals: [], createdAt: Date.now()
  });
  $("taskInput").value = ""; $("taskUrl").value = "";
  save(); renderAll(); toast("追加しました（" + size + "箱）");
}
$("taskAdd").onclick = addTask;
$("taskInput").addEventListener("keydown", e => { if(e.key === "Enter") addTask(); });
$("taskUrl").addEventListener("keydown", e => { if(e.key === "Enter") addTask(); });

/* ================= やりたいこと一覧（「やりたいこと」タブ） ================= */
function whenBtn(t){
  const w = whenOf(t);
  return '<button class="iconbtn' + (w === "any" ? " faint" : "") + '" data-act="when" title="午前／午後の切り替え">' +
    (w === "any" ? "🕘" : SLOT[w].icon) + '</button>';
}
function cycleWhen(id){
  const t = taskById(id); if(!t) return;
  const order = ["any","am","pm"];
  t.when = order[(order.indexOf(whenOf(t)) + 1) % 3];
  save(); renderAll(); toast(SLOT[t.when].label + " に設定");
}
function sizeBox(t){
  return '<input class="sizein" type="number" min="1" max="16" value="' + t.size + '" data-act="size" title="必要な箱数">';
}
/* 実績の平均（溜まっていれば見せる。見せ方は今後詰める） */
function actualHint(t){
  const xs = (t.actuals || []).filter(a => typeof a.actual === "number");
  if(!xs.length) return "";
  const avg = xs.reduce((s,a) => s + a.actual, 0) / xs.length;
  return ' ・実績 平均' + (Math.round(avg*10)/10) + '箱';
}
const GROUPS = [
  { key:"once",  title:"単発のやりたいこと" },
  { key:"day",   title:"毎日" },
  { key:"week",  title:"今週" },
  { key:"month", title:"今月" },
  { key:"days",  title:"◯日ごと" }
];
function renderTasks(){
  const el = $("taskList");
  if(!S.tasks.length){ el.innerHTML = '<div class="empty-note">やりたいことはまだありません。</div>'; return; }
  const k = dayKey();
  const isFar = t => !!t.remindAt && t.remindAt > k;
  const far  = S.tasks.filter(t => isFar(t) && !isDone(t));
  const done = S.tasks.filter(isDone);
  const live = S.tasks.filter(t => !isDone(t) && !isFar(t));
  let html = "";
  GROUPS.forEach(g => {
    const list = live.filter(t => t.freq.unit === g.key);
    if(!list.length) return;
    html += '<h2>' + g.title + '</h2>' + list.map(t => g.key === "once" ? onceRow(t) : repeatRow(t)).join("");
  });
  // 遠い予定。その日が近づくまで、ふだんのリストには出さない
  if(far.length){
    html += '<h2>まだ先の予定（' + far.length + '）</h2>' +
      '<div class="empty-note" style="padding-top:0">その日が来るまで「やることリスト」には出ません。</div>' +
      far.map(farRow).join("");
  }
  if(done.length){
    html += '<h2>達成したもの（' + done.length + '）</h2>' + done.map(onceRow).join("");
  }
  el.innerHTML = html || '<div class="empty-note">やりたいことはまだありません。</div>';
}
function onceRow(t){
  const done = isDone(t);
  const goal = goalOf(t), n = doneCount(t);
  const prog = goal > 1
    ? '<div class="prog">' +
        '<div class="bar"><i class="' + (done ? "met" : "") + '" style="width:' +
          Math.round(Math.min(1, n/goal)*100) + '%"></i></div>' +
        '<span class="pmeta"><b>' + n + '/' + goal + '</b></span>' +
        (done ? '<span class="tag ok">達成</span>' : '') +
      '</div>'
    : "";
  return '<div class="item' + (done ? " done" : "") + '" data-id="' + t.id + '">' +
    '<button class="check' + (done ? " on" : (n > 0 ? " part" : "")) + '" data-act="toggle" title="' +
      (done ? "1回ぶん戻す" : "1回ぶん記録する") + '">' + (done ? "✓" : (goal > 1 && n > 0 ? n : "✓")) + '</button>' +
    '<div class="grow">' + taskTitle(t) + prog +
      '<div class="s">' + boxTime(t.size) + (goal > 1 ? ' ・ 全' + goal + '回' : '') + esc(actualHint(t)) +
        (linksOf(t).length ? ' ・ ' + esc(linkSummary(t)) : '') + '</div>' +
    '</div>' +
    sizeBox(t) +
    (done ? "" : '<button class="iconbtn" data-act="up" title="上へ">↑</button>') +
    (!done && n > 0 ? '<button class="iconbtn" data-act="undo" title="1回減らす">−</button>' : '') +
    whenBtn(t) + editBtn(t) + linkBtn(t) +
    '<button class="iconbtn del" data-act="del" title="削除">✕</button>' +
  '</div>';
}
/* まだ先の予定。リマインドの日が来るまでここに隠れている */
function farRow(t){
  return '<div class="item far" data-id="' + t.id + '">' +
    '<span class="grip" title="まだ先の予定">🕰</span>' +
    '<div class="grow">' + taskTitle(t) +
      '<div class="s">' + esc(t.remindAt) + ' から出てきます ・ ' + boxTime(t.size) + '</div>' +
    '</div>' +
    editBtn(t) + linkBtn(t) +
    '<button class="iconbtn del" data-act="del" title="削除">✕</button>' +
  '</div>';
}
function repeatRow(t){
  const st = statOf(t);
  // 「遅れ」は期間のあるもの（週/月/N日ごと）だけ。毎日は未実行なだけなので出さない
  const late = !st.met && st.deficit >= 1 && t.freq.unit !== "day";
  const streak = streakOf(t);
  const meta = '<b>' + st.actual + '/' + st.count + '</b>' +
    (st.remainDays ? ' ・残' + st.remainDays + '日' : '') +
    (streak > 1 ? ' ・🔥' + streak : '');
  return '<div class="item' + (st.met ? " met" : "") + '" data-id="' + t.id + '">' +
    '<button class="check' + (st.met ? " on" : (st.actual > 0 ? " part" : "")) + '" data-act="do">' +
      (st.met ? "✓" : (st.actual > 0 ? st.actual : "＋")) + '</button>' +
    '<div class="grow">' +
      taskTitle(t) +
      '<div class="prog">' +
        '<div class="bar"><i class="' + (st.met ? "met" : (late ? "late" : "")) + '" style="width:' + Math.round(st.ratio*100) + '%"></i></div>' +
        '<span class="pmeta">' + meta + '</span>' +
        (late ? '<span class="tag late">遅れ</span>' : (st.met ? '<span class="tag ok">達成</span>' : '')) +
      '</div>' +
      '<div class="s">' + esc(freqLabel(t.freq)) + ' ・ ' + esc(st.period.label) + ' ・ ' + boxTime(t.size) +
      (t.fixed ? ' ・ ' + esc(fixedLabel(t)) : '') + esc(actualHint(t)) + '</div>' +
    '</div>' +
    sizeBox(t) +
    (st.actual > 0 ? '<button class="iconbtn" data-act="undo" title="1回減らす">−</button>' : '') +
    whenBtn(t) + editBtn(t) + linkBtn(t) +
    '<button class="iconbtn del" data-act="del" title="削除">✕</button>' +
  '</div>';
}
function linkBtn(t){
  const n = linksOf(t).length;
  return '<button class="iconbtn' + (n ? "" : " faint") + '" data-act="link" title="リンクとアプリ">🔗' +
    (n > 1 ? '<span class="badge">' + n + '</span>' : '') + '</button>';
}
const editBtn = t => '<button class="iconbtn" data-act="edit" title="編集">✎</button>';
/* 曜日と時刻の見出し。dow が null なら毎日 */
function fixedLabel(t){
  if(!t.fixed) return "";
  return (t.fixed.dow === null ? "毎日" : "毎週" + WD[t.fixed.dow]) + " " + t.fixed.time;
}

/* ================= やりたいことの編集 =================
   名前・頻度・回数・箱数・午前午後・曜日と時刻・遠い予定を、あとから直せる。
   他の機能がどれも「後から直せること」を前提にしているので、これが全部の前提になる
====================================================== */
let edTaskId = "";
function openTaskEditor(id){
  const t = taskById(id); if(!t) return;
  edTaskId = id;
  const f = t.freq;
  const units = [
    ["once","単発"], ["day","毎日"], ["week","週に"], ["month","月に"], ["days","N日に"]
  ];
  const cnt = f.unit === "once" ? goalOf(t) : Math.max(1, f.count || 1);
  $("edBody").innerHTML =
    '<label class="edrow"><span>名前</span>' +
      '<input id="edText" autocomplete="off" value="' + esc(t.text) + '"></label>' +
    '<div class="edrow"><span>くり返し</span><div class="chips" id="edUnit">' +
      units.map(([u,l]) => '<button class="chip' + (f.unit === u ? " on" : "") + '" data-unit="' + u + '">' +
        l + '</button>').join("") + '</div></div>' +
    '<div class="edrow" id="edCountRow"><span id="edCountPre">回数</span>' +
      '<input type="number" id="edN" min="1" max="365" value="' + (f.n || 3) + '">' +
      '<span id="edMid">日に</span>' +
      '<input type="number" id="edCount" min="1" max="99" value="' + cnt + '"><span>回</span></div>' +
    '<label class="edrow"><span>必要な箱</span>' +
      '<input type="number" id="edSize" min="1" max="16" value="' + t.size + '">' +
      '<span class="fnote" id="edSizeNote">' + boxTime(t.size) + '</span></label>' +
    '<div class="edrow"><span>いつ</span><div class="chips" id="edWhen">' +
      [["any","いつでも"],["am","☀ 午前"],["pm","🌙 午後"]].map(([w,l]) =>
        '<button class="chip' + (whenOf(t) === w ? " on" : "") + '" data-when="' + w + '">' + l + '</button>'
      ).join("") + '</div></div>' +
    '<div class="edrow"><span>決まった時間</span>' +
      '<label class="edchk"><input type="checkbox" id="edFixOn"' + (t.fixed ? " checked" : "") + '> 決める</label>' +
      '<select id="edDow">' +
        '<option value="">毎日</option>' +
        WD.map((w,i) => '<option value="' + i + '">毎週' + w + '曜</option>').join("") +
      '</select>' +
      '<input type="time" id="edTime" value="' + esc((t.fixed && t.fixed.time) || "18:00") + '"></div>' +
    '<div class="empty-note" style="padding:0 2px 6px">' +
      '決めておくと、1週間ページでその日が作られたときに<b>自動で箱に入ります</b>。' +
      '入ったあとは自由に動かせます（アプリは置き直しません）。</div>' +
    '<label class="edrow"><span>まだ先の予定</span>' +
      '<input type="date" id="edRemind" value="' + esc(t.remindAt || "") + '">' +
      '<span class="fnote">この日まで隠す</span></label>';

  if(t.fixed && t.fixed.dow !== null) $("edDow").value = String(t.fixed.dow);
  $("edUnit").onclick = e => {
    const c = e.target.closest(".chip"); if(!c) return;
    $("edUnit").querySelectorAll(".chip").forEach(x => x.classList.toggle("on", x === c));
    syncEdCount();
  };
  $("edWhen").onclick = e => {
    const c = e.target.closest(".chip"); if(!c) return;
    $("edWhen").querySelectorAll(".chip").forEach(x => x.classList.toggle("on", x === c));
  };
  $("edSize").oninput = ()=>{
    const n = Math.min(16, Math.max(1, parseInt($("edSize").value, 10) || 1));
    $("edSizeNote").textContent = boxTime(n);
  };
  syncEdCount();
  $("edTitle").textContent = "「" + t.text + "」を直す";
  $("editModal").classList.add("on");
  setTimeout(()=> $("edText").focus(), 30);
}
function edUnitNow(){
  const on = $("edUnit").querySelector(".chip.on");
  return on ? on.dataset.unit : "once";
}
function syncEdCount(){
  const u = edUnitNow();
  $("edCountPre").textContent = { once:"全部で", day:"1日に", week:"1週間に", month:"1か月に", days:"" }[u];
  $("edN").style.display   = u === "days" ? "" : "none";
  $("edMid").style.display = u === "days" ? "" : "none";
}
function closeTaskEditor(){ $("editModal").classList.remove("on"); edTaskId = ""; }
function saveTaskEditor(){
  const t = taskById(edTaskId); if(!t){ closeTaskEditor(); return; }
  const text = $("edText").value.trim();
  if(!text){ toast("名前を入れてください"); return; }
  const u = edUnitNow();
  const count = Math.min(99, Math.max(1, parseInt($("edCount").value, 10) || 1));
  const n     = Math.min(365, Math.max(1, parseInt($("edN").value, 10) || 1));
  const size  = Math.min(16, Math.max(1, parseInt($("edSize").value, 10) || 1));
  const sizeChanged = size !== t.size;

  t.text = text;
  t.size = size;
  t.when = ($("edWhen").querySelector(".chip.on") || {}).dataset?.when || "any";
  if(u === "once"){ t.freq = { unit: "once" }; t.goal = count; }
  else{
    t.freq = { unit: u, count };
    if(u === "days") t.freq.n = n;
    t.goal = 1;
  }
  const wasFixed = t.fixed ? fixedLabel(t) : "";
  if($("edFixOn").checked){
    const dow = $("edDow").value;
    t.fixed = { dow: dow === "" ? null : parseInt(dow, 10), time: $("edTime").value || "18:00" };
  }else t.fixed = null;
  const fixChanged = (t.fixed ? fixedLabel(t) : "") !== wasFixed;
  const rm = $("edRemind").value;
  t.remindAt = /^\d{4}-\d{2}-\d{2}$/.test(rm) ? rm : "";

  // 箱の占有が変わったら入れ直してもらう
  if(sizeChanged) unplaceEverywhere(t.id);
  // 時間を決めた（変えた）ぶんは、もう作られている先の日にも入れる
  const put = (fixChanged && t.fixed) ? autoPlaceAhead(t.id) : 0;
  closeTaskEditor();
  save(); renderAll();
  toast("直しました" + (sizeChanged ? "／箱数が変わったので入れ直してください" : "") +
    (put ? "／" + put + "日ぶん箱に入れました" : ""));
}
$("edOk").onclick     = saveTaskEditor;
$("edCancel").onclick = closeTaskEditor;
$("editModal").onclick = e => { if(e.target === $("editModal")) closeTaskEditor(); };

/* ================= リンクとアプリの編集 =================
   1つのやりたいことに何本でも。並び順がそのまま開く順・.bat の実行順になる
====================================================== */
let lkTaskId = "";
let lkDraft = [];       // 編集中の行（保存を押すまで本体には触らない）

function openLinkEditor(id){
  const t = taskById(id); if(!t) return;
  lkTaskId = id;
  lkDraft = linksOf(t).map(l => Object.assign({}, l));
  $("lkTitle").textContent = "「" + t.text + "」を開くもの";
  renderLkRows();
  $("linkModal").classList.add("on");
  setTimeout(()=>{ const f = $("lkRows").querySelector("input"); if(f) f.focus(); }, 30);
}
function closeLinkEditor(){
  $("linkModal").classList.remove("on");
  lkTaskId = ""; lkDraft = [];
}
/* 画面の入力値を lkDraft に取り込む（行を足す・動かす前に必ず通すこと） */
function syncLkDraft(){
  $("lkRows").querySelectorAll(".lkrow").forEach(row => {
    const i = parseInt(row.dataset.i, 10);
    const d = lkDraft[i]; if(!d) return;
    const main = row.querySelector(".lkmain");
    if(d.kind === "url"){
      d.url = main.value;
      const sel = row.querySelector(".lkbrowser");
      if(sel) d.browser = sel.value;
    }else{
      d.path = main.value;
      const ar = row.querySelector(".lkargs");
      if(ar) d.args = ar.value;
    }
  });
}
function renderLkRows(){
  const el = $("lkRows");
  if(!lkDraft.length){
    el.innerHTML = '<div class="empty-note">まだ何も登録されていません。下のボタンで足してください。</div>';
    $("lkNote").innerHTML = lkHint();
    return;
  }
  el.innerHTML = lkDraft.map((d, i) => {
    const head = '<span class="lkno">' + (i+1) + '</span>' +
      '<span class="lkkind ' + d.kind + '">' + (d.kind === "url" ? "リンク" : "アプリ") + '</span>';
    const tail =
      '<button class="iconbtn" data-act="up" title="上へ">↑</button>' +
      '<button class="iconbtn" data-act="down" title="下へ">↓</button>' +
      '<button class="iconbtn del" data-act="del" title="この行を消す">✕</button>';
    if(d.kind === "url"){
      return '<div class="lkrow" data-i="' + i + '">' + head +
        '<input class="lkmain" value="' + esc(d.url || "") + '" placeholder="https://..." spellcheck="false">' +
        '<select class="lkbrowser" title="どのブラウザで開くか（起動ファイルからのときだけ効きます）">' +
          BROWSERS.map(b => '<option value="' + b.key + '"' + (b.key === (d.browser||"") ? " selected" : "") + '>' +
            esc(b.label) + '</option>').join("") +
        '</select>' + tail + '</div>';
    }
    return '<div class="lkrow" data-i="' + i + '">' + head +
      '<input class="lkmain" value="' + esc(d.path || "") + '" spellcheck="false" ' +
        'placeholder="C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe">' +
      '<input class="lkargs" value="' + esc(d.args || "") + '" placeholder="引数（任意）" spellcheck="false">' +
      tail + '</div>';
  }).join("");
  $("lkNote").innerHTML = lkHint();
}
function lkHint(){
  const bat = lkDraft.some(d => d.kind === "app" && !isScheme(String(d.path||"").trim())) ||
              lkDraft.some(d => d.kind === "url" && d.browser);
  return '上から順に開きます。' +
    (bat ? '<br><b>この組み合わせは「起動ファイル(.bat)」からでないと言ったとおりに開きません。</b>' +
           'ブラウザには exe を起動する手段も、開くブラウザを選ぶ手段もありません。' : '') +
    '<br>アプリ欄には <b>exe のパス</b>のほか、<b>steam://rungameid/…</b> や <b>discord://</b> のような' +
    '独自スキームも書けます。スキームならブラウザからそのまま起動できます。';
}
$("lkRows").addEventListener("click", e => {
  const btn = e.target.closest("[data-act]"); if(!btn) return;
  const row = e.target.closest(".lkrow"); if(!row) return;
  const i = parseInt(row.dataset.i, 10);
  syncLkDraft();
  const act = btn.dataset.act;
  if(act === "del")  lkDraft.splice(i, 1);
  if(act === "up"   && i > 0)                { const [x] = lkDraft.splice(i,1); lkDraft.splice(i-1, 0, x); }
  if(act === "down" && i < lkDraft.length-1) { const [x] = lkDraft.splice(i,1); lkDraft.splice(i+1, 0, x); }
  renderLkRows();
});
/* ブラウザ指定を変えたら、注意書きも変える */
$("lkRows").addEventListener("change", ()=>{ syncLkDraft(); $("lkNote").innerHTML = lkHint(); });

$("lkAddUrl").onclick = ()=>{ syncLkDraft(); lkDraft.push({ id: lid(), kind:"url", url:"", browser:"" }); renderLkRows();
  const rs = $("lkRows").querySelectorAll(".lkrow input.lkmain"); if(rs.length) rs[rs.length-1].focus(); };
$("lkAddApp").onclick = ()=>{ syncLkDraft(); lkDraft.push({ id: lid(), kind:"app", path:"", args:"" }); renderLkRows();
  const rs = $("lkRows").querySelectorAll(".lkrow input.lkmain"); if(rs.length) rs[rs.length-1].focus(); };
$("lkBat").onclick = ()=>{
  syncLkDraft();
  const t = taskById(lkTaskId); if(!t) return;
  const ls = lkDraft.map(normLink).filter(Boolean);
  if(!ls.length){ toast("先に開くものを入れてください"); return; }
  exportBat({ text: t.text, links: ls });
};
$("lkCancel").onclick = closeLinkEditor;
$("linkModal").onclick = e => { if(e.target === $("linkModal")) closeLinkEditor(); };
$("lkOk").onclick = ()=>{
  syncLkDraft();
  const t = taskById(lkTaskId);
  if(!t){ closeLinkEditor(); return; }
  const before = lkDraft.length;
  const ls = lkDraft.map(normLink).filter(Boolean);
  t.links = ls;
  const dropped = before - ls.length;
  closeLinkEditor();
  save(); renderAll();
  toast(ls.length ? ls.length + "件を設定しました" + (dropped ? "（空欄" + dropped + "件は捨てました）" : "")
                  : "リンクを外しました");
};
async function taskClick(e){
  const btn = e.target.closest("[data-act]"); if(!btn) return;
  if(btn.dataset.act === "size") return;           // 数値入力は change で扱う
  const row = e.target.closest(".item"); if(!row || !row.dataset.id) return;
  const id = row.dataset.id;
  const i = S.tasks.findIndex(t => t.id === id); if(i < 0) return;
  const act = btn.dataset.act, t = S.tasks[i];

  // 単発も log に積む。やり切っていれば1回ぶん戻す
  if(act === "toggle"){ isDone(t) ? undoDo(id) : doTask(id); return; }
  if(act === "do")   { doTask(id); return; }
  if(act === "undo") { undoDo(id); return; }
  if(act === "link") { openLinkEditor(id); return; }
  if(act === "edit") { openTaskEditor(id); return; }
  if(act === "when") { cycleWhen(id); return; }
  if(act === "up" && i > 0){ const [x] = S.tasks.splice(i,1); S.tasks.unshift(x); save(); renderAll(); return; }
  if(act === "del"){
    const ok = await askConfirm("「" + t.text + "」を削除しますか？", "削除",
      t.freq.unit === "once" ? "" : "これまでの記録もいっしょに消えます");
    if(!ok) return;
    const idx = S.tasks.findIndex(x => x.id === id);   // 待っている間にずれる可能性に備える
    if(idx < 0) return;
    const removed = S.tasks.splice(idx, 1)[0];
    unplaceSilent(id);
    save(); renderAll();
    toast("削除しました", ()=>{
      S.tasks.splice(idx, 0, removed);
      save(); renderAll(); toast("戻しました");
    });
  }
}
$("taskList").addEventListener("click", taskClick);
$("taskList").addEventListener("change", e => {
  const inp = e.target.closest('[data-act="size"]'); if(!inp) return;
  const id = e.target.closest(".item").dataset.id;
  const t = taskById(id); if(!t) return;
  const before = t.size;
  t.size = Math.min(16, Math.max(1, parseInt(inp.value, 10) || 1));
  if(t.size !== before && getDay().slots.includes(id)) unplaceSilent(id);   // 箱の占有が変わるので入れ直し
  save(); renderAll();
  toast(t.text + " は " + t.size + "箱（" + boxTime(t.size) + "）");
});

/* ================= ルーティーン管理（「やりたいこと」タブ） ================= */
let routineSlot = "am";
$("routineSlotChips").addEventListener("click", e => {
  const c = e.target.closest(".chip"); if(!c) return;
  routineSlot = c.dataset.slot;
  document.querySelectorAll("#routineSlotChips .chip").forEach(x => x.classList.toggle("on", x === c));
});
function addRoutine(){
  const v = $("routineInput").value.trim();
  if(!v) return;
  S.routines.push({ id: uid(), text: v, slot: routineSlot });
  $("routineInput").value = "";
  save(); renderAll(); toast(SLOT[routineSlot].label + "のルーティーンに追加");
}
$("routineAdd").onclick = addRoutine;
$("routineInput").addEventListener("keydown", e => { if(e.key === "Enter") addRoutine(); });

function renderRoutineList(){
  const el = $("routineList");
  if(!S.routines.length){ el.innerHTML = '<div class="empty-note">ルーティーンはまだありません。</div>'; return; }
  el.innerHTML = ["am","pm"].map(s => {
    const list = S.routines.filter(r => r.slot === s);
    if(!list.length) return "";
    return '<h2>' + SLOT[s].icon + ' ' + SLOT[s].label + '</h2>' + list.map(r =>
      '<div class="item" data-id="' + r.id + '">' +
        '<div class="grow"><div class="t">' + esc(r.text) + '</div></div>' +
        '<button class="iconbtn" data-act="rslot" title="午前／午後を入れ替え">⇅</button>' +
        '<button class="iconbtn del" data-act="rdel" title="削除">✕</button>' +
      '</div>').join("");
  }).join("");
}
$("routineList").addEventListener("click", async e => {
  const btn = e.target.closest("[data-act]"); if(!btn) return;
  const id = e.target.closest(".item").dataset.id;
  const i = S.routines.findIndex(r => r.id === id); if(i < 0) return;
  if(btn.dataset.act === "rslot"){
    S.routines[i].slot = S.routines[i].slot === "am" ? "pm" : "am";
    save(); renderAll(); toast(SLOT[S.routines[i].slot].label + " に移した");
    return;
  }
  if(btn.dataset.act === "rdel"){
    const ok = await askConfirm("このルーティーンを削除しますか？", "削除", S.routines[i].text);
    if(!ok) return;
    const idx = S.routines.findIndex(r => r.id === id); if(idx < 0) return;
    const removed = S.routines.splice(idx, 1)[0];
    save(); renderAll();
    toast("削除しました", ()=>{ S.routines.splice(idx, 0, removed); save(); renderAll(); toast("戻しました"); });
  }
});

/* ================= 哲学 ================= */
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
  if(btn.dataset.act === "pin"){ S.philoIdx = i; save(); renderAll(); toast("上に表示しました"); return; }
  if(btn.dataset.act === "del"){
    const ok = await askConfirm("この言葉を削除しますか？", "削除", S.philos[i].text);
    if(!ok) return;
    const idx = S.philos.findIndex(p => p.id === id); if(idx < 0) return;
    const removed = S.philos.splice(idx, 1)[0];
    if(S.philoIdx >= S.philos.length) S.philoIdx = 0;
    save(); renderAll();
    toast("削除しました", ()=>{ S.philos.splice(idx, 0, removed); save(); renderAll(); toast("戻しました"); });
  }
});

/* ================= やったときの一言 ================= */
function addCheer(){
  const v = $("cheerInput").value.trim();
  if(!v) return;
  S.cheers.push({ id: uid(), text: v });
  $("cheerInput").value = "";
  save(); renderAll(); cheer();          // その場で出して見せる
}
$("cheerAdd").onclick = addCheer;
$("cheerInput").addEventListener("keydown", e => { if(e.key === "Enter") addCheer(); });

function renderCheers(){
  const el = $("cheerList");
  if(!S.cheers.length){
    el.innerHTML = '<div class="empty-note">一言が無いときは、何も出ません。</div>';
    return;
  }
  el.innerHTML = S.cheers.map(c =>
    '<div class="item" data-id="' + c.id + '">' +
      '<div class="grow"><div class="t">' + esc(c.text) + '</div></div>' +
      '<button class="iconbtn" data-act="ctry" title="出してみる">▶</button>' +
      '<button class="iconbtn del" data-act="cdel" title="削除">✕</button>' +
    '</div>').join("");
}
$("cheerList").addEventListener("click", async e => {
  const btn = e.target.closest("[data-act]"); if(!btn) return;
  const id = e.target.closest(".item").dataset.id;
  const i = S.cheers.findIndex(c => c.id === id); if(i < 0) return;
  if(btn.dataset.act === "ctry"){
    $("cheerText").textContent = S.cheers[i].text;
    const el = $("cheer");
    el.classList.remove("out"); el.classList.add("on");
    setTimeout(()=>{ el.classList.add("out"); setTimeout(()=> el.classList.remove("on","out"), 350); }, 1100);
    return;
  }
  if(btn.dataset.act === "cdel"){
    const ok = await askConfirm("この一言を削除しますか？", "削除", S.cheers[i].text);
    if(!ok) return;
    const idx = S.cheers.findIndex(c => c.id === id); if(idx < 0) return;
    const removed = S.cheers.splice(idx, 1)[0];
    save(); renderAll();
    toast("削除しました", ()=>{ S.cheers.splice(idx, 0, removed); save(); renderAll(); toast("戻しました"); });
  }
});

/* 追加フォームの開閉 */
const ADD_LABEL = { philoForm: "＋ 言葉を追加", cheerForm: "＋ 一言を追加" };
function setForm(name, open){
  const b = document.querySelector('.addtoggle[data-form="' + name + '"]');
  $(name).style.display = open ? "" : "none";
  b.textContent = open ? "× 閉じる" : ADD_LABEL[name];
}
document.querySelectorAll(".addtoggle").forEach(b => b.onclick = ()=>{
  setForm(b.dataset.form, $(b.dataset.form).style.display === "none");
});

/* ================= 日記 =================
   ▼ 本体（S / KEY）とは別のキーに保存している。理由は3つあって、どれも大事：
     1. days の 180日 prune() に巻き込まれない。日記は何年でも残すもの
     2. migrate() を通らないので、日記を足すために本体のデータ版を上げなくていい
        （v6 の移行で本体を丸ごと空にした事故があるので、その経路に日記を乗せない）
     3. 本体JSONが壊れて KEY+"-broken" 送りになっても、日記だけは生き残る
   ▼ ただし localStorage の容量はオリジン単位で共有なので、これで容量が増えるわけではない。
     そこは画像の枚数で調整する（設定タブの「保存量のめやす」に日記ぶんも出している）
   ▼ 書いた欄だけを持ち、全部空なら日付キーごと消す。
     「書かなかった日」を残さないので、過去を出すときに素直に「あるものだけ」並ぶ
   ▼ 保存は「保存する」を押したときだけ（2026-08-15 に自動保存をやめた）。
     押すたびに新しい1件として足すので、同じ日に何件でも置ける
========================================== */
const DKEY = "jiko-kanri-diary-v1";
/* 欄の定義。key が保存名、id が textarea、id+"Wrap" が包み。fold=false の欄は常に開いている */
const DIARY_FIELDS = [
  { key:"done",   id:"dDone",   label:"今日できたこと",             fold:false },
  { key:"mood",   id:"dMood",   label:"いま、もやもやしていること", fold:true  },
  { key:"gripe",  id:"dGripe",  label:"今日の気持ち",               fold:true  },
  { key:"thanks", id:"dThanks", label:"日常に感謝",                 fold:true  }
];

let diaryFailed = "";
function loadDiary(){
  let raw = null;
  try{
    raw = localStorage.getItem(DKEY);
    if(!raw) return { v:1, entries:{} };
    const d = JSON.parse(raw);
    if(!d || typeof d !== "object" || !d.entries || typeof d.entries !== "object") throw new Error("形が違う");
    return { v:1, entries: d.entries };
  }catch(e){
    /* 本体の load() と同じ考え方。消える前に必ず横へ退避する */
    if(raw){
      try{ localStorage.setItem(DKEY + "-broken", raw); }catch(_){}
      diaryFailed = String((e && e.message) || e);
    }
    return { v:1, entries:{} };
  }
}
let D = loadDiary();

function saveDiary(){
  try{ localStorage.setItem(DKEY, JSON.stringify(D)); }
  catch(e){ toast("日記を保存できませんでした。哲学タブから画像を減らしてください"); return false; }
  if(typeof syncSoon === "function") syncSoon();
  return true;
}
function diaryKB(){
  try{ return Math.round(JSON.stringify(D).length / 1024); }catch(e){ return 0; }
}
const diaryCount = () => Object.keys(D.entries).length;
const diaryDays  = () => new Set(Object.keys(D.entries).map(diaryDateOf)).size;

/* ▼ 保存キーの形は2つある。どちらも「その日」で始まるので、文字のまま並べれば日付順になる。
     "2026-08-13"                … 1日1件だった頃のもの。移行はしない。そのまま読む
     "2026-08-15#1755230400000"  … いまの形。同じ日に何件でも置ける（後ろは保存した時刻）
   ▼ 日付を取り出すときは必ず diaryDateOf() を通すこと。
     dayStart() は "2026-08-13" の形しか受け付けず、外れると黙って今日に化ける */
const diaryDateOf = key => String(key).slice(0, 10);
function newDiaryKey(){
  const day = dayKey();
  let ts = Date.now();
  while(D.entries[day + "#" + ts]) ts++;   // 同じミリ秒に2回入っても、前のぶんを潰さない
  return day + "#" + ts;
}

/* 「2026年8月13日（木）」 */
function diaryDateLabel(key){
  const d = dayStart(diaryDateOf(key));
  return d.getFullYear() + "年" + (d.getMonth()+1) + "月" + d.getDate() + "日（" + WD[d.getDay()] + "）";
}
function hhmm(ts){
  const d = new Date(ts);
  return String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
}

let diaryOpened = {};      // その場で開いた欄（畳んである欄を開いたか）
let diaryEditKey = "";     // 過去のものを書き直しているとき、その保存キー
let diaryShow = 20;        // 「これまでの日記」を何件出すか
let diarySavedAt = 0;      // この画面で最後に保存した時刻。見出しの右に出すだけ
let diaryMonth = "";       // 年月のしぼりこみ。"" なら全部、"2026-08" ならその月だけ

/* 「2026年8月」 */
const monthLabel = m => Number(m.slice(0,4)) + "年" + Number(m.slice(5,7)) + "月";
/* 書いたものがある、いちばん古い月といちばん新しい月。カレンダーの選べる幅にする */
function diaryMonthSpan(){
  const ms = Object.keys(D.entries).map(k => diaryDateOf(k).slice(0,7)).sort();
  return ms.length ? { min: ms[0], max: ms[ms.length-1] } : null;
}

/* 入力欄の中身。空白だけの欄は「書いていない」とみなす */
function collectDiary(){
  const e = {};
  DIARY_FIELDS.forEach(f => {
    const v = ($(f.id).value || "").replace(/\s+$/, "");
    if(v.trim()) e[f.key] = v;
  });
  return e;
}
/* ▼「保存する」を押したときだけ動く。押すたびに新しい1件として足す。
     前に保存したものは触らないので、同じ日に何度書いてもいい。
   ▼ 日付は押した瞬間の dayKey()。深夜1:59 に打って2:00すぎに押せば、押した日のぶんになる。
     「いつ書いたか」ではなく「いつ保存したか」で決まる、と割り切っている */
function saveNewDiary(){
  const cur = collectDiary();
  if(!Object.keys(cur).length){ toast("なにか書いてから「保存する」を押してください"); return; }
  const key = newDiaryKey();
  D.entries[key] = Object.assign(cur, { at: Date.now() });
  // 入りきらなかったときは足さなかったことにする。打ったものは欄に残す（消さない）
  if(!saveDiary()){ delete D.entries[key]; return; }
  diarySavedAt = Date.now();
  DIARY_FIELDS.forEach(f => { $(f.id).value = ""; });
  diaryOpened = {};
  // 古い月でしぼりこんだままだと、いま保存したものが下に出ない。しぼりこみは解く
  diaryMonth = ""; diaryShow = 20;
  renderDiaryHead();      // 見出しの日付を今日に直し、開いていた欄を畳む
  renderDiaryPast();      // すぐ下の「これまでの日記」の先頭に出る
  renderDiaryState();
  renderStats();
  toast("保存しました");
}

/* 見出しの右。保存したときだけ出す。
   「保存していません」は 2026-08-16 に本人の指示で消した（打っている最中は何も出さない） */
function renderDiaryState(){
  const el = $("diaryState"); if(!el) return;
  if(diarySavedAt){
    el.textContent = "保存しました " + hhmm(diarySavedAt); el.className = "dstate saved"; return;
  }
  el.textContent = ""; el.className = "dstate";
}
/* 中身のある欄と、その場で開いた欄だけを見せる */
function syncDiaryFolds(){
  DIARY_FIELDS.forEach(f => {
    if(!f.fold) return;
    const wrap = $(f.id + "Wrap");
    const btn  = document.querySelector('.dtog[data-open="' + f.key + '"]');
    const on   = !!diaryOpened[f.key] || !!($(f.id).value || "").trim();
    wrap.style.display = on ? "" : "none";
    if(btn) btn.style.display = on ? "none" : "";
  });
}
/* ▼ 入力欄の中身には触らない。ここは「保存前の下書き」であって、保存したものの写しではない。
     値を入れ直すと、タブを行き来しただけで打ちかけが消える。触っていいのは保存した直後だけ */
function renderDiaryHead(){
  $("diaryTitle").textContent = diaryDateLabel(dayKey()) + " の日記";
  syncDiaryFolds();
}

function diaryBody(e){
  return DIARY_FIELDS.filter(f => (e[f.key] || "").trim()).map(f =>
    '<div class="dsec"><div class="dlab">' + f.label + '</div>' +
    '<div class="dtxt">' + esc(e[f.key]) + '</div></div>'
  ).join("");
}
/* 保存した1件。書き直し中はその場が入力欄に変わる。
   同じ日に何件も並ぶので、日付のとなりに保存した時刻を出して見分けられるようにしてある */
function diaryCard(key, agoYears){
  const e = D.entries[key]; if(!e) return "";
  const head = '<div class="dchead">' +
    '<div class="dcdate">' + diaryDateLabel(key) + '</div>' +
    (e.at ? '<div class="dctime">' + hhmm(e.at) + '</div>' : '') +
    (agoYears ? '<div class="dcago">' + agoYears + '年前</div>' : '') +
    '<div class="sp"></div>';
  if(diaryEditKey === key){
    return '<article class="dcard editing' + (agoYears ? ' same' : '') + '" data-key="' + key + '">' +
      head + '</div>' +
      DIARY_FIELDS.map(f =>
        '<div class="dfield"><label>' + f.label + '</label>' +
        '<textarea data-fld="' + f.key + '">' + esc(e[f.key] || "") + '</textarea></div>'
      ).join("") +
      '<div class="row" style="justify-content:flex-end">' +
        '<button class="btn ghost" data-act="dcancel">やめる</button>' +
        '<button class="btn" data-act="dsave">保存</button>' +
      '</div>' +
    '</article>';
  }
  return '<article class="dcard' + (agoYears ? ' same' : '') + '" data-key="' + key + '">' +
    head +
    '<button class="iconbtn" data-act="dedit" title="書き直す">✎</button>' +
    '<button class="iconbtn del" data-act="ddel" title="削除">✕</button>' +
    '</div>' + diaryBody(e) +
  '</article>';
}

/* ▼ 上の「同じ日に書いたもの」（#diarySame）と、下の「これまでの日記」（#diaryPast）を書く。
     間の見出しと年月の入力（#diaryPastHead）は index.html にある静的なもので、
     ここでは中身と出し隠しだけを触る。作り直すとフォーカスが飛ぶため触らないこと */
function renderDiaryPast(){
  const el = $("diaryPast"); if(!el) return;
  const today = dayKey();
  const md    = today.slice(5);                       // "08-13"
  const thisY = today.slice(0,4);
  // キーは「日付」または「日付#保存した時刻」なので、文字のまま並べれば新しい順になる
  const all   = Object.keys(D.entries).sort().reverse();
  // 「同じ日」は別の年の同じ月日だけ。今日書いたものは「これまでの日記」の先頭に出す
  const same  = all.filter(k => diaryDateOf(k).slice(5) === md && diaryDateOf(k).slice(0,4) !== thisY);
  const sameSet = new Set(same);
  const rest  = all.filter(k => !sameSet.has(k));

  // ▼ 上の段は年月のしぼりこみを受けない。「去年の今日」は年をまたいで出したいもの
  $("diarySame").innerHTML = same.length
    ? '<h2>同じ日に書いたもの</h2>' +
      same.map(k => diaryCard(k, Number(thisY) - Number(diaryDateOf(k).slice(0,4)))).join("")
    : "";

  // まだ1件も無いときは、見出しも年月の入力も出さない（しぼりこむものが無い）
  const head = $("diaryPastHead");
  if(!all.length){
    head.style.display = "none";
    el.innerHTML = '<div class="empty-note">「保存する」を押すと、この下に新しい順で並びます。' +
      '同じ日に何度書いても、それぞれ別の1件として残ります。' +
      '同じ月日に書いたものが去年までにあれば、いちばん上に出ます。</div>';
    return;
  }
  head.style.display = "";

  const span = diaryMonthSpan();
  const pick = $("diaryMonthPick");
  // 打っている最中に入れ直さない。カーソルが飛ぶ
  if(document.activeElement !== pick && pick.value !== diaryMonth) pick.value = diaryMonth;
  if(span){ pick.min = span.min; pick.max = span.max; }
  $("diaryMonthAll").style.display = diaryMonth ? "" : "none";

  const list = diaryMonth ? rest.filter(k => diaryDateOf(k).slice(0,7) === diaryMonth) : rest;
  $("diaryCountLabel").textContent =
    (diaryMonth ? monthLabel(diaryMonth) + " ・ " : "") + list.length + "件";

  if(!list.length){
    el.innerHTML = '<div class="empty-note">' +
      (diaryMonth ? monthLabel(diaryMonth) + "に書いたものはありません。「すべて」で戻せます。"
                  : "まだありません。") + '</div>';
    return;
  }
  el.innerHTML = list.slice(0, diaryShow).map(k => diaryCard(k, 0)).join("") +
    (list.length > diaryShow
      ? '<button class="fold" id="diaryMoreBtn">もっと見る（残り ' + (list.length - diaryShow) + '件）</button>'
      : '');
  const more = $("diaryMoreBtn");
  if(more) more.onclick = ()=>{ diaryShow += 20; renderDiaryPast(); };
}
/* 年月のしぼりこみ。入力は作り直さないので、ここで1度だけつなぐ */
$("diaryMonthPick").onchange = ()=>{
  diaryMonth = $("diaryMonthPick").value || "";
  diaryShow = 20;                     // 月を変えたら「もっと見る」も最初から
  renderDiaryPast();
};
$("diaryMonthAll").onclick = ()=>{
  diaryMonth = ""; diaryShow = 20;
  $("diaryMonthPick").value = "";
  renderDiaryPast();
};

function renderDiary(){
  renderDiaryHead();
  renderDiaryPast();
  renderDiaryState();
}

$("diarySaveBtn").onclick = saveNewDiary;
document.querySelectorAll(".dtog").forEach(b => b.onclick = ()=>{
  diaryOpened[b.dataset.open] = true;
  syncDiaryFolds();
  const f = DIARY_FIELDS.find(x => x.key === b.dataset.open);
  if(f) $(f.id).focus();
});
/* 自動保存をやめたので、押さずに閉じると打ったものは消える。ここで一度だけ引き止める */
window.addEventListener("beforeunload", e => {
  if(!Object.keys(collectDiary()).length) return;
  e.preventDefault();
  e.returnValue = "";
});

/* ▼ ✎ と ✕。カードは2か所（#diarySame と #diaryPast）にあるので、
     どちらも囲んでいるタブ全体で受ける。.dcard の中でなければ何もしない */
$("sec-diary").addEventListener("click", async e => {
  const btn = e.target.closest("[data-act]"); if(!btn) return;
  const card = e.target.closest(".dcard"); if(!card) return;
  const key = card.dataset.key;
  const act = btn.dataset.act;

  if(act === "dedit"){ diaryEditKey = key; renderDiaryPast(); return; }
  if(act === "dcancel"){ diaryEditKey = ""; renderDiaryPast(); return; }
  if(act === "dsave"){
    const next = {};
    card.querySelectorAll("[data-fld]").forEach(t => {
      const v = (t.value || "").replace(/\s+$/, "");
      if(v.trim()) next[t.dataset.fld] = v;
    });
    const old = D.entries[key];
    diaryEditKey = "";
    if(!Object.keys(next).length) delete D.entries[key];
    // at は書いた時刻として画面に出しているので、書き直しても付け替えない
    else D.entries[key] = Object.assign(next, { at: (old && old.at) || Date.now() });
    saveDiary(); renderDiaryPast(); renderStats();
    toast("書き直しました");
    return;
  }
  if(act === "ddel"){
    const e = D.entries[key];
    const when = diaryDateLabel(key) + ((e && e.at) ? " " + hhmm(e.at) : "");
    const ok = await askConfirm(when + " の日記を削除しますか？", "削除", "元に戻せます（この画面にいる間だけ）");
    if(!ok) return;
    const removed = D.entries[key];
    delete D.entries[key];
    saveDiary(); renderDiaryPast(); renderStats();
    toast("削除しました", ()=>{
      D.entries[key] = removed;
      saveDiary(); renderDiaryPast(); renderStats(); toast("戻しました");
    });
  }
});

/* ================= 設定 ================= */
function renderSettings(){
  const w = $("baseWeekday"), h = $("baseHoliday");
  if(document.activeElement !== w) w.value = S.base.weekday;
  if(document.activeElement !== h) h.value = S.base.holiday;
  const sw = $("startWeekday"), sh = $("startHoliday");
  if(document.activeElement !== sw) sw.value = S.boxStart.weekday;
  if(document.activeElement !== sh) sh.value = S.boxStart.holiday;
  $("startNote").textContent =
    "平日は " + boxClock(dayKeyOfType(false), 0) + " から " + S.base.weekday + "箱で " +
    endClock(false) + " まで。休みは " + boxClock(dayKeyOfType(true), 0) + " から " +
    S.base.holiday + "箱で " + endClock(true) + " まで。";
  renderSound();
  renderSync();
  renderBrowserPaths();
}
/* 目安の計算に使う、その区分の代表日。いまの日で区分だけ差し替える */
function dayKeyOfType(holiday){
  const k = dayKey();
  return (!!getDay(k).holiday === !!holiday) ? k : (holiday ? "__h" : "__w");
}
/* その区分で、箱を使い切ったときのおおよその終わり時刻 */
function endClock(holiday){
  const st = HHMM.exec(S.boxStart[holiday ? "holiday" : "weekday"] || "18:00");
  const base = st ? (+st[1])*60 + (+st[2]) : 18*60;
  const t = base + baseFor(holiday)*30;
  return String(Math.floor(t/60) % 24).padStart(2,"0") + ":" + String(t%60).padStart(2,"0");
}
/* 起動ファイル用のブラウザの場所。空なら自動で探す */
function renderBrowserPaths(){
  const el = $("browserPaths");
  // 入力中に作り直すと打てなくなるので、開いている間は触らない
  if(el.contains(document.activeElement)) return;
  el.innerHTML = BROWSERS.filter(b => b.paths.length).map(b =>
    '<div class="row mt8">' +
      '<span class="flabel">' + esc(b.label) + '</span>' +
      '<input class="bpath" data-b="' + b.key + '" spellcheck="false" ' +
        'value="' + esc((S.browserPaths || {})[b.key] || "") + '" ' +
        'placeholder="自動で探します（見つからないときだけ入れる）">' +
    '</div>'
  ).join("");
}
$("browserPaths").addEventListener("change", e => {
  const inp = e.target.closest(".bpath"); if(!inp) return;
  const key = inp.dataset.b;
  const v = inp.value.trim().replace(/"/g, "");
  S.browserPaths = S.browserPaths || {};
  if(v) S.browserPaths[key] = v; else delete S.browserPaths[key];
  save();
  toast(v ? browserOf(key).label + " の場所を覚えました。起動ファイルを書き出し直してください"
          : browserOf(key).label + " は自動で探します");
});
function onBaseChange(){
  S.base.weekday = Math.min(48, Math.max(0, parseInt($("baseWeekday").value, 10) || 0));
  S.base.holiday = Math.min(48, Math.max(0, parseInt($("baseHoliday").value, 10) || 0));
  save(); renderAll();
  toast("基本値を変えました（明日から反映。今日は ＋− で調整）");
}
$("baseWeekday").addEventListener("change", onBaseChange);
$("baseHoliday").addEventListener("change", onBaseChange);
function onStartChange(){
  const ok = v => HHMM.test(v) ? v : "";
  S.boxStart.weekday = ok($("startWeekday").value) || S.boxStart.weekday;
  S.boxStart.holiday = ok($("startHoliday").value) || S.boxStart.holiday;
  save(); renderAll();
  toast("箱の始まりを変えました（目安の時刻だけが変わります）");
}
$("startWeekday").addEventListener("change", onStartChange);
$("startHoliday").addEventListener("change", onStartChange);

/* ================= 哲学タブ：お気に入りの画像 ================= */
$("btnAddImg").onclick = ()=> $("imgInput").click();
$("imgInput").onchange = async e => {
  const files = [...e.target.files];
  e.target.value = "";
  if(!files.length) return;
  if(S.images.length >= IMG_LIMIT){
    toast("画像は" + IMG_LIMIT + "枚まで。どれかを消してから追加してください");
    return;
  }
  let added = 0, full = false, over = false, bad = 0;
  toast("画像を取り込んでいます…");
  for(const f of files){
    if(S.images.length >= IMG_LIMIT){ over = true; break; }   // 8枚に達した
    let data;
    try{ data = await compressImage(f); }
    catch(err){ bad++; continue; }
    if(data.length > IMG_MAX){ bad++; continue; }             // どう縮めても入らなかった
    if(!addImage(data)){ full = true; break; }
    added++;
  }
  renderAll();
  if(added) toast(added + "枚を保存しました（各 400KB 以下に圧縮）");
  if(over)  toast("画像は" + IMG_LIMIT + "枚まで。ここまでを保存しました");
  else if(full) toast("保存できる容量がいっぱいです。古い画像を消してください");
  else if(!added && bad) toast("画像として読み込めませんでした");
};
function renderImages(){
  const el = $("imgList");
  const todayId = S.images.length ? (getDay().img || "") : "";
  const atLimit = S.images.length >= IMG_LIMIT;
  $("imgNote").textContent = S.images.length
    ? S.images.length + " / " + IMG_LIMIT + "枚 ・ 保存量 約" + usedKB() + "KB" +
      (atLimit ? "（いっぱいです）" : "")
    : "まだありません（" + IMG_LIMIT + "枚まで）";
  $("btnAddImg").disabled = atLimit;
  $("btnAddImg").style.opacity = atLimit ? ".45" : "";
  if(!S.images.length){
    el.innerHTML = '<div class="empty-note">画像を入れると、箱を終えるたびに少しずつ見えてきます。</div>';
    return;
  }
  el.innerHTML = '<div class="imgs">' + S.images.map(x =>
    '<div class="cell' + (x.id === todayId ? " today" : "") + '" data-id="' + x.id + '">' +
      '<img src="' + x.data + '" alt="">' +
      '<button class="rm" data-act="imgdel" title="削除">✕</button>' +
      '<span class="sz">' + (x.id === todayId ? "今日の1枚" : Math.round(x.data.length/1024) + "KB") + '</span>' +
    '</div>').join("") + '</div>';
}
$("imgList").addEventListener("click", async e => {
  const btn = e.target.closest('[data-act="imgdel"]'); if(!btn) return;
  const id = e.target.closest(".cell").dataset.id;
  const ok = await askConfirm("この画像を削除しますか？", "削除");
  if(!ok) return;
  removeImage(id);
});

/* ================= 設定タブ：タイマーの音 =================
   画像と同じ考え方。入れられるのは1つだけで、大きさの上限も画像1枚と同じ。
   ▼ 鳴らすのは最初の RING_SEC 秒だけなので、長い曲はその場で切り落として保存する。
     曲を丸ごと持つと localStorage（目安5MB）が画像と食い合って、
     やりたいことが保存できなくなる
   ▼ 切るには作り直しが要る。作り直したものは WAV（無圧縮）なので、
     入らなければ SND_RATES の順に音を粗くする。画像の「画質→寸法」と同じ落とし方
   ▼ 逆に、短くて軽いものは元のまま持つ。作り直すと音が悪くなるだけなので
=========================================================== */
const SND_MAX = 400 * 1024;         // 保存できる大きさ（データURLの長さ）＝ 画像1枚ぶん
const SND_RATES = [16000, 12000, 8000];   // 入らなければ、この順に粗くする

/* AudioBuffer（モノラル）→ WAV のデータURL */
function wavDataURL(buf){
  const ch = buf.getChannelData(0), n = ch.length, rate = buf.sampleRate;
  const ab = new ArrayBuffer(44 + n*2), v = new DataView(ab);
  const put = (o, s)=>{ for(let i = 0; i < s.length; i++) v.setUint8(o+i, s.charCodeAt(i)); };
  put(0, "RIFF");  v.setUint32(4, 36 + n*2, true);  put(8, "WAVE");
  put(12, "fmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);          // PCM
  v.setUint16(22, 1, true);          // モノラル
  v.setUint32(24, rate, true);
  v.setUint32(28, rate*2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);         // 16bit
  put(36, "data"); v.setUint32(40, n*2, true);
  for(let i = 0; i < n; i++){
    const s = Math.max(-1, Math.min(1, ch[i]));
    v.setInt16(44 + i*2, s < 0 ? s*0x8000 : s*0x7fff, true);
  }
  const u8 = new Uint8Array(ab);
  let bin = "";
  for(let i = 0; i < u8.length; i += 0x8000){   // 一度に渡すと引数が多すぎて落ちる
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  }
  return "data:audio/wav;base64," + btoa(bin);
}
function fileDataURL(file){
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = ()=> reject(new Error("読み込めませんでした"));
    fr.onload  = ()=> resolve(fr.result);
    fr.readAsDataURL(file);
  });
}
/* 選ばれた音を、鳴らすぶん（最初の RING_SEC 秒）だけに切り詰める */
async function prepareSound(file){
  const ac = audioOn();
  if(!ac) throw new Error("この環境では音を扱えません");
  let buf;
  try{ buf = await ac.decodeAudioData(await file.arrayBuffer()); }
  catch(e){ throw new Error("音として開けませんでした"); }
  if(!buf.duration) throw new Error("音が入っていません");

  const sec = Math.min(RING_SEC, buf.duration);
  // 短くて軽いものは、そのまま持つ（切る必要が無いのに作り直すと、音が悪くなるだけ）
  if(buf.duration <= RING_SEC + .5){
    const asis = await fileDataURL(file);
    if(asis.length <= SND_MAX){
      // rate は「粗くした」ときだけ出す。ここは元のままなので持たない
      // （buf.sampleRate は decodeAudioData が合わせた値で、元のファイルの値ではない）
      return { data: asis, sec: Math.round(buf.duration*10)/10, rate: 0, cut: false };
    }
  }
  const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if(!OC) throw new Error("この環境では切り取れません");
  for(const rate of SND_RATES){
    // モノラル・その周波数で鳴らし直すと、まとめて（頭だけ・1ch・粗く）作り直せる
    const oc = new OC(1, Math.ceil(sec * rate), rate);
    const src = oc.createBufferSource();
    src.buffer = buf; src.connect(oc.destination); src.start(0);
    const data = wavDataURL(await oc.startRendering());
    if(data.length <= SND_MAX){
      return { data, sec: Math.round(sec*10)/10, rate, cut: buf.duration > sec };
    }
  }
  throw new Error("小さくできませんでした");
}
/* 保存できたら true。容量オーバーなら元に戻して false（画像の addImage と同じ） */
function setTimerSound(snd){
  const prev = S.timerSound;
  S.timerSound = snd;
  if(!trySave()){
    S.timerSound = prev;
    trySave();
    return false;
  }
  soundBuf = null; soundKey = "";     // 次に鳴らすときに読み直す
  return true;
}

$("btnAddSnd").onclick = ()=> $("sndInput").click();
$("sndInput").onchange = async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if(!file) return;
  toast("音を取り込んでいます…");
  let snd;
  try{ snd = await prepareSound(file); }
  catch(err){ toast(String(err.message || err)); return; }
  const name = (file.name || "音").slice(0, 40);
  if(!setTimerSound(Object.assign({ name, at: Date.now() }, snd))){
    toast("保存できる容量がいっぱいです。哲学タブから画像を減らしてください");
    return;
  }
  renderAll();
  toast(snd.cut ? "最初の" + RING_SEC + "秒だけを保存しました" : "この音を保存しました", {
    label: "試しに鳴らす", run: testSound
  });
};
$("btnResetSnd").onclick = async ()=>{
  if(!S.timerSound) return;
  const ok = await askConfirm("既定の音（ピッピッピッ）に戻しますか？", "戻す");
  if(!ok) return;
  const prev = S.timerSound;
  setTimerSound(null);
  renderAll();
  toast("既定の音に戻しました", ()=>{ setTimerSound(prev); renderAll(); });
};
async function testSound(){
  audioOn();
  stopRing();
  await primeSound();
  startRing();
  toast(S.timerSound ? RING_SEC + "秒だけ鳴らします" : "既定の音です", { label:"止める", run: stopRing });
}
$("btnTestSnd").onclick = testSound;

function renderSound(){
  const el = $("sndNote"); if(!el) return;
  const s = S.timerSound;
  $("btnResetSnd").disabled = !s;
  $("btnResetSnd").style.opacity = s ? "" : ".45";
  if(!s){
    el.innerHTML = '<div class="empty-note">いまは既定の「ピッピッピッ」です' +
      '（1.5秒おきに' + RING_TIMES + '回）。</div>';
    return;
  }
  el.innerHTML =
    '<div class="kv"><span>' + esc(s.name || "音") + '</span><span>' +
      s.sec + '秒 ・ 約' + Math.round(s.data.length/1024) + 'KB' +
      (s.rate ? ' ・ ' + Math.round(s.rate/1000) + 'kHz に粗くしました' : ' ・ そのまま') +
    '</span></div>' +
    '<div class="empty-note">0になると、この音が' + RING_SEC + '秒だけ鳴ります。' +
      (s.sec < RING_SEC ? s.sec + '秒しかないので、その間くり返します。' : '') + '</div>';
}

/* 今月、何で箱が潰れたか */
function renderCutStats(){
  const d = dayStart(dayKey());
  const pre = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0");
  const per = {};
  let total = 0;
  Object.keys(S.days).forEach(k => {
    if(k.indexOf(pre) !== 0) return;
    (S.days[k].cuts || []).forEach(c => {
      const label = (c.label || "").trim() || "（理由なし）";
      per[label] = (per[label] || 0) + 1;
      total++;
    });
  });
  if(!total){
    $("cutStats").innerHTML = '<div class="empty-note">今月はまだ箱を減らしていません。</div>';
    return;
  }
  $("cutStats").innerHTML =
    Object.keys(per).sort((a,b) => per[b] - per[a]).map(k =>
      '<div class="kv"><span>' + esc(k) + '</span><span><b>' + per[k] + '</b> 箱 ・ ' + boxTime(per[k]) + '</span></div>'
    ).join("") +
    '<div class="kv"><span>合計</span><span><b>' + total + '</b> 箱 ・ ' + boxTime(total) + '</span></div>';
}
function renderStats(){
  renderImages();
  renderCutStats();
  const once = S.tasks.filter(t => t.freq.unit === "once");
  const rep  = S.tasks.filter(t => t.freq.unit !== "once");
  // 「遅れ」の数え方は一覧と揃える（毎日のやりたいことは未実行なだけなので数えない）
  const late = rep.filter(t => {
    if(t.freq.unit === "day") return false;
    const s = statOf(t);
    return !s.met && s.deficit >= 1;
  }).length;
  const d = getDay();
  $("stats").innerHTML =
    '<div class="kv"><span>今日の箱</span><span>全 ' + d.count + ' 箱 ・ 残り <b>' + remainBoxes(d) + '</b> 箱</span></div>' +
    '<div class="kv"><span>単発のやりたいこと</span><span>' + once.length + '件（完了 ' + once.filter(isDone).length + '）</span></div>' +
    '<div class="kv"><span>くり返しのやりたいこと</span><span>' + rep.length + '件（遅れ ' + late + '）</span></div>' +
    '<div class="kv"><span>ルーティーン</span><span>' + S.routines.length + '件</span></div>' +
    '<div class="kv"><span>リンク付きのやりたいこと</span><span>' + S.tasks.filter(t => linksOf(t).length).length + '件' +
      (S.tasks.some(t => needsBat(t)) ? '（起動ファイルが要るもの ' + S.tasks.filter(needsBat).length + '）' : '') +
      '</span></div>' +
    '<div class="kv"><span>哲学</span><span>' + S.philos.length + '件</span></div>' +
    '<div class="kv"><span>画像</span><span>' + S.images.length + '枚</span></div>' +
    '<div class="kv"><span>タイマーの音</span><span>' +
      (S.timerSound
        ? esc(S.timerSound.name || "音") + '（約 ' + Math.round(S.timerSound.data.length/1024) + ' KB）'
        : '既定のピッピッピッ（0 KB）') + '</span></div>' +
    '<div class="kv"><span>日記</span><span>' + diaryCount() + '件（' + diaryDays() + '日ぶん）</span></div>' +
    '<div class="kv"><span>保存量のめやす</span><span>約 ' + (usedKB() + diaryKB()) +
      ' KB（うち日記 ' + diaryKB() + ' KB）</span></div>';
}
$("btnExport").onclick = ()=>{
  // ▼ 保存していない日記は入らない（自動保存をやめたので、押していないものはまだ存在しない）
  // 日記は別のキーに持っているので、書き出しのときだけ diary として同じファイルに入れる
  const blob = new Blob([JSON.stringify(Object.assign({}, S, { diary: D }), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "自己管理_" + dayKey() + ".json";
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
    // 日記が入っていない古い書き出しで、いまの日記を消してしまわないこと
    const inDiary = (d.diary && typeof d.diary === "object" && d.diary.entries &&
                     typeof d.diary.entries === "object") ? { v:1, entries: d.diary.entries } : null;
    const ok = await askConfirm("読み込むデータで置き換えますか？", "置き換える",
      "いまのやりたいこと・ルーティーン・箱・哲学はすべて消えます。" +
      (inDiary ? "日記も、読み込むほうに置き換わります（" + Object.keys(inDiary.entries).length + "件）"
               : "このファイルに日記は入っていないので、いまの日記はそのまま残します"));
    if(!ok) return;
    delete d.diary;      // 本体（S）に混ぜない。日記は別のキーで持つ
    S = migrate(Object.assign(structuredClone(DEFAULTS), d));
    if(inDiary){
      D = inDiary; diaryOpened = {}; diaryEditKey = ""; diaryShow = 20; diarySavedAt = 0;
      saveDiary();
    }
    save(); renderAll(); toast("読み込みました");
  };
  r.readAsText(f);
  e.target.value = "";
};
$("btnClearDone").onclick = async ()=>{
  const gone = S.tasks.filter(isDone);
  if(!gone.length){ toast("完了したやりたいことはありません"); return; }
  const ok = await askConfirm("完了した " + gone.length + " 件を削除しますか？", "削除",
    gone.map(t => t.text).join("、"));
  if(!ok) return;
  const before = S.tasks.slice();
  S.tasks = S.tasks.filter(t => !isDone(t));
  gone.forEach(t => unplaceSilent(t.id));
  save(); renderAll();
  toast("削除しました", ()=>{ S.tasks = before; save(); renderAll(); toast("戻しました"); });
};

/* ================= 更新とキャッシュ =================
   GitHub Pages は index.html も css/js も10分ほどキャッシュされる。
   そのため版を上げた直後は、古い index.html と新しい app.js のような
   ちぐはぐな組み合わせで動くことがある。
   - index.html の meta と APP_VERSION がずれていたら、それを検知して知らせる
   - 「最新に更新」は、まだ使われていないURL（?r=時刻）へ移ることで
     index.html を必ずネットワークから取り直させる。
     新しい index.html は新しい ?v= を持つので、css/js も一緒に入れ替わる
   - localStorage は別物なので、この操作でデータは消えない
====================================================== */
function pageVersion(){
  const m = document.querySelector('meta[name="app-version"]');
  return m ? (m.content || "") : "";
}
let serverVersion = "";     // 公開されている版（起動時に見にいく）

/* 古い版で動いているか。
   - 画面と中身の版が食い違う（ちぐはぐなキャッシュ）
   - 公開されている版が、いま動いている版と違う（まるごと古い） */
function isStale(){
  if(pageVersion() && pageVersion() !== APP_VERSION) return true;
  if(serverVersion && serverVersion !== APP_VERSION) return true;
  return false;
}
/* ブックマークから開くと1件も問い合わせずキャッシュだけで動くことがある。
   そのままでは古いと気づけないので、起動時に一度だけ見にいく */
async function checkForUpdate(){
  if(location.protocol === "file:") return;
  try{
    const res = await fetch(location.pathname + "?r=" + Date.now(), { cache: "no-store" });
    if(!res.ok) return;
    const m = (await res.text()).match(/name=["']app-version["'][^>]*content=["']([^"']+)["']/);
    if(!m) return;
    serverVersion = m[1];
    renderVersion();
  }catch(e){ /* 見にいけなくても、いまの版で普通に使える */ }
}

async function hardReload(){
  save();                                     // いまの状態を書いてから出る
  try{                                        // 将来 Service Worker を足したとき用
    if(navigator.serviceWorker && navigator.serviceWorker.getRegistrations){
      const rs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(rs.map(r => r.unregister()));
    }
  }catch(e){}
  try{
    if(typeof caches !== "undefined" && caches.keys){
      const ks = await caches.keys();
      await Promise.all(ks.map(k => caches.delete(k)));
    }
  }catch(e){}
  if(location.protocol === "file:"){ location.reload(); return; }
  location.replace(location.pathname + "?r=" + Date.now());
}

function renderVersion(){
  const stale = isStale();
  $("verBox").innerHTML =
    '<div class="kv"><span>いま動いている版</span><span><b>' + esc(APP_VERSION) + '</b></span></div>' +
    (serverVersion
      ? '<div class="kv"><span>公開されている版</span><span><b>' + esc(serverVersion) + '</b>' +
        (serverVersion === APP_VERSION ? "（最新）" : "（新しい版があります）") + '</span></div>'
      : '') +
    (pageVersion() && pageVersion() !== APP_VERSION
      ? '<div class="kv"><span>画面の版</span><span><b>' + esc(pageVersion()) + '</b>（食い違い）</span></div>'
      : '') +
    '<div class="row mt8" style="margin-top:14px">' +
      '<button class="btn ghost" id="btnUpdate">キャッシュを消して最新に更新</button>' +
    '</div>' +
    '<div class="empty-note">' +
      'GitHub Pages では、更新しても10分ほど古い版が表示されることがあります。<br>' +
      '新しくしたのに変わらないときは、これを押してください。<br>' +
      '<b>やりたいこと・画像・哲学などのデータは消えません。</b>' +
    '</div>';
  $("btnUpdate").onclick = hardReload;
  $("updateBar").classList.toggle("on", stale);
}
$("updateNow").onclick = hardReload;

/* ================= tabs ================= */
function switchTab(name){
  document.querySelectorAll("nav button").forEach(b => b.classList.toggle("on", b.dataset.tab === name));
  document.querySelectorAll("section").forEach(s => s.classList.toggle("on", s.id === "sec-" + name));
  // 今日タブだけ、枠を画面の高さに固定して中でスクロールさせる（style.css の body.now-fixed）。
  // ほかのタブは、これまでどおりページ全体がスクロールする
  document.body.classList.toggle("now-fixed", name === "now");
  window.scrollTo(0,0);
}
switchTab("now");        // 最初は今日タブ。body の印を付けるためにここでも通す
document.querySelectorAll("nav button").forEach(b => b.onclick = ()=> switchTab(b.dataset.tab));

/* ================= キーボード ================= */
document.addEventListener("keydown", e => {
  if(e.key === "Escape" && $("editModal").classList.contains("on")){ closeTaskEditor(); return; }
  if(e.key === "Escape" && $("linkModal").classList.contains("on")){ closeLinkEditor(); return; }
  if(e.key === "Escape" && modalDone){ closeModal(null); return; }
  if($("modal").classList.contains("on") || $("linkModal").classList.contains("on") ||
     $("editModal").classList.contains("on")) return;
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (e.target.tagName || "").toLowerCase();
  if(tag === "input" || tag === "textarea" || tag === "select") return;
  if(!$("sec-now").classList.contains("on")) return;

  if(e.key === " " || e.key === "Enter"){ e.preventDefault(); const g = currentGroup(); if(g) doTask(g.id); }
  else if(e.key === "n" || e.key === "N" || e.key === "ArrowDown"){ e.preventDefault(); moveCursor(1); }
  else if(e.key === "p" || e.key === "P" || e.key === "ArrowUp"){ e.preventDefault(); moveCursor(-1); }
  else if(e.key === "+" || e.key === "=" ){ e.preventDefault(); addBox(); }
  else if(e.key === "-" || e.key === "_" ){ e.preventDefault(); removeBox(); }
});

/* ================= boot ================= */
function renderAll(){
  renderHeader();
  renderWeek();
  renderWeekSide();
  renderPhiloBar();
  renderNow();
  renderBoxes();
  renderUnplaced();
  renderRoulette();
  renderRoutines();
  renderSkipped();
  renderDoneToday();
  renderTasks();
  renderRoutineList();
  // リンク欄の候補は、いま使っているやりたいことのリンクから作る
  $("taskUrlList").innerHTML = [...new Set(
      S.tasks.flatMap(t => linksOf(t).filter(l => l.kind === "url").map(l => l.url))
    )].map(u => '<option value="' + esc(u) + '"></option>').join("");
  renderPhilos();
  renderCheers();
  renderDiary();
  renderSettings();
  renderStats();
  renderVersion();
}

/* ================= 同期（ほかの端末と合わせる） =================
   仕様は SPEC.md「追加仕様：端末をまたいで使う（2026-08-14 決定）」。
   置き場は Vercel の Function → Supabase。手順は sync/README.md。

   ▼ 中身はこの端末で暗号化してから送る。鍵は端末から出ない。
     サーバーに置かれるのは「種類・伏せた見出し・触った時刻・暗号文」だけ。
     持ち主でも他人の中身は読めない
   ▼ 突き合わせは1件ごと。あとに触った方が勝つ。
     ただし「やった記録（log）」だけは足し算にする（両方の端末で押したぶんを残す）
   ▼ 消したものは行を消さずに「墓標」（body = null）にする。
     消してしまうと、まだ知らない端末が次に送ってきたときに生き返る
================================================================= */
/* 置き場のアドレス。端末ごとに打ち直さなくていいよう、既定を入れてある。
   入れ替えたいときは設定タブの欄を書き換えれば、そちらが使われる */
const SYNC_URL_DEFAULT = "https://iamidle.vercel.app/api/sync";
const SKEY_LS   = "jiko-kanri-sync-v1";     // この端末だけの控え。S にも書き出しにも混ぜない
/* ▼ この "iamidol" は綴り間違いのままで正しい。直してはいけない。
   これは名前ではなく、合言葉から鍵を作るときの材料（塩）。
   1文字でも変えると別の鍵になり、サーバーに置いてある今までの中身が
   二度と開けなくなる（入口の鍵も変わるので、取り出すことすらできない）。
   sync/key.html の SALT_PREFIX と同じ値。片方だけ変えても開けなくなる */
const SYNC_SALT = "iamidol.sync.v1:";
const SYNC_ROUNDS = 200000;
const SYNC_GAP  = 5000;                     // 打ってから送るまでの間
const SYNC_MIN  = 60000;                    // 戻ってきたとき、前回からこれ以上あいていたら合わせる

/* 送る順番。やりたいことを先に入れないと、箱が「知らないID」として片付けられてしまう */
const KIND_ORDER = ["task","routine","philo","cheer","set","wkov","rdone","day","diary"];

function loadSync(){
  try{
    const d = JSON.parse(localStorage.getItem(SKEY_LS) || "null");
    if(d && typeof d === "object") return Object.assign({ url:"", name:"", pass:"", cursor:0, marks:{}, at:0, dirtyAt:0 }, d);
  }catch(e){}
  return { url:"", name:"", pass:"", cursor:0, marks:{}, at:0, dirtyAt:0 };
}
let SY = loadSync();
function saveSync(){ try{ localStorage.setItem(SKEY_LS, JSON.stringify(SY)); }catch(e){} }
const syncOn = () => !!(SY.url && SY.name && SY.pass);

/* ---- 鍵 ---- */
let syncKeys = null;      // { auth, enc, id }。合言葉から作る。localStorage には置かない
const te = new TextEncoder();
const hex = u8 => [...u8].map(b => b.toString(16).padStart(2,"0")).join("");
function b64(u8){ let s=""; for(let i=0;i<u8.length;i+=0x8000) s += String.fromCharCode.apply(null, u8.subarray(i,i+0x8000)); return btoa(s); }
function unb64(str){ const b = atob(str); const u = new Uint8Array(b.length); for(let i=0;i<b.length;i++) u[i]=b.charCodeAt(i); return u; }

/* ▼ 合言葉から3つ作る。作り方を変えると、これまでのデータが開けなくなる。
   sync/key.html にも同じものがある。片方だけ直さないこと */
async function makeKeys(name, pass){
  const base = await crypto.subtle.importKey("raw", te.encode(pass), "PBKDF2", false, ["deriveBits"]);
  const master = new Uint8Array(await crypto.subtle.deriveBits(
    { name:"PBKDF2", salt: te.encode(SYNC_SALT + name), iterations: SYNC_ROUNDS, hash:"SHA-256" }, base, 256));
  const part = async label => {
    const b = new Uint8Array(master.length + label.length);
    b.set(master, 0); b.set(te.encode(label), master.length);
    return new Uint8Array(await crypto.subtle.digest("SHA-256", b));
  };
  return {
    auth: hex(await part("auth")),                                     // これだけ送る
    enc:  await crypto.subtle.importKey("raw", await part("enc"), { name:"AES-GCM" }, false, ["encrypt","decrypt"]),
    id:   await crypto.subtle.importKey("raw", await part("id"), { name:"HMAC", hash:"SHA-256" }, false, ["sign"])
  };
}
async function seal(obj){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name:"AES-GCM", iv }, syncKeys.enc, te.encode(JSON.stringify(obj))));
  const all = new Uint8Array(iv.length + ct.length);
  all.set(iv, 0); all.set(ct, iv.length);
  return b64(all);
}
async function unseal(str){
  const all = unb64(str);
  const pt = await crypto.subtle.decrypt({ name:"AES-GCM", iv: all.slice(0,12) }, syncKeys.enc, all.slice(12));
  return JSON.parse(new TextDecoder().decode(pt));
}
/* 見出しも伏せる。日付やIDがそのまま出ると「いつ書いたか」が読めてしまう */
async function hideId(kind, id){
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", syncKeys.id, te.encode(kind + ":" + id)));
  return hex(sig).slice(0, 32);
}
/* 中身が変わったかを見るためだけの短い印。暗号ではない */
function markOf(body){
  const s = JSON.stringify(body);
  let h = 0x811c9dc5;
  for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  return s.length + ":" + h.toString(36);
}

/* ---- この端末が持っているもの ---- */
function localRecords(){
  const out = [];
  const add = (kind, id, body) => out.push({ kind, id, body });
  S.tasks.forEach(t => add("task", t.id, t));
  Object.keys(S.days).forEach(k => {
    const c = Object.assign({}, S.days[k]);
    delete c.img;                       // 画像は端末ごと。向こうに無いIDを送らない
    add("day", k, c);
  });
  S.routines.forEach(r => add("routine", r.id, r));
  Object.keys(S.routineDone).forEach(k => add("rdone", k, S.routineDone[k]));
  S.philos.forEach(p => add("philo", p.id, p));
  S.cheers.forEach(c => add("cheer", c.id, c));
  Object.keys(S.weekOverrides).forEach(w => add("wkov", w, S.weekOverrides[w]));
  add("set", "base", S.base);
  add("set", "boxStart", S.boxStart);
  Object.keys(D.entries).forEach(k => add("diary", k, D.entries[k]));
  return out;
}

/* ▼ やった記録は足し算にする（両方の端末で押したぶんを両方残すため）。
   ただし、どちらかで取り消したもの（gone）は入れない。
   これが無いと、取り消しがもう一方から足し戻されて、いつまでも消えない */
function logUnion(a, b){
  const dead = new Set([...(a.gone || []), ...(b.gone || [])]);
  const log  = [...new Set([...(a.log || []), ...(b.log || [])])].filter(ts => !dead.has(ts)).sort((x,y)=>x-y);
  const acts = {};
  [...(a.actuals || []), ...(b.actuals || [])].forEach(x => { if(x && !dead.has(x.ts)) acts[x.ts] = x; });
  return { log, gone: [...dead], actuals: Object.keys(acts).map(k => acts[k]).sort((x,y)=>x.ts-y.ts) };
}
/* こちらの中身は残したまま、記録だけ足す */
function mergeLog(mine, theirs){ Object.assign(mine, logUnion(mine, theirs)); }

/* ---- 受け取ったものを入れる ---- */
function applyRecord(kind, id, body){
  const gone = (body === null);
  if(kind === "task"){
    const i = S.tasks.findIndex(t => t.id === id);
    if(gone){ if(i >= 0) S.tasks.splice(i, 1); return; }
    if(i >= 0){
      const mine = S.tasks[i];
      S.tasks[i] = Object.assign({}, body, logUnion(mine, body));
    } else S.tasks.push(body);
    return;
  }
  if(kind === "day"){
    if(gone){ delete S.days[id]; return; }
    const img = (S.days[id] || {}).img;      // 画像の選択は端末ごとなので残す
    S.days[id] = Object.assign({}, body, img ? { img } : {});
    return;
  }
  if(kind === "diary"){
    if(gone) delete D.entries[id]; else D.entries[id] = body;
    return;
  }
  if(kind === "rdone"){
    if(gone) delete S.routineDone[id]; else S.routineDone[id] = body;
    return;
  }
  if(kind === "wkov"){
    if(gone) delete S.weekOverrides[id]; else S.weekOverrides[id] = body;
    return;
  }
  if(kind === "set"){
    if(gone) return;                          // 設定は消さない
    if(id === "base") S.base = body;
    if(id === "boxStart") S.boxStart = body;
    return;
  }
  const list = kind === "routine" ? S.routines : kind === "philo" ? S.philos : kind === "cheer" ? S.cheers : null;
  if(!list) return;
  const i = list.findIndex(x => x.id === id);
  if(gone){ if(i >= 0) list.splice(i, 1); return; }
  if(i >= 0) list[i] = body; else list.push(body);
}

/* ---- 本体 ---- */
let syncing = false, syncTimer = 0, syncAgain = false;
let syncNote = "";        // 画面に出す最後の結果

async function callSync(payload){
  const r = await fetch(SY.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sync-user": SY.name,
      "x-sync-key": syncKeys.auth
    },
    body: JSON.stringify(payload)
  });
  const d = await r.json().catch(()=> ({}));
  if(!r.ok) throw new Error(d.error || ("つながりませんでした（" + r.status + "）"));
  return d;
}

async function syncNow(quiet){
  if(!syncOn() || syncing) return;
  if(!window.crypto || !crypto.subtle){ syncNote = "この開き方では暗号が使えません（https で開いてください）"; renderSync(); return; }
  syncing = true;
  if(syncTimer){ clearTimeout(syncTimer); syncTimer = 0; }
  syncNote = "合わせています…"; renderSync();
  try{
    if(!syncKeys) syncKeys = await makeKeys(SY.name, SY.pass);

    /* ---- 1. 先に受け取るだけ。送るのはそのあと ----
       ▼ 同じ回で送ってしまうと、その日を作ったばかりの端末が、
         もう一方が並べた箱を上書きしてしまう（順番の問題。まとめないこと） */
    let got = await callSync({ since: SY.cursor, items: [] });
    let rows = got.items || [];
    while(got.more){ got = await callSync({ since: got.cursor, items: [] }); rows = rows.concat(got.items || []); }

    /* ---- 2. 合言葉が合っているか ---- */
    const check = rows.find(r => r.kind === "check");
    if(check && check.body){
      try{ await unseal(check.body); }
      catch(e){
        syncKeys = null;
        syncNote = "合言葉が違います。合わせずに止めました";
        syncing = false; renderSync();
        toast("合言葉が違います。設定を見直してください");
        return;
      }
    }

    /* ---- 3. 入れる（やりたいことを先に。箱より後だと、知らないIDとして片付けられる） ---- */
    const opened = [];
    for(const r of rows){
      if(r.kind === "check") continue;
      let real = null;
      if(r.body !== null){
        try{ real = await unseal(r.body); }catch(e){ continue; }   // 開けないものは触らない
        if(!real || typeof real.id !== "string") continue;
      }else{
        real = { id: null };
      }
      opened.push({ kind: r.kind, hid: r.id, id: real.id, body: r.body === null ? null : real.body, at: r.at });
    }
    // 墓標は中身が無いので、本当のIDが分からない。伏せた見出しから引き当てる
    const backMap = {};
    Object.keys(SY.marks).forEach(k => { const m = SY.marks[k]; if(m.hid) backMap[m.hid] = k; });
    opened.forEach(o => {
      if(o.id === null){
        const k = backMap[o.hid];
        if(k){ o.id = k.slice(k.indexOf(":") + 1); }
      }
    });
    opened.sort((a,b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));

    /* ▼ 届いたものを、こちらの直しより優先させないこと。
       つないでいない間にこの端末で直したぶんは、まだサーバーに載っていない。
       何も見ずに上書きすると、圏外で並べた箱が古いもので消される。
       「こちらで直してあって、しかもその直しが向こうより新しい」ものだけ、入れずに残す */
    const mineMap = {};
    localRecords().forEach(r => { mineMap[r.kind + ":" + r.id] = r.body; });

    let taken = 0, kept = 0;
    for(const o of opened){
      if(!o.id) continue;
      const key = o.kind + ":" + o.id;
      const mk  = SY.marks[key];
      const cur = mineMap[key];
      const dirty = (cur !== undefined) ? (!mk || mk.h !== markOf(cur)) : (!!mk && mk.h !== "");
      if(dirty && (SY.dirtyAt || 0) > o.at){
        // 記録（log）だけは、こちらを残したまま足しておく。押したぶんを落とさない
        if(o.kind === "task" && o.body && cur) mergeLog(cur, o.body);
        kept++;
        continue;                      // marks は更新しない。次に送るときに、こちらが勝つ
      }
      applyRecord(o.kind, o.id, o.body);
      SY.marks[key] = { h: o.body === null ? "" : markOf(o.body), at: o.at, hid: o.hid };
      taken++;
    }
    if(taken){ save(); saveDiary(); }
    SY.cursor = got.cursor || SY.cursor;

    /* ---- 4. こちらで変わったものを送る ---- */
    const now = Date.now();
    const mine = localRecords();
    const seen = {};
    const send = [];
    for(const rec of mine){
      const key = rec.kind + ":" + rec.id;
      seen[key] = true;
      const h = markOf(rec.body);
      const old = SY.marks[key];
      if(old && old.h === h) continue;                 // 変わっていない
      const hid = await hideId(rec.kind, rec.id);
      send.push({ kind: rec.kind, id: hid, body: await seal({ id: rec.id, body: rec.body }), at: now });
      SY.marks[key] = { h, at: now, hid };
    }
    // 前はあったのに、いま無いもの＝消したもの。墓標を送る
    for(const key of Object.keys(SY.marks)){
      if(seen[key] || key === "check:check") continue;
      const m = SY.marks[key];
      if(m.h === "") continue;                         // もう墓標になっている
      send.push({ kind: key.slice(0, key.indexOf(":")), id: m.hid, body: null, at: now });
      SY.marks[key] = { h: "", at: now, hid: m.hid };
    }
    if(!check) send.push({ kind:"check", id:"check", body: await seal({ ok:1 }), at: now });

    if(send.length){
      const put = await callSync({ since: SY.cursor, items: send });
      SY.cursor = put.cursor || SY.cursor;
    }

    SY.at = Date.now(); saveSync();
    syncNote = "合わせました " + hhmm(SY.at) + "（受け取り " + taken + "件 ・ 送り " + send.length + "件" +
      (kept ? " ・ こちらを残した " + kept + "件" : "") + "）";
    if(taken) renderAll();
    if(!quiet && (taken || send.length)) toast("同期しました");
  }catch(e){
    syncNote = "同期できませんでした：" + String(e && e.message || e);
    if(!quiet) toast(syncNote);
  }
  syncing = false;
  renderSync();
  if(syncAgain){ syncAgain = false; syncSoon(); }
}
/* 打っている最中に何度も送らない。少し待ってからまとめて */
function syncSoon(){
  if(!syncOn()) return;
  SY.dirtyAt = Date.now();          // 「この端末で直した時刻」。届いたものと比べるのに使う
  saveSync();
  if(syncing){ syncAgain = true; return; }
  if(syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(()=> syncNow(true), SYNC_GAP);
}

/* ---- 設定タブ ---- */
function renderSync(){
  const el = $("syncNote"); if(!el) return;
  const on = syncOn();
  ["syncUrl","syncName","syncPass"].forEach(id => {
    const f = $(id);
    if(f && document.activeElement !== f){
      // アドレスは、まだ決めていなければ既定を出しておく（そのまま「つなぐ」で使える）
      f.value = id === "syncUrl" ? (SY.url || SYNC_URL_DEFAULT) : id === "syncName" ? SY.name : SY.pass;
    }
  });
  $("syncGo").disabled = !on;
  $("syncGo").style.opacity = on ? "" : ".45";
  $("syncOff").style.display = on ? "" : "none";
  el.innerHTML = !on
    ? '<div class="empty-note">まだ設定していません。この端末のデータは、この端末の中だけにあります。</div>'
    : '<div class="kv"><span>' + esc(SY.name) + ' として同期</span><span>' +
        (SY.at ? "最後に合わせたのは " + hhmm(SY.at) : "まだ合わせていません") + '</span></div>' +
      (syncNote ? '<div class="empty-note">' + esc(syncNote) + '</div>' : '');
}
function bindSync(){
  if(!$("syncSave")) return;
  $("syncSave").onclick = async ()=>{
    const url = $("syncUrl").value.trim(), name = $("syncName").value.trim(), pass = $("syncPass").value;
    if(!url || !name || !pass){ toast("3つとも入れてください"); return; }
    if(!/^https?:\/\//.test(url)){ toast("アドレスは https:// から入れてください"); return; }
    const ok = await askConfirm("この端末を同期につなぎますか？", "つなぐ",
      "最初の1回は、先に同期した端末の中身が優先されます。念のため、つなぐ前に" +
      "「バックアップ書き出し」をしておくと安全です。");
    if(!ok) return;
    SY.url = url; SY.name = name; SY.pass = pass;
    syncKeys = null; saveSync(); renderSync();
    syncNow();
  };
  $("syncGo").onclick  = ()=> syncNow();
  $("syncOff").onclick = async ()=>{
    const ok = await askConfirm("この端末の同期をやめますか？", "やめる",
      "この端末に入っているものは消えません。サーバーに預けたものも消えません。");
    if(!ok) return;
    SY = { url:"", name:"", pass:"", cursor:0, marks:{}, at:0 };
    syncKeys = null; saveSync(); renderSync();
    toast("同期をやめました");
  };
}

/* 古い日のデータを捨てる（保存を太らせない） */
function prune(){
  const keep = 180;
  // 日付の形になっていない日は捨てる（＋−の不具合で作られてしまったぶんの後始末）
  Object.keys(S.days).forEach(k => { if(!DAYKEY_RE.test(k)) delete S.days[k]; });
  const keys = Object.keys(S.days).sort();
  if(keys.length > keep) keys.slice(0, keys.length - keep).forEach(k => delete S.days[k]);
  const rk = Object.keys(S.routineDone).sort();
  if(rk.length > 60) rk.slice(0, rk.length - 60).forEach(k => delete S.routineDone[k]);
  // 今週だけの上書きは、その週が過ぎたら捨てる（週が変われば元の回数に戻る）
  const thisW = weekId();
  Object.keys(S.weekOverrides).forEach(w => { if(w < thisW) delete S.weekOverrides[w]; });
}
/* 日付が変わったら哲学を1つ進める */
function rollDay(){
  const k = dayKey();
  if(S.lastOpen !== k){
    if(S.lastOpen && S.philos.length) S.philoIdx = (S.philoIdx + 1) % S.philos.length;
    S.lastOpen = k;
    cursor = 0;
    winner = null;
    prune();
    ensureDay(k);   // その日の箱を用意し、そのときだけ自動配置を走らせる
    save();
  }
}

/* 更新用に付けた ?r=… はURLに残さない（残すとその形でキャッシュされる） */
if(location.protocol !== "file:" && /[?&]r=/.test(location.search)){
  try{ history.replaceState(null, "", location.pathname); }catch(e){}
}

prune();
rollDay();
syncFreqLine();
$("taskSize").dispatchEvent(new Event("input"));
renderAll();
save();
checkForUpdate();

bindSync();
/* ▼ 起動時も合わせる。ただし描画のあと。
   受け取ったものは、その日を作り直すのではなく「向こうのものを採る」形で入る
   （初めての日は marks が無いので、向こうのものがそのまま入る） */
if(syncOn()) setTimeout(()=> syncNow(true), 800);

/* 読み込みに失敗していたら、必ず気づけるようにする（退避先は KEY + "-broken"） */
if(loadFailed){
  toast("前のデータを読めませんでした（" + loadFailed + "）。中身は消さずに退避してあります");
  console.error("load failed:", loadFailed, "→ 退避先 localStorage:", KEY + "-broken");
}
if(diaryFailed){
  toast("日記を読めませんでした（" + diaryFailed + "）。中身は消さずに退避してあります");
  console.error("diary load failed:", diaryFailed, "→ 退避先 localStorage:", DKEY + "-broken");
}

/* タブを開きっぱなしでも、午前2時／午後の切り替わりで表示が変わること */
let lastKey = dayKey(), lastSlot = nowSlot();
setInterval(()=>{
  renderHeader();
  const k = dayKey(), s = nowSlot();
  if(k !== lastKey || s !== lastSlot){
    lastKey = k; lastSlot = s;
    rollDay();
    renderAll();
  }
}, 15000);
document.addEventListener("visibilitychange", ()=>{
  if(document.hidden) return;
  const k = dayKey(), s = nowSlot();
  if(k !== lastKey || s !== lastSlot){ lastKey = k; lastSlot = s; rollDay(); }
  renderAll();
  // 戻ってきたら合わせる。ただし、ぱたぱた切り替えるたびには行かない
  if(syncOn() && Date.now() - (SY.at || 0) > SYNC_MIN) syncNow(true);
});
