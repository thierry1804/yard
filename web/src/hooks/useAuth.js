import { useState, useCallback, useEffect } from 'react';
import { api, getToken, setToken, onUnauthorized } from '../api/client';
import { restoreSession } from '../api/session';

export function useAuth() {
  const [token, setTok] = useState(getToken());
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!getToken());
  const [sessionExpired, setSessionExpired] = useState(false);
  const [serverUnreachable, setServerUnreachable] = useState(false);

  useEffect(
    () =>
      onUnauthorized(() => {
        setTok(null);
        setUser(null);
        setSessionExpired(true);
        setChecking(false);
      }),
    [],
  );

  useEffect(() => {
    // `checking` already starts false when there's no persisted token
    // (see useState(!!getToken()) above), so there's nothing to flip here.
    if (!token) return;
    return restoreSession({
      me: api.me,
      onUser: (u) => {
        setUser(u);
        setServerUnreachable(false);
        setChecking(false);
      },
      onRetrying: () => setServerUnreachable(true),
    });
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

  return { token, user, checking, sessionExpired, serverUnreachable, login, logout };
}
