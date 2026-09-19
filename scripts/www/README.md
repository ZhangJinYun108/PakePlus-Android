# 必须记 · PAKE Plus

> 极简个人生活管理 · 手机端与电脑端实时同步

一款用 **HTML + CSS + 原生 JS** 写就的个人生活管理 App，可以直接用
[PakePlus](https://github.com/tw93/pakeplus) 一键打包成 Windows / macOS / Linux
桌面应用，或在手机端以「网页封装」的形式运行。

---

## 目录结构

```
必须记/
├── index.html         # 单页入口（含全部屏幕）
├── css/styles.css     # 极简白绿风格
├── js/
│   ├── data.js        # 数据层（localStorage + 实时同步适配器）
│   ├── data-supabase.js   # ★ B 方案 · Supabase 跨设备同步（补丁）
│   ├── parser.js      # 语义预判分类器
│   └── app.js         # 应用主逻辑（路由 + 渲染 + 交互）
├── pakeplus.json      # PakePlus 打包配置
├── make_icons.py      # 应用图标生成脚本（Pillow）
├── README.md          # 你正在看的文件
└── assets/            # icon.png/ico、tray.png、loading.html 等（见下方「应用图标」）
```

---

## 一键运行（无需打包）

直接用浏览器打开 `index.html` 即可看到完整效果：

- 用 Chrome / Edge 打开 → 默认展示手机端壳（375 × 812）
- 把窗口拉到 ≥ 1024px 宽 → 自动切换到电脑端布局
- 录入一条「午饭 牛肉面 ¥28」→ 弹出预判弹窗
- 点击「确认保存」→ 数据落入 localStorage
- 多浏览器窗口同时打开 → 通过 BroadcastChannel 自动实时同步

---

## 用 PakePlus 打包成桌面 / 手机应用

### 1. 安装 PakePlus

到 GitHub Release 下载安装包：<https://github.com/tw93/PakePlus/releases>

### 2. 导入项目

- 打开 PakePlus →「导入项目」
- 选择 `必须记` 整个文件夹（或先打成 zip）
- `pakeplus.json` 会被自动识别为打包配置

### 3. 一键打包

PakePlus 会读 `pakeplus.json` 的 `window` / `build` / `platforms` 字段，生成：

| 平台 | 产物 |
|---|---|
| Windows | `必须记-1.0.0-setup.exe` / `必须记-1.0.0.msi` |
| macOS   | `必须记-1.0.0.dmg` / `必须记-1.0.0.pkg` |
| Linux   | `必须记-1.0.0.deb` / `必须记.AppImage` |
| Android | 直出 APK（手机端壳） |

---

## 应用图标（桌面快捷方式）

打包成功后，**桌面快捷方式、任务栏、开始菜单、系统托盘**会自动使用下面这套图标，无需手动设置：

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `assets/icon.png` | 1024×1024 | 主图标源文件（PakePlus 自动派生各平台格式） |
| `assets/icon.ico` | 16~256 多分辨率 | **Windows 快捷方式 / 任务栏 / 资源管理器** |
| `assets/tray.png` | 64×64 | 系统托盘（右下角常驻小图标） |
| `assets/apple-touch.png` | 180×180 | iOS 添加到主屏幕 |
| `assets/favicon-32.png` | 32×32 | 浏览器标签栏 |
| `assets/icon.svg` | 矢量 | 设计源文件（改色 / 改形用） |
| `assets/loading.html` | — | 启动加载页（图标 + 渐进动画） |

图标设计：鼠尾草绿渐变圆角方块 + 白色对勾（代表「已记录」）+ 右上角同步光点（代表双端实时互通），与 App 内主色 `#3D8A5A` 完全一致。

### 想换图标？两种方式

**方式一 · 改参数重生成（推荐，1 分钟）**

打开 `make_icons.py`，改这几个常量即可：

```python
TOP  = (91, 166, 120)   # 渐变浅端（RGB）
BOTTOM = (47, 110, 69)  # 渐变深端（RGB）
CHECK_POINTS = [(280, 530), (450, 700), (750, 360)]  # 对勾三个折点
CHECK_WIDTH  = 90        # 对勾粗细
DOT_CX, DOT_CY, DOT_R = 820, 220, 48  # 同步光点位置和大小
CORNER_RATIO = 0.225     # 圆角比例（iOS 风格约 0.22~0.24）
```

然后重新生成：

```bash
python make_icons.py
```

一次产出上面表格里的全部 7 个文件，打包时自动生效。

**方式二 · 用现成图片替换**

把你自己的 1024×1024 PNG 覆盖 `assets/icon.png`，再用任意在线工具
（如 <https://icoconvert.com>）转一份多分辨率 `.ico` 覆盖 `assets/icon.ico` 即可。

### 打包后桌面图标没变？—— Windows 图标缓存

Windows 会缓存快捷方式图标。**重新打包后如果桌面图标还是旧的**，任选一种刷新：

```powershell
# 方法一：刷新图标缓存（立即生效，无需重启）
ie4uinit.exe -show

# 方法二：删除缓存文件后重启资源管理器
taskkill /f /im explorer.exe
del /a %localappdata%\IconCache.db
start explorer.exe
```

> macOS / Linux 无此问题，打包后图标即时生效。

---

## 实时同步方案（重点）

PakePlus 只是「把网页塞进壳」，它**不负责数据同步**。要让手机端和电脑端的
体重、账目、待办、愿望单等真正实时打通，需要一个**云同步后端**。

下面是从「最简单」到「最通用」的四种方案，按需选择：

### 方案 A · 同一个浏览器 Profile（零成本，5 秒）

适用：你自己用手机 + 电脑，希望两边数据是同一份。

- 在 Chrome / Edge 上**登录同一个 Google / 微软账号**
- 把「必须记」作为**已安装的 PWA 添加到桌面**（Chrome 右上角 → 安装）
- 同一个 Profile 下的所有标签页共用一个 localStorage

缺点：只适用于「同一台 Chrome 实例内的不同设备」。
优点：完全零配置，**当前代码已开箱即用**。

### 方案 B · Supabase 跨设备实时同步（推荐个人，10 分钟）★

**适用**：真正的跨设备实时互通，**完全免费**，个人数据零运维。

#### B.1 为什么选 Supabase

- 免费 500 MB 数据库 + 1 GB 存储 + 5 GB 出口带宽 + 5 万月活 — 个人用一辈子
- 原生 **Realtime 订阅**（基于 PostgreSQL 的 logical replication）
- 提供 **anon key**（公开 token，前端直接用，无需搭后端）
- 中文控制台，自动开启 HTTPS / WebSocket

#### B.2 五步开通

1. **注册**：打开 <https://supabase.com> → 「Start your project」→ GitHub 一键登录
2. **新建项目**：「New project」→ 名字写 `bixu-ji`、密码自设、地区选 `Singapore`（国内最稳）→ 等约 1 分钟初始化完成
3. **建表**：左侧「SQL Editor」→ 把下面这段贴进去，点 Run

   ```sql
   create table if not exists state (
     id text primary key,
     payload jsonb not null,
     updated_at timestamptz default now()
   );

   alter publication supabase_realtime add table state;
   ```

4. **拿到 API key**：左侧「Project Settings」→「API」→
   - 拷贝 `Project URL`（形如 `https://xxxxx.supabase.co`）
   - 拷贝 `anon public` key（一长串 `eyJ...`）

5. **填进项目**：打开 `js/data-supabase.js`，把前两行的占位符换成你自己的：

   ```js
   const SUPABASE_URL = 'https://xxxxx.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
   ```

#### B.3 把同步逻辑接到现有代码

打开 `js/data.js`，做两步替换即可：

**a. 在 `index.html` 的 `<head>` 末尾加 supabase 客户端**：

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

**b. 替换 `data.js` 里的 `_initSync()` 和 `_broadcast()`**：

把 `data-supabase.js` 文件末尾的两个函数（`_initSync`、`_broadcast`）整段
替换掉 `data.js` 里同名的那两个方法。如果你不想手改：

```bash
# 直接在 data.js 末尾追加 data-supabase.js 作为补丁
cat js/data-supabase.js >> js/data.js
```

> ⚠️ 第一次打开应用时，因为云端还没有数据，**首次录入的设备会成为「基准」**。
> 之后任何一端的改动都会在 100ms 内同步到其它端。

#### B.4 验证是否成功

- A 设备录入一条「晚饭 ¥45」→ toast 提示「已记录收支」
- B 设备（手机 / 桌面任一）等待 1 秒 → 自动出现在该设备的首页和明细里
- 控制台会看到 `[sync] pushed to cloud @ 11:32:05` 和 `[sync] pulled @ 11:32:06`

如果一段时间不推送，请检查：
- Supabase 控制台 → `state` 表里有没有新行
- `updated_at` 字段有没有更新
- 浏览器控制台 → 看看有没有 `[sync] push error` 的报错

#### B.5 安全小贴士

`anon key` 暴露在客户端是 Supabase 推荐的用法，因为 RLS（行级权限）默认开启。
本项目只用到一张「单行表 + 自己读写」，安全模型已经够用。

如有多人共用同一份代码的需求，给 `state` 表加一行策略：

```sql
alter table state enable row level security;
create policy "anyone can read" on state for select using (true);
create policy "anyone can upsert" on state for insert with check (true);
create policy "anyone can update" on state for update using (true);
```

---

### 方案 C · 自建轻量 WebSocket（30 行）

适用：写代码的自己用，最干净可控。

部署一个 30 行的 Node ws 服务，转发每个客户端的 state 推送。详见 `js/data.js`
注释里的参考片段，部署到 Cloudflare Workers / Vercel / Railway 都可以。

### 方案 D · WebDAV / 坚果云同步（个人轻量）

把 localStorage 序列化 → 每 30 秒 POST 到你的 WebDAV。无需写后端，但延迟 30 秒。

---

## 怎么选用哪种方案？

| 你想要的体验 | 推荐方案 |
|---|---|
| 自己两台设备，懒得折腾 | **方案 A** （Chrome Profile） |
| 真正的跨设备实时 + 零运维 | **方案 B · Supabase ★** |
| 写代码党 / 想了解实时同步原理 | **方案 C** （自建 WS） |
| 极简、不在乎延迟 | **方案 D** （WebDAV） |

> 💡 当前 `data.js` 已经实现了**同一设备多窗口**的实时同步（用 BroadcastChannel）。
> **跨设备同步需要替换 `_initSync()` 这一段**——其它代码全部不用动。

---

## 功能一览

| 功能 | 入口 | 数据去向 |
|---|---|---|
| 今日体重 | 首页顶部 | 录入后自动归档 |
| 今日待办 | 首页中段 | 含手动添加与来自纪念日提醒的预生成项 |
| 今日收支 | 首页下方 | 红色为收入、绿色为支出 |
| 统一输入框 | 首页底部 | 智能预判六类分类，需手动确认才生效 |
| 记账明细 | 首页右上「明细」 | 日 / 周 / 月 / 年切换 + 分类汇总 |
| 体重变化 | 明细 → 体重 | 近 7/30/365 天曲线 |
| 餐食热量 | 明细 → 热量 | 柱状图 + 目标进度 + 三餐明细 |
| 愿望单 | 明细 → 愿望 | 横向卡片，点击进入详情 |
| 电脑端视图 | 自动 ≥1024px | 侧边栏导航 + 同步状态徽标 |
| 左滑返回 | 所有 Modal | 仅返回上一级，不退出 App |

---

## 风格 & 设计 Token

| Token | 值 |
|---|---|
| 底色 | `#F5F4F1`（暖白） |
| 卡片 | `#FFFFFF` 20px 圆角，极柔阴影 |
| 主色 | `#3D8A5A`（鼠尾草绿） |
| 收入 | `#C94F32`（赭红，国内习惯） |
| 支出 | `#3D8A5A`（主色） |
| 文字 | `#1A1918` / `#8A867E` / `#A8A49C` |
| 字体 | Inter（中文：苹方 / 微软雅黑）|
| 数字字体 | JetBrains Mono（等宽对齐） |

---

## License

MIT · 这是一款个人项目模板，欢迎修改。