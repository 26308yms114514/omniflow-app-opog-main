import { useNavigate } from 'react-router-dom';
import {
  BellRing, Zap, Shield, BarChart2, Clock, ChevronRight,
  Star, CheckCircle2, ArrowRight, Smartphone, Vibrate, AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import OmniflowBadge from '@/components/custom/OmniflowBadge';

const FEATURES = [
  {
    icon: BellRing,
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
    title: '全屏锁定界面',
    desc: '闹钟触发后进入全屏锁定，返回键、Home 键全部屏蔽，无法在半睡状态绕过任务。',
  },
  {
    icon: Zap,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    title: '动作任务引擎',
    desc: '持续摇晃、原地踏步两种任务，动作中断超时即清零进度并增强震动，强制保持持续动作。',
  },
  {
    icon: Vibrate,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    title: '中断惩罚机制',
    desc: '每次动作中断超过容忍时限，进度立即归零，震动强度自动增强 20%，上限为设备最强震动。',
  },
  {
    icon: Shield,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
    title: '防作弊系统',
    desc: '识别机械周期性摇动、躺卧假踏步、相册扫码等作弊行为，拦截率达 95% 以上。',
  },
  {
    icon: BarChart2,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    title: '数据统计与成长反馈',
    desc: '记录每次起床表现，展示成功率、平均用时、中断次数趋势，量化早起习惯改善。',
  },
  {
    icon: Clock,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    title: '灵活闹钟配置',
    desc: '支持多个闹钟、周期重复、难度档位、贪睡模式等自定义配置，适应不同场景需求。',
  },
];

const TASK_DEMOS = [
  { icon: '📳', name: '持续摇晃', tag: 'V1.0', available: true, desc: '持续有效晃动 30 秒' },
  { icon: '🚶', name: '原地踏步', tag: 'V1.0', available: true, desc: '持续踏步 60 秒' },
  { icon: '🏋️', name: '深蹲计数', tag: 'V2.0', available: false, desc: '完成 10 次深蹲' },
  { icon: '📷', name: '扫码解锁', tag: 'V1.1', available: false, desc: '扫描预设二维码' },
  { icon: '🔄', name: '房间绕圈', tag: 'V2.0', available: false, desc: '完成 3 圈行走' },
  { icon: '📡', name: 'NFC刷卡', tag: 'V2.0', available: false, desc: '刷预绑定 NFC 标签' },
];

const STATS = [
  { value: '75%+', label: '起床成功率', sub: '较传统闹钟提升 40%' },
  { value: '95%+', label: '防作弊拦截率', sub: '多维度行为检测' },
  { value: '≤0.5s', label: '动作检测延迟', sub: '实时传感器响应' },
];

const FLOW_STEPS = [
  { step: '01', icon: BellRing, color: 'text-violet-500', bg: 'bg-violet-500/10', title: '闹钟触发', desc: '进入全屏锁定界面，系统按键全部屏蔽，无法绕过' },
  { step: '02', icon: Zap, color: 'text-orange-500', bg: 'bg-orange-500/10', title: '执行动作任务', desc: '持续摇晃或踏步，中断即清零并自动增强震动' },
  { step: '03', icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10', title: '防作弊检测', desc: '实时识别机械晃动、躺卧假步等作弊行为并拦截' },
  { step: '04', icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10', title: '任务达标关闭', desc: '闹钟关闭，展示本次起床表现与历史均值对比' },
];

export default function AppPreview() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Sticky Header */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <BellRing className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <span className="font-bold text-foreground text-sm">强制清醒闹钟</span>
              <span className="ml-2 text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5 font-semibold">V1.0</span>
            </div>
          </div>
          <Button size="sm" onClick={() => navigate('/')} className="cursor-pointer gap-1.5">
            进入应用 <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full">

        {/* ── Hero Section ── */}
        <section className="relative overflow-hidden px-4 pt-12 pb-10">
          {/* Background decoration */}
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-primary/5 blur-3xl" />
          </div>

          <div className="flex flex-col items-center text-center gap-5">
            <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary rounded-full px-3 py-1.5 text-xs font-semibold">
              <Star className="w-3 h-3 fill-current" /> 赖床终结者 · 强制起床解决方案
            </div>

            <h1 className="text-4xl sm:text-5xl font-extrabold text-foreground leading-tight tracking-tight">
              彻底告别<br />
              <span className="text-primary">赖床惯性</span>
            </h1>

            <p className="text-muted-foreground text-base leading-relaxed max-w-md">
              通过持续性身体动作任务与中断重置惩罚机制，
              从根源破除赖床惯性。动作不停，闹钟不止。
            </p>

            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <Button size="lg" onClick={() => navigate('/')} className="cursor-pointer gap-2 w-full sm:w-auto">
                <BellRing className="w-4 h-4" /> 立即体验
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate('/alarms')} className="cursor-pointer gap-2 w-full sm:w-auto">
                管理闹钟 <ArrowRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Hero image */}
            <div className="relative w-full max-w-sm mt-2">
              <div className="rounded-3xl overflow-hidden shadow-2xl">
                <img
                  src="https://images.unsplash.com/photo-1541480601022-2308c0f02487?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w4MjAxMDd8MHwxfHNlYXJjaHwxfHxhbGFybSUyMGNsb2NrJTIwbW9ybmluZyUyMHdha2UlMjB1cHxlbnwwfDB8fHwxNzkwNjQ2NzA5fDA&ixlib=rb-4.1.0&q=80&w=400"
                  alt="alarm clock"
                  className="w-full h-48 object-cover"
                />
              </div>
              {/* Floating badge */}
              <div className="absolute -bottom-3 -right-3 bg-green-500 text-white text-xs font-bold rounded-2xl px-3 py-2 shadow-lg">
                ✓ 起床成功
              </div>
              <div className="absolute -top-3 -left-3 bg-red-500 text-white text-xs font-bold rounded-2xl px-3 py-2 shadow-lg">
                🔔 无法跳过
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats Banner ── */}
        <section className="px-4 py-6">
          <div className="grid grid-cols-3 gap-3">
            {STATS.map(stat => (
              <div key={stat.label} className="bg-card rounded-2xl border border-border p-4 text-center">
                <p className="text-xl sm:text-2xl font-extrabold text-primary leading-tight">{stat.value}</p>
                <p className="text-xs font-semibold text-foreground mt-1 leading-tight">{stat.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight hidden sm:block">{stat.sub}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── How It Works ── */}
        <section className="px-4 py-6 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">工作流程</h2>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FLOW_STEPS.map((item) => (
              <div key={item.step} className="bg-card rounded-2xl border border-border p-4 flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center shrink-0`}>
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground">{item.step}</span>
                    <p className="font-semibold text-foreground text-sm">{item.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Core Features ── */}
        <section className="px-4 py-6 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">核心功能</h2>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FEATURES.map(f => (
              <div key={f.title} className="bg-card rounded-2xl border border-border p-4 flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl ${f.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                  <f.icon className={`w-5 h-5 ${f.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-sm">{f.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Six Unlock Tasks ── */}
        <section className="px-4 py-6 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">六大解锁任务</h2>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {TASK_DEMOS.map(t => (
              <div
                key={t.name}
                className={`bg-card rounded-2xl border p-4 flex flex-col items-center text-center gap-2 ${
                  t.available ? 'border-primary/30' : 'border-border opacity-60'
                }`}
              >
                <span className="text-3xl">{t.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{t.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{t.desc}</p>
                </div>
                <Badge
                  variant={t.available ? 'default' : 'secondary'}
                  className={`text-[10px] px-2 py-0.5 ${
                    t.available ? 'bg-green-500/10 text-green-600 hover:bg-green-500/10 border-0' : ''
                  }`}
                >
                  {t.available ? '✓ 已上线' : t.tag}
                </Badge>
              </div>
            ))}
          </div>
        </section>

        {/* ── Anti-Cheat Highlight ── */}
        <section className="px-4 py-6">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 text-white space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-400" />
              <h2 className="text-base font-bold">防作弊系统</h2>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">
              多维度行为检测算法，识别并拦截各类作弊行为，确保每次起床任务真实有效。
            </p>
            <div className="grid grid-cols-1 gap-2">
              {[
                { cheat: '绑风扇机械晃动', method: '加速度计频率方差分析', color: 'text-red-400' },
                { cheat: '躺卧假装踏步', method: 'Z 轴重力分量姿态检测', color: 'text-orange-400' },
                { cheat: '相册图片扫码', method: '架构层禁止相册调用', color: 'text-yellow-400' },
              ].map(item => (
                <div key={item.cheat} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${item.color}`}>✗</span>
                    <span className="text-xs text-slate-200">{item.cheat}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 text-right max-w-[120px] leading-tight">{item.method}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Version Roadmap ── */}
        <section className="px-4 py-6 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">版本路线图</h2>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="space-y-3">
            {[
              {
                version: 'V1.0', title: '基础上线版', status: 'current',
                items: ['闹钟管理', '摇晃解锁', '踏步解锁', '中断重置惩罚', '全屏防退出', '基础统计'],
              },
              {
                version: 'V1.1', title: '功能增强版', status: 'upcoming',
                items: ['扫码任务', '随机任务池', '星期分组配置', '强化防作弊算法'],
              },
              {
                version: 'V2.0', title: '进阶硬核版', status: 'planned',
                items: ['深蹲计数', '房间绕圈行走', 'NFC 刷卡解锁', '云端同步配置'],
              },
            ].map(v => (
              <div
                key={v.version}
                className={`rounded-2xl border p-4 ${
                  v.status === 'current' ? 'bg-primary/5 border-primary/30' : 'bg-card border-border'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    v.status === 'current'
                      ? 'bg-primary text-primary-foreground'
                      : v.status === 'upcoming'
                      ? 'bg-orange-500/10 text-orange-600'
                      : 'bg-muted text-muted-foreground'
                  }`}>{v.version}</span>
                  <span className="font-semibold text-foreground text-sm">{v.title}</span>
                  {v.status === 'current' && <CheckCircle2 className="w-4 h-4 text-green-500 ml-auto" />}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {v.items.map(item => (
                    <span
                      key={item}
                      className={`text-[11px] rounded-full px-2 py-0.5 ${
                        v.status === 'current'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Social Proof ── */}
        <section className="px-4 py-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: '🎯', title: '目标用户', desc: '18-35 岁学生、上班族、自由职业者，有自律需求的早起困难人群' },
              { icon: '📱', title: '全平台支持', desc: 'Android 9.0+ 及 iOS 15.0+ 双平台，传感器权限全面覆盖' },
              { icon: '🔒', title: '隐私安全', desc: '传感器数据仅本地处理，不上传服务器，符合 GDPR 及个人信息保护法' },
            ].map(item => (
              <div key={item.title} className="bg-card rounded-2xl border border-border p-4 text-center">
                <span className="text-2xl">{item.icon}</span>
                <p className="font-semibold text-foreground text-sm mt-2">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA Footer ── */}
        <section className="px-4 py-8">
          <div className="relative bg-primary rounded-3xl p-8 text-center space-y-4 overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-white/5 -translate-y-16 translate-x-16" />
            <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-white/5 translate-y-12 -translate-x-12" />
            <div className="relative z-10 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center mx-auto">
                <Smartphone className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-primary-foreground text-2xl font-extrabold leading-tight">
                开始你的早起之旅
              </h2>
              <p className="text-primary-foreground/70 text-sm leading-relaxed max-w-xs mx-auto">
                彻底告别赖床，从今天开始。动作不停，闹钟不止。
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={() => navigate('/')}
                  className="cursor-pointer gap-2 font-semibold"
                >
                  <BellRing className="w-4 h-4" /> 立即体验
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => navigate('/edit/new')}
                  className="cursor-pointer gap-2 bg-transparent border-white/30 text-white hover:bg-white/10 font-semibold"
                >
                  <Clock className="w-4 h-4" /> 新增闹钟
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Attribution */}
        <div className="px-4 pb-6 text-center">
          <p className="text-[10px] text-muted-foreground">
            Hero photo by{' '}
            <a href="https://unsplash.com/@insungpandora" target="_blank" rel="noopener noreferrer" className="underline">insung yoon</a>
            {' '}on Unsplash
          </p>
        </div>

      </main>

      <OmniflowBadge />
    </div>
  );
}
