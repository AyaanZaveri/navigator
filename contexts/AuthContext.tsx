'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { StremioUserWithToken } from '@/types/stremio';

interface AuthContextType {
  user: StremioUserWithToken | null;
  timestamp: number | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user: StremioUserWithToken) => void;
  logout: () => void;
  refreshAuthData: () => void;
  isTokenExpired: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const auth = useAuth();
  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}

export { useAuth };
