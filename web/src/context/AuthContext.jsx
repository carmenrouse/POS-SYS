import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import client, { TOKEN_KEY, apiErrorMessage } from '../api/client';

const AuthContext = createContext(null);

const ROLE_RANK = { STAFF: 1, MANAGER: 2, OWNER: 3 };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    (async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        setBooting(false);
        return;
      }
      try {
        const { data } = await client.get('/auth/me');
        setUser(data.user);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      const { data } = await client.post('/auth/login', { email, password });
      localStorage.setItem(TOKEN_KEY, data.token);
      setUser(data.user);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: apiErrorMessage(err) };
    }
  }, []);

  const registerBusiness = useCallback(async (payload) => {
    try {
      const { data } = await client.post('/auth/register-business', payload);
      localStorage.setItem(TOKEN_KEY, data.token);
      setUser(data.user);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: apiErrorMessage(err) };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const hasRole = useCallback((minRole) => !!user && ROLE_RANK[user.role] >= ROLE_RANK[minRole], [user]);

  const value = useMemo(
    () => ({ user, booting, login, registerBusiness, logout, hasRole }),
    [user, booting, login, registerBusiness, logout, hasRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
