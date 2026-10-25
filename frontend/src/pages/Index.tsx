import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, BarChart2, Plus, Zap, Shield, Clock, Vibrate, UserRound, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import OmniflowBadge from '@/components/custom/OmniflowBadge';
import EnvironmentCheck from '@/components/custom/EnvironmentCheck';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { useAlarms } from '@/hooks/use-alarms';
import { useNextAlarm } from '@/hooks/use-next-alarm';
import { useCurrentUser } from '@/hooks/use-current-user';
import { describeCountdown } from '@/lib/next-alarm';
import { formatClock } from '@/types/alarm';
import { getAlarmOutput } from '@/lib/alarm-output';
import { notificationPermission, requestNotificationPermission } from '@/lib/notify';
import { logout } from '@/lib/auth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function Index() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const { alarms, sessions } = useAlarms();
  const next = useNextAlarm(alarms);
  const [testing, setTesting] = useState(false);
  const testTimerRef = useRef<number | null>(null);
  const [notifyPermission, setNotifyPermission] = useState(notificationPermission);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const total = sessions.length;
  const successful = sessions.filter(s => s.success).length;
  const successRate = total > 0 ? Math.round((successful / total) * 100) : 0;
  const enabledCount = alarms.filter(a => a.enabled).length;

  useEffect(() => {
    return () => {
      if (testTimerRef.current) window.clearTimeout(testTimerRef.current);
      // Never leave a test alarm running after the page goes away.
      getAlarmOutput().stop();
    };
  }, []);

  // Permission can be granted while the page sits in the background.
  useEffect(() => {
    const refresh = () => setNotifyPermission(notificationPermission());
    refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, []);

  const askForNotifications = async () => {
    const result = await requestNotificationPermission();
    setNotifyPermission(result);
    if (result !== 'granted') toast.error('没有通知权限，锁屏后闹钟可能叫不醒你');
  };

  /**
   * Sounds and buzzes for a few seconds so the user can tell whether the alarm
   * channel works on their device at all.
   *
   * This doubles as the audio unlock: the tap here is the gesture that lets an
   * alarm hours later play, and the report says which channels actually fired
   * rather than assuming both did — the silent failure this exists to catch.
   */
  const handleTestRing = async () => {
    const output = getAlarmOutput();
    await output.unlock();
    output.setIntensity(1);
    const channels = output.start();

    if (!channels.tone && !channels.vibration) {
      toast.error('这个浏览器既不支持播放声音，也不支持震动');
      return;
    }
    const missing = !channels.vibration ? '（设备不支持震动）' : '';

    setTesting(true);
    if (testTimerRef.current) window.clearTimeout(testTimerRef.current);
    testTimerRef.current = window.setTimeout(() => {
      output.stop();
      setTesting(false);
    }, 3000);

    if (channels.tone) return;
    toast.warning(`没听到声音吗？请把媒体音量调大 ${missing}`);
  };


  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <BellRing className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground leading-tight">强制清醒</h1>
              <p className="text-[10px] text-muted-foreground leading-tight">赖床终结者</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground px-1">
              <UserRound className="w-3.5 h-3.5" />
              {user?.nickname ?? '账号'}
            </span>
            <button
              onClick={() => setConfirmLogout(true)}
              className="p-2 rounded-lg text-muted-foreground cursor-pointer"
              title="退出账号"
              aria-label="退出账号"
            >
              <LogOut className="w-4 h-4" />
            </button>
            <Button variant="ghost" size="icon" onClick={() => navigate('/stats')} className="cursor-pointer">
              <BarChart2 className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-6">
        {/* Hero Banner */}
        <div className="relative rounded-3xl bg-primary overflow-hidden p-6">
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/5 -translate-y-8 translate-x-8" />
          <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-white/5 translate-y-6 -translate-x-6" />
          <div className="relative z-10">
            <p className="text-primary-foreground/70 text-xs font-medium uppercase tracking-wider mb-1">今日状态</p>
            <h2 className="text-primary-foreground text-2xl font-bold leading-tight">
              {enabledCount > 0 ? `${enabledCount} 个闹钟已激活` : '还没有闹钟'}
            </h2>
            <p className="text-primary-foreground/70 text-sm mt-1">
              {total > 0 ? `历史起床成功率 ${successRate}%` : '添加第一个强制清醒闹钟'}
            </p>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => navigate('/alarms')}
                className="flex-1 bg-white text-primary font-semibold text-sm py-2.5 rounded-xl cursor-pointer hover:bg-white/90 transition-colors"
              >
                管理闹钟
              </button>
              <button
                onClick={() => navigate('/edit/new')}
                className="flex items-center gap-1 bg-white/20 text-primary-foreground font-semibold text-sm py-2.5 px-4 rounded-xl cursor-pointer hover:bg-white/30 transition-colors"
              >
                <Plus className="w-4 h-4" /> 新增
              </button>
            </div>
          </div>
        </div>

        {/* Next alarm — makes the armed state visible and testable */}
        {next && (
          <div className="bg-card rounded-2xl border border-border p-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  testing ? 'bg-primary' : 'bg-primary/10'
                }`}
              >
                <Clock className={`w-5 h-5 ${testing ? 'text-primary-foreground' : 'text-primary'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">下次提醒</p>
                <p className="font-semibold text-foreground truncate">
                  {formatClock(next.alarm.hour, next.alarm.minute)}
                  {next.alarm.label ? ` · ${next.alarm.label}` : ''}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {describeCountdown(next.at.getTime() - Date.now())}
                </p>
              </div>
              <button
                onClick={handleTestRing}
                className="shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-border hover:border-primary/50 transition-colors cursor-pointer"
              >
                <Vibrate className="w-3.5 h-3.5" />
                {testing ? '响铃中' : '试响铃'}
              </button>
            </div>
            {notifyPermission === 'granted' ? (
              <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
                屏幕亮着时用响铃和震动提醒；手机锁屏后震动不会生效（浏览器限制），
                改由系统通知提醒，请保持页面在后台运行。
              </p>
            ) : notifyPermission === 'unsupported' ? (
              // Nothing to offer here: the browser has no Notification API, so
              // a button would be a dead end. Say what still works instead.
              <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
                这个浏览器不支持系统通知。页面开着时响铃和震动照常工作，
                但<strong className="text-amber-700">手机锁屏后不会有任何提醒</strong>——
                录制或测试时请让屏幕保持亮着。
              </p>
            ) : (
              <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  <strong>还没有通知权限。</strong>
                  手机锁屏后浏览器不会震动，这时通知是唯一能提醒你的通道——
                  现在这个闹钟有可能叫不醒你。
                </p>
                <button
                  onClick={() => void askForNotifications()}
                  className="mt-2 w-full rounded-lg bg-amber-500 text-white text-xs font-semibold py-2 cursor-pointer"
                >
                  开启通知提醒
                </button>
              </div>
            )}
          </div>
        )}

        {/* Capability checklist — the fastest way to diagnose a phone that
            silently refuses to buzz or read the accelerometer. */}
        <EnvironmentCheck />

        {/* Quick Stats */}
        {total > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card rounded-2xl border border-border p-4 text-center">
              <p className="text-2xl font-bold text-green-500">{successRate}%</p>
              <p className="text-xs text-muted-foreground mt-1">成功率</p>
            </div>
            <div className="bg-card rounded-2xl border border-border p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{total}</p>
              <p className="text-xs text-muted-foreground mt-1">总次数</p>
            </div>
            <div className="bg-card rounded-2xl border border-border p-4 text-center">
              <p className="text-2xl font-bold text-primary">{enabledCount}</p>
              <p className="text-xs text-muted-foreground mt-1">激活中</p>
            </div>
          </div>
        )}

        {/* Feature Cards */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">核心功能</h3>
          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={() => navigate('/alarms')}
              className="bg-card rounded-2xl border border-border p-4 flex items-center gap-4 text-left cursor-pointer hover:border-primary/50 transition-colors w-full"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <BellRing className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm">闹钟管理</p>
                <p className="text-xs text-muted-foreground mt-0.5">新增、编辑、删除闹钟，设置重复周期</p>
              </div>
              <span className="text-muted-foreground text-lg">›</span>
            </button>

            <button
              onClick={() => navigate('/stats')}
              className="bg-card rounded-2xl border border-border p-4 flex items-center gap-4 text-left cursor-pointer hover:border-primary/50 transition-colors w-full"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                <BarChart2 className="w-5 h-5 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm">起床统计</p>
                <p className="text-xs text-muted-foreground mt-0.5">查看成功率、用时、中断次数趋势</p>
              </div>
              <span className="text-muted-foreground text-lg">›</span>
            </button>
          </div>
        </div>

        {/* How it works */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">工作原理</h3>
          <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <BellRing className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">闹钟触发</p>
                <p className="text-xs text-muted-foreground mt-0.5">进入全屏锁定界面，系统按键全部屏蔽</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <Zap className="w-4 h-4 text-orange-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">执行动作任务</p>
                <p className="text-xs text-muted-foreground mt-0.5">持续摇晃、踏步等，中断即清零并增强震动</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <Shield className="w-4 h-4 text-green-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">防作弊保障</p>
                <p className="text-xs text-muted-foreground mt-0.5">分析摇晃节奏的规律性，拦截绑在风扇等装置上的机械晃动</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <Clock className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">数据追踪</p>
                <p className="text-xs text-muted-foreground mt-0.5">记录每次起床表现，量化早起习惯改善</p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        {alarms.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Button
              size="lg"
              onClick={() => navigate('/edit/new')}
              className="w-full gap-2 cursor-pointer"
            >
              <Plus className="w-5 h-5" /> 添加第一个闹钟
            </Button>
            <p className="text-xs text-muted-foreground text-center">彻底告别赖床，从今天开始</p>
          </div>
        )}
      </main>

      <OmniflowBadge />
      <Toaster />

      <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>退出「{user?.nickname}」？</AlertDialogTitle>
            <AlertDialogDescription>
              闹钟和统计不会删除，重新登录就能看到。但退出后没有账号守护，
              这台设备上任何人都能打开应用。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmLogout(false);
                logout();
                toast.success('已退出');
              }}
            >
              退出
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
