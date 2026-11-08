#!/usr/bin/env node
/**
 * 《世界大战 1936》本机反馈服务器  ·  v2.1.3
 * ------------------------------------------------------------------
 * 干什么用的：
 *   浏览器里跑的游戏没法凭空往 D:\Qst 写文件（要么弹一次文件夹授权，要么丢进下载目录）。
 *   所以在这个「服务器端」（就是你自己的电脑）上开一个小服务，游戏把反馈 POST 过来，
 *   服务器用 fs 直接写进 D:\Qst —— 零弹窗、零授权、路径固定。
 *
 * 怎么用：
 *   双击同目录下的「启动反馈服务器.bat」（会顺便用 http://127.0.0.1:8765/ 打开游戏）。
 *   也可以手动：node feedback-server.js
 *
 * 它同时还是静态服务器：把游戏目录整份挂在 http://127.0.0.1:8765/ 上，
 * 这样页面与接口同源，连跨域问题都不会有。关掉窗口 / Ctrl+C 即停止。
 *
 * 可选环境变量：
 *   WW_FB_PORT  端口，默认 8765
 *   WW_FB_DIR   落盘目录，默认 D:\Qst
 */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT     = __dirname;
const PORT     = parseInt(process.env.WW_FB_PORT, 10) || 8765;
const HOST     = '127.0.0.1';
const WANT_DIR = process.env.WW_FB_DIR || 'D:\\Qst';
const SUMMARY  = '_全部反馈汇总.txt';
const MAX_BODY = 256 * 1024;

function pad(n){ return (n < 10 ? '0' : '') + n; }
function ts(){
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + ' '
       + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}
function stampName(){
  const d = new Date();
  return 'feedback_' + d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate()) + '-'
       + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.txt';
}

// ---------------- 落盘目录 ----------------
// 优先用户指定的 D:\Qst；D 盘不存在 / 无权限时自动退到脚本目录下的 feedback\，不让反馈丢掉
let OUT_DIR = WANT_DIR;
let OUT_NOTE = '';
function resolveDir(){
  for (const cand of [WANT_DIR, path.join(ROOT, 'feedback'), ROOT]) {
    try {
      fs.mkdirSync(cand, { recursive: true });
      const probe = path.join(cand, '.ww_write_test');
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
      if (cand !== WANT_DIR) OUT_NOTE = '（' + WANT_DIR + ' 不可写，已落回 ' + cand + '）';
      return cand;
    } catch (e) { /* 试下一个 */ }
  }
  return ROOT;
}
OUT_DIR = resolveDir();

// ---------------- 反馈落盘 ----------------
function safeName(name){
  let n = String(name || '').replace(/[\\/:*?"<>|]/g, '').trim();
  if (!n) return stampName();
  if (!/\.txt$/i.test(n)) n += '.txt';
  if (n.length > 90) n = stampName();
  return n;
}
function uniquePath(dir, name){
  let p = path.join(dir, name);
  if (!fs.existsSync(p)) return p;
  const base = name.replace(/\.txt$/i, '');
  for (let i = 2; i < 999; i++) {
    p = path.join(dir, base + '-' + i + '.txt');
    if (!fs.existsSync(p)) return p;
  }
  return path.join(dir, stampName());
}
function writeFeedback(fname, text){
  const name = safeName(fname);
  const full = uniquePath(OUT_DIR, name);
  const body = String(text == null ? '' : text);
  fs.writeFileSync(full, body, 'utf8');
  // 一份汇总，方便一次性翻看全部反馈
  try {
    fs.appendFileSync(path.join(OUT_DIR, SUMMARY),
      '\n===== ' + ts() + '  ' + path.basename(full) + ' =====\n' + body + '\n', 'utf8');
  } catch (e) { /* 汇总失败不影响主文件 */ }
  return full;
}

// ---------------- HTTP ----------------
function cors(res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Chrome 私有网络访问（网页 → 127.0.0.1）需要的预检应答
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Cache-Control', 'no-store');
}
function sendJson(res, code, obj){
  const s = JSON.stringify(obj);
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(s);
}
const MIME = {
  '.html':'text/html; charset=utf-8', '.htm':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.txt':'text/plain; charset=utf-8',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif',
  '.svg':'image/svg+xml', '.webp':'image/webp', '.ico':'image/x-icon',
  '.mp3':'audio/mpeg', '.wav':'audio/wav', '.ogg':'audio/ogg', '.woff2':'font/woff2'
};
function serveStatic(req, res, pathname){
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const full = path.normalize(path.join(ROOT, rel));
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}); res.end('404'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(full).pipe(res);
  });
}
function readBody(req, cb){
  let chunks = [], len = 0, dead = false;
  req.on('data', d => {
    if (dead) return;
    len += d.length;
    if (len > MAX_BODY) { dead = true; cb(new Error('too large')); return; }
    chunks.push(d);
  });
  req.on('end', () => { if (!dead) cb(null, Buffer.concat(chunks).toString('utf8')); });
  req.on('error', e => { if (!dead) { dead = true; cb(e); } });
}

const server = http.createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0];

  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return; }

  // 探活：游戏面板一打开就调它，决定显示「已连接 / 未启动」
  if (pathname === '/api/feedback/ping') {
    sendJson(res, 200, { ok: true, dir: OUT_DIR, note: OUT_NOTE, port: PORT, ver: 'v2.1.3' });
    return;
  }

  if (pathname === '/api/feedback' && req.method === 'POST') {
    readBody(req, (err, raw) => {
      if (err) { sendJson(res, 413, { ok: false, error: String(err.message || err) }); return; }
      let payload = {};
      try { payload = JSON.parse(raw || '{}'); } catch (e) { payload = { text: raw }; }
      const text = payload.text || payload.body || '';
      if (String(text).trim().length < 1) { sendJson(res, 400, { ok: false, error: 'empty' }); return; }
      let full;
      try {
        OUT_DIR = resolveDir();               // 每次写之前复核一次（D 盘可能刚插上 / 刚被占用）
        full = writeFeedback(payload.fname, text);
      } catch (e) {
        sendJson(res, 500, { ok: false, error: String((e && e.message) || e) });
        return;
      }
      const file = path.basename(full);
      console.log('[' + ts() + '] 收到反馈 → ' + full + '  (' + text.length + ' 字)');
      sendJson(res, 200, { ok: true, path: full, file: file, dir: OUT_DIR, bytes: Buffer.byteLength(text, 'utf8') });
    });
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') { serveStatic(req, res, pathname); return; }
  res.writeHead(405); res.end('method not allowed');
});

server.on('error', (e) => {
  if (e && e.code === 'EADDRINUSE') {
    console.error('\n[错误] 端口 ' + PORT + ' 已被占用 —— 可能已经有一个反馈服务器在跑了。');
    console.error('       直接开浏览器访问 http://' + HOST + ':' + PORT + '/ 试试；或换个端口：');
    console.error('       set WW_FB_PORT=8766 && node feedback-server.js\n');
  } else {
    console.error('[错误]', e && e.message || e);
  }
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  const url = 'http://' + HOST + ':' + PORT + '/';
  console.log('');
  console.log('  《世界大战 1936》本机反馈服务器 已启动');
  console.log('  ------------------------------------------------');
  console.log('  游戏地址 : ' + url);
  console.log('  反馈落盘 : ' + OUT_DIR + (OUT_NOTE ? ' ' + OUT_NOTE : ''));
  console.log('  汇总文件 : ' + path.join(OUT_DIR, SUMMARY));
  console.log('  ------------------------------------------------');
  console.log('  浏览器里提交的反馈会直接写成 txt 落进上面的目录，全程不弹窗。');
  console.log('  关掉这个窗口（或按 Ctrl+C）即停止服务。');
  console.log('');
});

process.on('SIGINT',  () => { console.log('\n已停止反馈服务器。'); process.exit(0); });
process.on('SIGTERM', () => { process.exit(0); });
