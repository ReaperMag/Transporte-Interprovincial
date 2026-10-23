import { useEffect, useState, type ReactNode } from 'react';

import {
  getCurrentAccount,
  logoutPassenger,
  type AuthenticatedAccount,
} from '../services/login.service';
import { AuthContext } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AuthenticatedAccount | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  async function refreshSession() {
    const currentAccount = await getCurrentAccount();
    setAccount(currentAccount);
    return currentAccount;
  }

  async function logout() {
    await logoutPassenger();
    setAccount(null);
  }

  useEffect(() => {
    let active = true;

    async function initializeSession() {
      try {
        const currentAccount = await getCurrentAccount();

        if (active) {
          setAccount(currentAccount);
        }
      } catch {
        if (active) {
          setAccount(null);
        }
      } finally {
        if (active) {
          setIsCheckingSession(false);
        }
      }
    }

    void initializeSession();

    return () => {
      active = false;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ account, isCheckingSession, refreshSession, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
