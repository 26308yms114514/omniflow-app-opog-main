import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, XCircle } from 'lucide-react';
import {
  evaluateEnvironment,
  readProbes,
  summarizeEnvironment,
  type Capability,
} from '@/lib/environment';

/**
 * Collapsed-by-default capability checklist.
 *
 * Collapsed it is one line, so it stays out of the way during normal use; on a
 * phone it is the quickest way to answer "why did nothing happen?" — which for
 * this app is almost always a missing secure context, a withheld sensor or a
 * permission that was never granted.
 */
export default function EnvironmentCheck() {
  const [caps, setCaps] = useState<Capability[]>(() => evaluateEnvironment(readProbes()));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const refresh = () => setCaps(evaluateEnvironment(readProbes()));
    refresh();
    // Permissions can be granted while the page is backgrounded.
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, []);

  const summary = summarizeEnvironment(caps);
  const criticalCount = summary.failing.filter(c => c.level === 'critical').length;
  const ok = summary.ok && summary.failing.length === 0;

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 p-4 text-left cursor-pointer"
      >
        {ok ? (
          <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
        ) : criticalCount > 0 ? (
          <XCircle className="w-5 h-5 text-red-500 shrink-0" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">环境自检</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ok
              ? '全部正常，闹钟可以正常触发'
              : criticalCount > 0
              ? `${criticalCount} 项关键能力不可用，闹钟可能无法触发`
              : `${summary.failing.length} 项建议能力未开启`}
          </p>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <ul className="px-4 pb-4 space-y-2">
          {caps.map(cap => (
            <li key={cap.id} className="flex items-start gap-2.5">
              <span
                className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                  cap.ok ? 'bg-green-500' : cap.level === 'critical' ? 'bg-red-500' : 'bg-amber-500'
                }`}
              />
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">
                  {cap.label}
                  <span className="text-muted-foreground font-normal"> · {cap.detail}</span>
                </p>
                {!cap.ok && cap.hint && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    {cap.hint}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
