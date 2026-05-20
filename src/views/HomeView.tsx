import { useTheme } from '../context/ThemeContext';
import type { ThemeType } from '../context/ThemeContext';
import { Tv, Smartphone, Sparkles, Beer, Gamepad2, Layers } from 'lucide-react';

export const HomeView: React.FC = () => {
  const { theme, setTheme } = useTheme();

  const themesList: { id: ThemeType; label: string; desc: string; icon: React.ReactNode }[] = [
    {
      id: 'pub',
      label: 'Classique Pub',
      desc: 'Ambiance chaleureuse, bois sombre, vert billard et charme traditionnel.',
      icon: <Beer className="w-6 h-6 text-theme-accent" />,
    },
    {
      id: 'arcade',
      label: 'Rétro Arcade',
      desc: 'Effets néon vibrants, pixel art, contrastes électriques sur fond noir absolu.',
      icon: <Gamepad2 className="w-6 h-6 text-theme-accent" />,
    },
    {
      id: 'modern',
      label: 'Minimaliste Moderne',
      desc: 'Style épuré, typographie fine, contrastes stricts et élégance géométrique.',
      icon: <Layers className="w-6 h-6 text-theme-accent" />,
    },
  ];

  return (
    <div className="min-h-screen bg-theme-bg text-theme-text-primary transition-all duration-300 flex flex-col items-center justify-center p-6 md:p-12">
      {/* Container principal avec effet glassmorphisme */}
      <div className="w-full max-w-4xl bg-black/30 border border-theme-border/50 rounded-3xl p-8 md:p-12 backdrop-blur-md shadow-2xl flex flex-col items-center text-center">
        
        {/* En-tête / Logo */}
        <div className="relative mb-8">
          <h1 className={`text-5xl md:text-7xl font-extrabold tracking-wider ${theme === 'arcade' ? 'neon-glow-pink-text text-theme-text-secondary font-mono' : ''}`}>
            MINOU DART
          </h1>
          <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-24 h-1 bg-theme-accent rounded-full shadow-lg"></div>
        </div>

        <p className="max-w-xl text-base md:text-lg text-theme-text-secondary mb-12 leading-relaxed">
          Le configurateur de scoring de fléchettes ultime. Conçu pour le jeu sur vidéoprojecteur à la maison avec télécommande mobile.
        </p>

        {/* Sélection des Thèmes */}
        <div className="w-full mb-12">
          <h2 className={`text-xl md:text-2xl font-bold mb-6 tracking-wide flex items-center justify-center gap-2 ${theme === 'arcade' ? 'neon-glow-text text-theme-accent' : ''}`}>
            <Sparkles className="w-5 h-5 text-theme-accent animate-pulse" /> CHOISIR L'AMBIANCE VISUELLE
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {themesList.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`flex flex-col items-center p-6 rounded-2xl border transition-all duration-300 text-center cursor-pointer group ${
                  theme === t.id
                    ? 'bg-theme-accent/15 border-theme-accent shadow-lg scale-105'
                    : 'bg-black/20 border-theme-border/30 hover:border-theme-accent/50 hover:bg-black/40'
                }`}
              >
                <div className={`p-4 rounded-full mb-4 transition-transform duration-300 group-hover:scale-110 ${
                  theme === t.id ? 'bg-theme-accent/20' : 'bg-black/40'
                }`}>
                  {t.icon}
                </div>
                <h3 className="font-bold text-lg mb-2 text-theme-text-primary group-hover:text-theme-accent transition-colors duration-300">
                  {t.label}
                </h3>
                <p className="text-xs text-theme-text-secondary leading-relaxed">
                  {t.desc}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Sélection des Vues */}
        <div className="w-full max-w-2xl">
          <h2 className={`text-xl md:text-2xl font-bold mb-6 tracking-wide ${theme === 'arcade' ? 'neon-glow-text text-theme-accent' : ''}`}>
            LANCER LES ÉCRANS
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Bouton Vue Projecteur */}
            <a
              href="#/projector"
              className={`flex items-center justify-between p-6 rounded-2xl border bg-black/40 border-theme-border/40 hover:border-theme-accent hover:bg-theme-accent/10 transition-all duration-300 group shadow-lg ${
                theme === 'arcade' ? 'hover:neon-glow-border' : ''
              }`}
            >
              <div className="flex items-center gap-4 text-left">
                <div className="p-3 bg-theme-accent/15 text-theme-accent rounded-xl group-hover:scale-110 transition-transform duration-300">
                  <Tv className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-theme-text-primary group-hover:text-theme-accent transition-colors duration-300">
                    Vidéoprojecteur
                  </h3>
                  <p className="text-xs text-theme-text-secondary">Affichage sur grand écran</p>
                </div>
              </div>
              <span className="text-theme-accent font-bold group-hover:translate-x-1 transition-transform duration-300">&rarr;</span>
            </a>

            {/* Bouton Vue Télécommande */}
            <a
              href="#/remote"
              className={`flex items-center justify-between p-6 rounded-2xl border bg-black/40 border-theme-border/40 hover:border-theme-accent hover:bg-theme-accent/10 transition-all duration-300 group shadow-lg ${
                theme === 'arcade' ? 'hover:neon-glow-border' : ''
              }`}
            >
              <div className="flex items-center gap-4 text-left">
                <div className="p-3 bg-theme-accent/15 text-theme-accent rounded-xl group-hover:scale-110 transition-transform duration-300">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-theme-text-primary group-hover:text-theme-accent transition-colors duration-300">
                    Télécommande
                  </h3>
                  <p className="text-xs text-theme-text-secondary">Interface de saisie mobile</p>
                </div>
              </div>
              <span className="text-theme-accent font-bold group-hover:translate-x-1 transition-transform duration-300">&rarr;</span>
            </a>
          </div>
        </div>

        {/* Pied de page */}
        <div className="mt-12 pt-6 border-t border-theme-border/20 w-full text-xs text-theme-text-secondary/70 flex justify-between items-center px-4">
          <span>&copy; {new Date().getFullYear()} Minou Dart</span>
          <span className="flex items-center gap-1 font-semibold text-theme-accent">
            <Sparkles className="w-3.5 h-3.5" /> Métrique & Convivial
          </span>
        </div>

      </div>
    </div>
  );
};
