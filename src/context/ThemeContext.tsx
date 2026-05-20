import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeType = 'pub' | 'arcade' | 'modern';

interface ThemeContextType {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Récupérer le thème stocké ou par défaut 'pub'
  const [theme, setThemeState] = useState<ThemeType>(() => {
    const savedTheme = localStorage.getItem('minou-dart-theme');
    return (savedTheme as ThemeType) || 'pub';
  });

  const setTheme = (newTheme: ThemeType) => {
    setThemeState(newTheme);
    localStorage.setItem('minou-dart-theme', newTheme);
  };

  // Appliquer le thème sur le body de la page
  useEffect(() => {
    const body = document.body;
    
    // Supprimer les anciennes classes de thème
    body.classList.remove('theme-pub', 'theme-arcade', 'theme-modern');
    
    // Ajouter la nouvelle classe de thème
    body.classList.add(`theme-${theme}`);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme doit être utilisé à l\'intérieur d\'un ThemeProvider');
  }
  return context;
};
