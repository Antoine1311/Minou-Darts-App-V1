import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { signInAnonymously, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  loginAnonymously: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Écouter les changements d'état de connexion de Firebase
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      
      // Connexion anonyme automatique s'il n'y a pas d'utilisateur (idéal pour un accès rapide aux bornes/télécommandes)
      if (!currentUser) {
        try {
          setLoading(true);
          await signInAnonymously(auth);
        } catch (error) {
          console.error("Erreur lors de la connexion anonyme automatique :", error);
          setLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const loginAnonymously = async () => {
    setLoading(true);
    try {
      await signInAnonymously(auth);
    } catch (error) {
      console.error("Erreur de connexion anonyme :", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Erreur de connexion Google :", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Erreur lors de la déconnexion :", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginAnonymously, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth doit être utilisé à l\'intérieur d\'un AuthProvider');
  }
  return context;
};
