import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeType = 'pub' | 'arcade' | 'modern';

interface ThemeContextType {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Forcer le thème modern comme unique thème de l'application
  const [theme, setThemeState] = useState<ThemeType>('modern');

  const setTheme = (_newTheme: ThemeType) => {
    // Ignorer le changement pour conserver uniquement 'modern'
    setThemeState('modern');
  };

  // Appliquer le thème sur le body de la page
  useEffect(() => {
    const body = document.body;
    
    // Supprimer les anciennes classes de thème
    body.classList.remove('theme-pub', 'theme-arcade', 'theme-modern');
    
    // Ajouter la nouvelle classe de thème
    body.classList.add('theme-modern');
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

