import { useNavigate } from 'react-router-dom';
import { BellRing, Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center gap-8">
      {/* Decorative background */}
      <div className="absolute inset-0 -z-10 flex items-center justify-center">
        <div className="w-[400px] h-[400px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      {/* Icon */}
      <div className="relative">
        <div className="w-24 h-24 rounded-3xl bg-primary/10 flex items-center justify-center">
          <BellRing className="w-12 h-12 text-primary" />
        </div>
        <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
          <span className="text-destructive text-sm font-bold">!</span>
        </div>
      </div>

      {/* Text */}
      <div className="space-y-2">
        <h1 className="text-6xl font-extrabold text-foreground tracking-tight">404</h1>
        <p className="text-xl font-semibold text-foreground">页面不存在</p>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-xs">
          您访问的页面已被移除或从未存在。
          请返回首页继续使用强制清醒闹钟。
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
        <Button
          onClick={() => navigate(-1 as never)}
          variant="outline"
          className="gap-2 cursor-pointer flex-1"
        >
          <ArrowLeft className="w-4 h-4" /> 返回上页
        </Button>
        <Button
          onClick={() => navigate('/')}
          className="gap-2 cursor-pointer flex-1"
        >
          <Home className="w-4 h-4" /> 返回首页
        </Button>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2 justify-center">
        {[
          { label: '闹钟列表', path: '/alarms' },
          { label: '新增闹钟', path: '/edit/new' },
          { label: '起床统计', path: '/stats' },
          { label: '任务体验预览', path: '/42ed530e-ac29-4218-87cd-e291989cf9c6' },
          { label: '产品介绍', path: '/f6db0085-1264-4a77-b32e-fa2731e8654f' },
        ].map(link => (
          <button
            key={link.path}
            onClick={() => navigate(link.path)}
            className="text-xs text-primary underline underline-offset-2 cursor-pointer hover:opacity-70 transition-opacity"
          >
            {link.label}
          </button>
        ))}
      </div>
    </div>
  );
}
