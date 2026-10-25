# 强制清醒闹钟 · 项目上下文

> 这份文档供**接手的开发者**或**新的 AI 会话**快速建立上下文。目标是读完就能改代码，
> 并且不会踩已经踩过的坑。最后更新：2026-10-25（第 20 个提交 `e6c0358`）。

---

## 1. 这是什么

一个「不完成任务就叫不醒你」的闹钟。到点后进入全屏锁定，必须持续摇晃手机或原地踏步
完成动作任务才能关闭；中途停手，进度清零，闹钟强度提升。

**核心承诺**：动作不停，闹钟不止。

---

## 2. 当前形态与部署

| 形态 | 地址 / 方式 | 说明 |
|---|---|---|
| 网页版 | https://26308yms114514.github.io/omniflow-app-opog-main/ | GitHub Pages，纯静态，HTTPS |
| 安卓 APK | GitHub Releases `apk-latest` | Capacitor 8 包壳，GitHub Actions 云端编译 |

**部署命令**

```bash
cd frontend && pnpm deploy:pages     # 构建 + 强推 gh-pages（网页版上线）
git push origin main                 # 自动触发 .github/workflows/android.yml 出 APK
```

> ⚠️ 本机**没有** JDK / Android SDK / gradle / adb，APK 只能靠 CI 构建。
> CI 完成后 Release 资产会被新的覆盖，下载地址不变。

**已废弃**：早期部署在 Omniflow（`cmtp92or6005.useomniflow.com`），因平台积分耗尽弃用。
它的线上版本停留在初始提交，与当前代码无关，**不要再拿它做验证**。

---

## 3. 技术栈

React 18 · TypeScript 5.5 · Vite 5 · Tailwind CSS 4 · shadcn/ui · HashRouter ·
Capacitor 8（安卓壳）

**数据全部存在 localStorage**，没有后端参与运行时。仓库里的 `backend/`（Express +
Drizzle + PostgreSQL）是初始模板遗留，当前**未被任何界面调用**，只有 `drizzle.config.ts`
和 `db:push` 脚本还能用。

---

## 4. 目录地图

```
frontend/src/
├── lib/                      纯逻辑，尽量无浏览器依赖，可单元测试
│   ├── auth.ts               本机账号：PBKDF2 哈希、会话、按账号分键
│   ├── alarm-tone.ts         响铃通道：内存合成 WAV + <audio> 循环
│   ├── vibration-alarm.ts    震动通道：模式数学 + 循环重发
│   ├── alarm-output.ts       把上面两个通道合成「闹钟输出」一个概念
│   ├── anti-cheat.ts         机械晃动识别（挥动间隔变异系数）
│   ├── next-alarm.ts         下次响铃时刻、到点判定、倒计时文案
│   ├── active-ring.ts        正在响的闹钟（防逃跑的持久化依据）
│   ├── step-counter.ts       踏步峰值检测
│   ├── motion.ts             加速度读取、阈值、vibrationAllowed()
│   ├── difficulty.ts         难度档位如何改变阈值
│   ├── snooze.ts             贪睡状态与难度加成
│   ├── elapsed.ts            从时钟推导时长（不用 tick 累加）
│   ├── environment.ts        环境自检的判定规则（纯函数）
│   ├── fullscreen.ts         全屏 + 竖屏锁定（可注入环境，永不抛异常）
│   ├── notify.ts             通知权限 + Service Worker
│   └── local-store.ts        localStorage 读写 + 同标签页订阅
├── hooks/
│   ├── use-alarm-scheduler.ts   ⭐ 全局调度器，闹钟的所有权在这里
│   ├── use-alarms.ts            闹钟与统计（键按账号隔离）
│   └── ...
├── pages/                    8 个页面，其中 2 个是展示/演示页
└── components/custom/        AlarmScheduler（调度器外壳）、AuthScreen、环境自检卡
```

---

## 5. 关键设计决策（改代码前必读）

### 5.1 调度器拥有一切

`use-alarm-scheduler` 是最重要的模块：它决定闹钟何时响、谁在响、是否过期。
**返回手势、刷新页面、切走再回来都不能关掉闹钟**——只有完成任务才能。

### 5.2 两条闹钟通道，失败方式互补

| 通道 | 机制 | 何时失效 |
|---|---|---|
| 响铃 | `<audio>` 循环播放合成 WAV | 媒体音量为 0、未解锁播放 |
| 震动 | `navigator.vibrate` 循环 | **锁屏后规范禁止震动** |
| 通知 | Service Worker showNotification | **锁屏后唯一还活着的通道** |

所以「系统通知」在环境自检里是**关键**级别（前提是浏览器支持；不支持时降级为说明项，
不判失败——用户无从修复的东西不该显示红叉）。

### 5.3 账本是本机的

`lib/auth.ts` 是**设备本地账号**，不是云端登录：换手机不同步、忘记密码无法找回。
密码仍做 PBKDF2-SHA256 加盐哈希（150k 迭代），因为手机要递给别人。

存储键形如 `alarms_v1::<userId>`。`App.tsx` 用 `key={user.id}` 包裹路由树，
切换账号时整棵树重挂载，所有钩子自然重新读取各自的键——**不需要每个组件懂账号**。

### 5.4 环境自检是一等公民

`EnvironmentCheck` 把五类静默失败变成可见清单：安全上下文、动作传感器、闹钟输出、
系统通知、屏幕常亮。安卓上的失败大多是**不报错**的，这是本项目最重要的一条经验。

---

## 6. 已经踩过的坑（不要重犯）

| 坑 | 症状 | 现在的做法 |
|---|---|---|
| 静默失败 | 完全没声音、零报错，无从排查 | 把「是否真在播」变成可断言状态；e2e 读 `paused/currentTime/duration` |
| 解锁竞态 | 解锁音频的 `pause()` 把刚启动的闹钟按停 | `startRequested` 标志保护；`start()` 主动清 muted |
| 同一概念多处实现 | 时间格式、时长计算、「通知是否可用」各写两三遍后互相矛盾 | 收敛到 `formatClock` / `elapsedSecondsSince` / `notificationPermission` |
| 后台节流 | 切后台后「已用时」走慢，与完成页数字不符 | 一律从时间戳推导，不累加 tick |
| 双击 | 两个计时器同时跑，计时翻倍 | 重入保护 + 按钮 `disabled` |
| 误触删除 | 删除紧挨测试，一点就永久丢失 | 确认对话框 |
| WebView 静默无震动 | 少了 `VIBRATE` 权限 | 已在 AndroidManifest 声明 |
| 传感器失效 | WebView 非安全上下文时 `DeviceMotionEvent` 不存在 | `androidScheme: 'https'` |
| tsc 漏检 | `vite build` 不做类型检查，缺 import 也能过 | 提交前必须跑 `tsc` |

---

## 7. 测试与验证

```bash
cd frontend
pnpm test        # 单元测试：14 个文件 / 189 项
pnpm test:e2e    # 端到端：72 项，真实 Edge 浏览器
pnpm typecheck   # tsc
```

- 测试用 `tsx` 逐文件子进程运行，不依赖 vitest。
- e2e 用本机已装的 **Edge**（`channel: 'msedge'`），不下载浏览器。
- e2e 需要两个服务：HTTPS 预览（`vite preview --port 4173`）和回环 HTTP
  （`python -m http.server 4180`，用于验证通知与 Service Worker）。
- **端到端第一个动作是注册账号**，后续所有数据播种都要用 `window.__scoped(...)`
  拼出带账号前缀的存储键，否则写进去的地方应用永远读不到。

---

## 8. 当前局限（诚实清单）

1. **闹钟需要应用在运行**。网页版页面关掉、APK 进程被杀，到点都不会响。
   要彻底解决必须接原生 AlarmManager（`@capacitor/local-notifications`）。
2. **锁屏后只有通知**。震动被规范禁止；响铃能否持续取决于系统策略。
3. **iOS Safari 不支持 `navigator.vibrate`**，在 iPhone 上等于没有震动通道。
4. **账号是本机的**，不联网、不同步、不可找回。
5. **防作弊只做了机械晃动识别**；落地页仍宣称「躺卧姿态检测」和「95% 拦截率」，
   这两项**没有实现**（`AppPreview.tsx`，待定夺）。
6. 落地页仍列着几个「即将」功能（扫码任务、随机任务池等），未实现。

---

## 9. 待办与悬而未决

- [ ] 原生闹钟（AlarmManager + 前台服务）——**最大的一块未完成价值**
- [ ] 落地页宣称与实现对齐（姿态检测：实现 or 删除）
- [ ] 真机验收：传感器、震动强度、锁屏通知是否如期
- [ ] 后端是否启用（目前纯前端，`backend/` 闲置）

---

## 10. 快速上手

```bash
# 网页开发（自带 HTTPS，手机同网可直接访问，传感器才可用）
cd frontend && pnpm dev

# 重新生成自签证书（.certs/ 已被 gitignore）
pnpm cert

# 更新线上网页
pnpm deploy:pages

# 出新的 APK：推 main 即可，CI 自动构建并发布
```

漏了证书也能跑，只是手机通过局域网访问时传感器会静默失效——这就是环境自检存在的理由。
