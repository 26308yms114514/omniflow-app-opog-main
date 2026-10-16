import { Alarm, TASK_ICONS, TASK_LABELS, describeRepeat, formatClock } from '@/types/alarm';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2 } from 'lucide-react';

interface Props {
  alarm: Alarm;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRing: () => void;
}

export default function AlarmCard({ alarm, onToggle, onEdit, onDelete, onRing }: Props) {
  const repeatText = describeRepeat(alarm.repeat);
  const timeStr = formatClock(alarm.hour, alarm.minute);

  return (
    <div
      className={`relative rounded-2xl border p-4 transition-all ${
        alarm.enabled
          ? 'bg-card border-border shadow-sm'
          : 'bg-muted/40 border-border/40 opacity-60'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className={`text-4xl font-bold tabular-nums tracking-tight ${
              alarm.enabled ? 'text-foreground' : 'text-muted-foreground'
            }`}>
              {timeStr}
            </span>
          </div>
          {alarm.label && (
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{alarm.label}</p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
              {TASK_ICONS[alarm.config.taskType]} {TASK_LABELS[alarm.config.taskType]}
            </span>
            <span className="text-xs text-muted-foreground">{repeatText}</span>
          </div>
        </div>
        <Switch checked={alarm.enabled} onCheckedChange={onToggle} />
      </div>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 text-xs h-10"
          onClick={onEdit}
        >
          <Pencil className="w-3 h-3 mr-1" /> 编辑
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 text-xs h-10 text-primary hover:text-primary"
          onClick={onRing}
        >
          ▶ 测试
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 text-xs h-10 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="w-3 h-3 mr-1" /> 删除
        </Button>
      </div>
    </div>
  );
}
