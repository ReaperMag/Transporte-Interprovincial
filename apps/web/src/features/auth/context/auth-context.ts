import { createContext } from 'react';
import type { AuthenticatedAccount } from '../services/login.service';

export interface AuthContextValue {
  account: AuthenticatedAccount | null;
  isCheckingSession: boolean;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
