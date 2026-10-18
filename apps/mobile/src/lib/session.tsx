import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, api, auth, loadToken, setUnauthorizedHandler } from './api';

export interface Me {
  user: { id: string; email: string; role: 'member' | 'owner' };
  profile: {
    firstName: string;
    lastName: string;
    displayName: string | null;
    bio: string | null;
    portfolioUrl: string | null;
    socialHandle: string | null;
  };
  onboarded: boolean;
  deletionScheduledFor: string | null;
  hasPassword?: boolean;
}

type State =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; me: Me }
  | { status: 'offline' };

interface Session {
  state: State;
  refresh(): Promise<void>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  const refresh = useCallback(async () => {
    if (!(await loadToken())) return setState({ status: 'signed-out' });
    try {
      setState({ status: 'signed-in', me: await api<Me>('/v1/me') });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await auth.signOut();
        setState({ status: 'signed-out' });
      } else {
        setState({ status: 'offline' });
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    await auth.signOut();
    setState({ status: 'signed-out' });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void signOut());
    void refresh();
  }, [refresh, signOut]);

  const value = useMemo(() => ({ state, refresh, signOut }), [state, refresh, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}
