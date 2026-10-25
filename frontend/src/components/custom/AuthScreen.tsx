import { useState } from 'react';
import { BellRing, LogIn, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import {
  AuthError,
  listUsers,
  login,
  register,
  PASSWORD_MIN,
  NICKNAME_MIN,
  NICKNAME_MAX,
} from '@/lib/auth';

type Mode = 'login' | 'register';

/**
 * The account gate.
 *
 * Accounts are local to this device — there is no server behind them — so the
 * copy says 本机账号 rather than implying a remote login. The password is still
 * hashed (see lib/auth), because a phone gets handed around and people reuse
 * passwords.
 */
export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>(() => (listUsers().length > 0 ? 'login' : 'register'));
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accounts = listUsers();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (mode === 'register') {
        const user = await register(nickname, password);
        toast.success(`欢迎，${user.nickname}`);
      } else {
        const user = await login(nickname, password);
        toast.success(`欢迎回来，${user.nickname}`);
      }
      // App re-renders itself once the auth store notifies.
    } catch (thrown) {
      const message =
        thrown instanceof AuthError ? thrown.message : '出错了，请再试一次';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center">
            <BellRing className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">强制清醒闹钟</h1>
          <p className="text-xs text-muted-foreground">本机账号 · 数据只保存在这台设备上</p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5">
          <div className="grid grid-cols-2 gap-2 mb-5">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              注册
            </button>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">昵称</span>
              <input
                value={nickname}
                onChange={event => setNickname(event.target.value)}
                autoComplete="username"
                placeholder={`${NICKNAME_MIN}~${NICKNAME_MAX} 个字符`}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">密码</span>
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                placeholder={`至少 ${PASSWORD_MIN} 位`}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              />
            </label>

            {error && (
              <p className="text-xs text-red-500 leading-relaxed" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full mt-1 flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-3 text-sm font-bold disabled:opacity-60 cursor-pointer"
            >
              {mode === 'register' ? (
                <UserPlus className="w-4 h-4" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {busy ? '处理中…' : mode === 'register' ? '创建账号' : '登录'}
            </button>
          </form>

          {accounts.length > 0 && (
            <div className="mt-5 pt-4 border-t border-border">
              <p className="text-[11px] text-muted-foreground mb-2">
                这台设备上已有 {accounts.length} 个账号
              </p>
              <div className="flex flex-wrap gap-1.5">
                {accounts.map(account => (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setNickname(account.nickname);
                      setError(null);
                    }}
                    className="text-[11px] px-2 py-1 rounded-lg bg-muted text-muted-foreground cursor-pointer"
                  >
                    {account.nickname}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground text-center mt-5 leading-relaxed">
          密码以 PBKDF2 加盐哈希保存在本机，不存明文。
          <br />
          它不联网，所以换手机不会同步，也无法找回密码。
        </p>
      </div>
    </div>
  );
}
