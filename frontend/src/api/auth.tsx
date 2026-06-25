import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from './client';

interface User {
  id: string;
  username: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('synkord_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('synkord_token')
  );

  const login = useCallback(async (username: string, password: string) => {
    const resp = await apiClient.post('/auth/login', { username, password });
    const { access_token, ...userData } = resp.data;
    localStorage.setItem('synkord_token', access_token);
    localStorage.setItem('synkord_user', JSON.stringify(userData));
    setToken(access_token);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('synkord_token');
    localStorage.removeItem('synkord_user');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
