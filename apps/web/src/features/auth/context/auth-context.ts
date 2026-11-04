import { createContext } from 'react';
import type { AuthenticatedAccount } from '../services/login.service';

export interface AuthContextValue {
  account: AuthenticatedAccount | null;
  isCheckingSession: boolean;
  refreshSession: () => Promise<AuthenticatedAccount | null>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
