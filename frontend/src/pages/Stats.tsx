import { useNavigate } from 'react-router-dom';
import { ChevronLeft, TrendingUp, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAlarms } from '@/hooks/use-alarms';
import { TASK_LABELS } from '@/types/alarm';

export default function Stats() {
  const navigate = useNavigate();
  const { sessions } = useAlarms();

  const total = sessions.length;
  const successful = sessions.filter(s => s.success).length;
  const successRate = total > 0 ? Math.round((successful / total) * 100) : 0;
  const avgDuration = total > 0
    ? Math.round(sessions.filter(s => s.completedAt).reduce((acc, s) => acc + ((s.completedAt! - s.startedAt) / 1000), 0) / successful || 0)
    : 0;
  const avgInterrupts = total > 0
    ? (sessions.reduce((acc, s) => acc + s.interruptCount, 0) / total).toFixed(1)
    : '0';

  const recent = sessions.slice(0, 10);

  const taskCounts: Record<string, number> = {};
  sessions.forEach(s => {
    taskCounts[s.taskType] = (taskCounts[s.taskType] ?? 0) + 1;
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-base font-semibold">起床统计</h1>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-5">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <TrendingUp className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">暂无数据</h2>
              <p className="text-sm text-muted-foreground mt-1">完成第一次闹钟任务后，<br />这里将展示你的起床数据</p>
            </div>
            <Button onClick={() => navigate('/')}>去设置闹钟</Button>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card rounded-2xl border border-border p-4">
                <div className="flex items-center gap-2 text-green-500 mb-2">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-xs font-medium">起床成功率</span>
                </div>
                <p className="text-3xl font-bold text-foreground">{successRate}%</p>
                <p className="text-xs text-muted-foreground mt-1">{successful}/{total} 次</p>
              </div>
              <div className="bg-card rounded-2xl border border-border p-4">
                <div className="flex items-center gap-2 text-blue-500 mb-2">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs font-medium">平均用时</span>
                </div>
                <p className="text-3xl font-bold text-foreground">{avgDuration}s</p>
                <p className="text-xs text-muted-foreground mt-1">每次起床</p>
              </div>
              <div className="bg-card rounded-2xl border border-border p-4">
                <div className="flex items-center gap-2 text-orange-500 mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-xs font-medium">平均中断</span>
                </div>
                <p className="text-3xl font-bold text-foreground">{avgInterrupts}</p>
                <p className="text-xs text-muted-foreground mt-1">次/每次</p>
              </div>
              <div className="bg-card rounded-2xl border border-border p-4">
                <div className="flex items-center gap-2 text-primary mb-2">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-xs font-medium">总记录次数</span>
                </div>
                <p className="text-3xl font-bold text-foreground">{total}</p>
                <p className="text-xs text-muted-foreground mt-1">历史全部</p>
              </div>
            </div>

            {/* Task Distribution */}
            {Object.keys(taskCounts).length > 0 && (
              <div className="bg-card rounded-2xl border border-border p-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">任务类型分布</h3>
                <div className="space-y-2">
                  {Object.entries(taskCounts).map(([type, count]) => (
                    <div key={type} className="flex items-center gap-3">
                      <span className="text-sm w-20 text-foreground">{TASK_LABELS[type as keyof typeof TASK_LABELS] ?? type}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${(count / total) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-6 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Sessions */}
            <div className="bg-card rounded-2xl border border-border p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">最近记录</h3>
              <div className="space-y-2">
                {recent.map((s, i) => {
                  const date = new Date(s.startedAt);
                  const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
                  const dur = s.completedAt ? Math.round((s.completedAt - s.startedAt) / 1000) : null;
                  return (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${s.success ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-sm text-foreground">{dateStr}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{TASK_LABELS[s.taskType]}</span>
                        {dur && <span>{dur}s</span>}
                        {s.interruptCount > 0 && <span className="text-orange-500">中断{s.interruptCount}次</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
