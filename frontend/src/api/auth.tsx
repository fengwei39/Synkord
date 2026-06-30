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
  bootstrapping: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  bootstrapping: false,
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
  const [bootstrapping, setBootstrapping] = useState<boolean>(!!localStorage.getItem('synkord_token'));

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
    localStorage.removeItem('synkord_current_team_id');
    localStorage.removeItem('synkord_current_project_id');
    window.synkord?.mcpSetActiveProject?.(null).catch(() => undefined);
    setBootstrapping(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setBootstrapping(false);
      return;
    }
    apiClient.get('/auth/me')
      .then((resp) => {
        if (cancelled) return;
        const userData = resp.data as any;
        if (userData && userData.id) {
          setUser(userData);
          localStorage.setItem('synkord_user', JSON.stringify(userData));
        }
        setBootstrapping(false);
      })
      .catch(() => {
        if (cancelled) return;
        logout();
      });
    return () => {
      cancelled = true;
    };
  }, [token, logout]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, bootstrapping }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
