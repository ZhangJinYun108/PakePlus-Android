/* ============================================================
   必须记 · Supabase 同步配置
   使用方法：
   1) 把本文件复制为 sync-config.js（不要改文件名）
   2) 在 supabase.com 控制台建项目，把 URL 和 anonKey 填到下面
   3) 在 index.html 的 <head> 里加载本文件 + supabase-js CDN
   ============================================================ */

window.SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';      // ← 改成你的 Project URL
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.YOUR_ANON_KEY'; // ← 改成你的 anon public key

// 可选：在右上角小徽标里显示账号提示
window.SUPABASE_LABEL = 'Supabase 实时同步';