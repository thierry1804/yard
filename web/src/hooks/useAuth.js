import { useState, useCallback, useEffect } from 'react';
import { api, getToken, setToken, onUnauthorized } from '../api/client';

export function useAuth() {
  const [token, setTok] = useState(getToken());
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!getToken());
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(
    () =>
      onUnauthorized(() => {
        setTok(null);
        setUser(null);
        setSessionExpired(true);
      }),
    [],
  );

  useEffect(() => {
    // `checking` already starts false when there's no persisted token
    // (see useState(!!getToken()) above), so there's nothing to flip here.
    if (!token) return;
    let cancelled = false;
    api
      .me()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        if (!cancelled) {
          setToken(null);
          setTok(null);
        }
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = useCallback(async (email, password) => {
    const result = await api.login(email, password);
    setToken(result.accessToken);
    setTok(result.accessToken);
    setUser(result.user);
    setSessionExpired(false);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setTok(null);
    setUser(null);
  }, []);

  return { token, user, checking, sessionExpired, login, logout };
}
