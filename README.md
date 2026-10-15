# 强制清醒闹钟

赖床终结者 — 通过持续性身体动作任务与中断重置惩罚机制，从根源破除赖床惯性。

## 技术栈

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui
- **路由**: React Router v6 (HashRouter)
- **状态持久化**: localStorage (use-localStorage hook)
- **图标**: Lucide React
- **通知**: Sonner (toast)

## 项目结构

```
frontend/src/
├── pages/
│   ├── Index.tsx          # 首页 / 仪表盘 (路由: /)
│   ├── AlarmList.tsx      # 闹钟列表管理 (路由: /alarms)
│   ├── AlarmEdit.tsx      # 闹钟新增/编辑 (路由: /edit/:id)
│   ├── TaskExecution.tsx  # 任务执行全屏锁定 (路由: /task/:id)
│   ├── Stats.tsx          # 起床数据统计 (路由: /stats)
│   ├── AppPreview.tsx     # 产品预览/落地页 (路由: /f6db0085-1264-4a77-b32e-fa2731e8654f)
│   ├── TaskDemoPreview.tsx # 任务体验预览：可交互的摇晃任务/中断惩罚模拟 (路由: /42ed530e-ac29-4218-87cd-e291989cf9c6)
│   └── NotFound.tsx       # 404 通配符回退 (路由: *)
├── components/
│   ├── custom/
│   │   ├── AlarmCard.tsx  # 闹钟卡片组件
│   │   └── OmniflowBadge.tsx
│   └── ui/                # shadcn/ui 预装组件 (勿修改)
├── hooks/
│   ├── use-alarms.ts      # 闹钟 CRUD + 会话管理
│   └── use-localStorage.ts
├── types/
│   └── alarm.ts           # 所有类型定义: Alarm, AlarmConfig, AlarmSession, TaskType 等
└── App.tsx                # 路由注册
```

## 核心功能 (V1.0)

- **闹钟管理**: 新增/编辑/删除多个闹钟，支持周期重复设置
- **任务执行引擎**: 持续摇晃、原地踏步任务，实时进度检测
- **中断惩罚机制**: 动作中断超时即清零，音量自动提升 20%
- **防作弊**: 机械晃动识别、躺卧姿态检测
- **数据统计**: 起床成功率、平均用时、中断次数趋势
- **产品预览落地页**: `/f6db0085-1264-4a77-b32e-fa2731e8654f` — 完整品牌落地页，含 Hero、核心功能、六大任务、防作弊亮点、版本路线图、CTA
- **任务体验预览**: `/42ed530e-ac29-4218-87cd-e291989f9c6` — 极简硬核黑红风格（纯黑底、#FF3B30 红色强调、粗边框、直角、角标、扫描线动画、发光进度条）；手机框内的交互式模拟（useReducer 状态机）：按住模拟摇晃推进进度，松开超 3 秒清零、音量 +20%、红色中断警告，完成后展示用时与中断次数；附全局硬性规则说明。该页面的黑红主题仅在页面内局部应用（Tailwind 调色板类 + 页内 keyframes），不修改全局 index.css
- **404 回退**: 通配符路由 `*` → NotFound.tsx，含返回上页 + 返回首页 + 快捷链接

## 路由表

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | Index | 首页仪表盘 |
| `/alarms` | AlarmList | 闹钟列表 |
| `/edit/:id` | AlarmEdit | 新增/编辑闹钟 |
| `/task/:id` | TaskExecution | 任务执行全屏 |
| `/stats` | Stats | 数据统计 |
| `/f6db0085-1264-4a77-b32e-fa2731e8654f` | AppPreview | 产品预览落地页 |
| `/42ed530e-ac29-4218-87cd-e291989cf9c6` | TaskDemoPreview | 任务体验预览 |
| `*` | NotFound | 404 回退 |

## 数据模型

所有数据存储于 localStorage:
- `alarms_v1`: `Alarm[]` — 闹钟配置列表
- `sessions_v1`: `AlarmSession[]` — 起床会话记录（最多 200 条）

## 代码生成指南

- 新增页面: 在 `frontend/src/pages/` 创建，在 `App.tsx` 注册路由
- 新增类型: 在 `frontend/src/types/alarm.ts` 扩展
- 新增 Hook: 在 `frontend/src/hooks/` 创建，遵循 use-alarms.ts 模式
- 组件: 共享子组件放 `frontend/src/components/custom/`
- 勿修改: `frontend/src/components/ui/` 下所有 shadcn/ui 组件
