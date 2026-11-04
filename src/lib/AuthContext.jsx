import React, { createContext, useState, useContext, useEffect } from 'react';
import { coreClient } from '@/api/coreClient';
import { classifySessionCheckFailure } from './sessionCheckFailure';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => { void checkAppState(); }, []);

  const checkAppState = async () => {
    setAuthError(null);
    try {
      await checkUserAuth();
    } catch {
      // checkUserAuth already classified the failure. Do not turn a network
      // error into an unauthenticated redirect or overwrite its retry state.
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await coreClient.auth.me();
      setUser(currentUser); setIsAuthenticated(true); setAuthError(null);
    } catch (error) {
      setUser(null); setIsAuthenticated(false);
      setAuthError(classifySessionCheckFailure(error));
      throw error;
    } finally { setIsLoadingAuth(false); setAuthChecked(true); }
  };

  const logout = async (shouldRedirect = true) => {
    setAuthError(null);
    try {
      await coreClient.auth.logout(shouldRedirect ? window.location.href : undefined);
      setUser(null); setIsAuthenticated(false);
    } catch (error) {
      setAuthError({ type: 'unknown', message: error.message || 'Failed to revoke session' });
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoadingAuth, isLoadingPublicSettings: false, authError, appPublicSettings: null, authChecked, logout, checkUserAuth, checkAppState }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
