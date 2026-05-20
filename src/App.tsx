import React, { useState, useEffect } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { HomeView } from './views/HomeView';
import { ProjectorView } from './views/ProjectorView';
import { RemoteView } from './views/RemoteView';

const AppContent: React.FC = () => {
  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    // Récupérer le hash actuel ou '/' par défaut
    const hash = window.location.hash;
    return hash || '#/';
  });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      setCurrentRoute(hash || '#/');
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  // Rendu conditionnel des vues en fonction du Hash (en ignorant les paramètres après le '?')
  const baseRoute = currentRoute.split('?')[0];

  switch (baseRoute) {
    case '#/projector':
      return <ProjectorView />;
    case '#/remote':
      return <RemoteView />;
    case '#/':
    case '':
    default:
      return <HomeView />;
  }
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
