import { useEffect, useState } from 'react';
import { currentUser, subscribeAuth, type User } from '@/lib/auth';

/**
 * The signed-in account, refreshed whenever anyone logs in or out.
 *
 * Subscribing rather than reading once matters: logging out in another tab, or
 * registering, must tear the app down immediately rather than leaving a stale
 * profile's alarms on screen.
 */
export function useCurrentUser(): User | null {
  const [user, setUser] = useState<User | null>(() => currentUser());

  useEffect(() => {
    const refresh = () => setUser(currentUser());
    refresh();
    return subscribeAuth(refresh);
  }, []);

  return user;
}
