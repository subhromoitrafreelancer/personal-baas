import * as React from 'react';
import type { AuthUser } from '@personal-baas/client-sdk';
import { baas } from '@/lib/baas-client';
import type { Profile } from '@/types/ats';

type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  profile: Profile | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthStatus>('loading');
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);

  const bootstrap = React.useCallback(async (fullName = ''): Promise<Profile> => {
    return baas.rpc<Profile>('bootstrap_profile', { p_full_name: fullName });
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const restoredUser = await baas.auth.restoreSession();
      if (cancelled) return;
      if (!restoredUser) {
        setStatus('signed-out');
        return;
      }
      setUser(restoredUser);
      const restoredProfile = await bootstrap();
      if (cancelled) return;
      setProfile(restoredProfile);
      setStatus('signed-in');
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrap]);

  const signIn = React.useCallback(
    async (email: string, password: string) => {
      const signedInUser = await baas.auth.signIn(email, password);
      const signedInProfile = await bootstrap();
      setUser(signedInUser);
      setProfile(signedInProfile);
      setStatus('signed-in');
    },
    [bootstrap],
  );

  const signUp = React.useCallback(
    async (email: string, password: string, fullName: string) => {
      await baas.auth.signUp(email, password);
      const signedInUser = await baas.auth.signIn(email, password);
      const newProfile = await bootstrap(fullName);
      setUser(signedInUser);
      setProfile(newProfile);
      setStatus('signed-in');
    },
    [bootstrap],
  );

  const signOut = React.useCallback(async () => {
    await baas.auth.signOut();
    setUser(null);
    setProfile(null);
    setStatus('signed-out');
  }, []);

  const refreshProfile = React.useCallback(async () => {
    const rows = await baas
      .from<Profile>('profiles')
      .select()
      .eq('user_id', user?.id ?? '')
      .maybeSingle();
    if (rows) setProfile(rows as Profile);
  }, [user]);

  const value = React.useMemo<AuthContextValue>(
    () => ({ status, user, profile, signIn, signUp, signOut, refreshProfile }),
    [status, user, profile, signIn, signUp, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
