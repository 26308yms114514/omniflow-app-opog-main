import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, BellRing, BarChart2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import AlarmCard from '@/components/custom/AlarmCard';
import { useAlarms } from '@/hooks/use-alarms';
import { formatClock } from '@/types/alarm';
import type { Alarm } from '@/types/alarm';
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

export default function AlarmList() {
  const navigate = useNavigate();
  const { alarms, toggleAlarm, deleteAlarm } = useAlarms();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** The alarm awaiting confirmation; null when the dialog is closed. */
  const [pendingDelete, setPendingDelete] = useState<Alarm | null>(null);

  /**
   * Deleting used to happen on the first tap. On a phone that button sits
   * directly beside 测试, and a mistap destroyed the alarm silently with no way
   * back — so it is confirmed first.
   */
  const confirmDelete = () => {
    const target = pendingDelete;
    if (!target) return;
    setPendingDelete(null);
    setDeletingId(target.id);
    // Brief fade, so the card does not vanish out from under the finger.
    setTimeout(() => {
      deleteAlarm(target.id);
      setDeletingId(null);
      toast.success('闹钟已删除');
    }, 200);
  };

  const sortedAlarms = [...alarms].sort((a, b) => {
    const aMin = a.hour * 60 + a.minute;
    const bMin = b.hour * 60 + b.minute;
    return aMin - bMin;
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">强制清醒</h1>
            <p className="text-xs text-muted-foreground">赖床终结者</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/stats')}
              title="统计"
            >
              <BarChart2 className="w-5 h-5" />
            </Button>
            <Button
              size="sm"
              onClick={() => navigate('/edit/new')}
              className="gap-1"
            >
              <Plus className="w-4 h-4" /> 新增
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-4 max-w-lg mx-auto w-full">
        {sortedAlarms.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <BellRing className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">还没有闹钟</h2>
              <p className="text-sm text-muted-foreground mt-1">添加第一个强制清醒闹钟，<br />彻底告别赖床</p>
            </div>
            <Button onClick={() => navigate('/edit/new')} className="gap-2">
              <Plus className="w-4 h-4" /> 添加闹钟
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedAlarms.map(alarm => (
              <div
                key={alarm.id}
                className={`transition-all duration-200 ${
                  deletingId === alarm.id ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
                }`}
              >
                <AlarmCard
                  alarm={alarm}
                  onToggle={() => toggleAlarm(alarm.id)}
                  onEdit={() => navigate(`/edit/${alarm.id}`)}
                  onDelete={() => setPendingDelete(alarm)}
                  onRing={() => navigate(`/task/${alarm.id}`)}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={open => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这个闹钟？</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${formatClock(pendingDelete.hour, pendingDelete.minute)}${
                    pendingDelete.label ? ` · ${pendingDelete.label}` : ''
                  } 将被永久删除，无法撤销。`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
