/**
 * 云同步配置（Supabase）
 *
 * 默认为空 = 纯本地模式（localStorage + 同设备多窗口同步），开箱即用。
 * 想开启跨设备实时同步时，把下面两个常量填上你自己的 Supabase 项目值：
 *   1. 打开 https://supabase.com → 你的项目 → Project Settings → API
 *   2. 拷贝 Project URL 和 anon public key
 *
 * 详见 README.md「方案 B · Supabase」。
 */

window.SUPABASE_URL = '';        // 例如 'https://xxxxx.supabase.co'
window.SUPABASE_ANON_KEY = '';   // 例如 'eyJhbGciOiJIUzI1NiIs...'
