# 03_PRD.md
## Product Requirements Document : Minou Dart

### 1. Vision du Produit
Minou Dart est une application web (PWA) de scoring de fléchettes conçue pour un usage personnel sur vidéoprojecteur (Android TV) couplé à un smartphone agissant comme télécommande.

### 2. Architecture Technique
- **Frontend :** React.js (via Vite)
- **Backend / BDD :** Firebase (Authentication pour le login Google, Firestore pour la persistance des joueurs et des historiques de parties, Realtime Database pour la synchronisation sub-seconde entre le téléphone et le projecteur).
- **État de l'application :** Stockage local (LocalStorage/IndexedDB) pour garder la partie en cache en cas de rafraîchissement accidentel.

### 3. Interface et Affichage (Les 2 Vues)
- **Vue Vidéoprojecteur (Affichage Passif / Spectateur) :**
  - **Quart en haut à gauche (25% de l'écran, carré) :** Fond `#FFFFFF` pur, sans aucun élément ni texte en superposition (réservé à l'emplacement de la cible physique).
  - **Quart en haut à droite :** Zone d'information dynamique mise à jour au fur et à mesure de la partie.
  - **Reste de l'écran (moitié inférieure) :** Fond sombre (Dark Mode). Affiche le tableau des scores, les statistiques, le joueur actif et les animations.
- **Vue Télécommande (Mobile) :**
  - Mode paysage ou portrait (optimisé pour la saisie à une main).
  - Comprend le pavé numérique et les modificateurs de tir.

### 4. Gestion des États d'une Partie
Le cycle de vie d'une partie doit gérer les états suivants :
- `LOBBY` : Configuration des options.
- `IN_PROGRESS` : Partie en cours.
- `PAUSED` : Partie suspendue (le timer ou les animations s'arrêtent).
- `ABORTED` : Partie annulée (retour au menu, non comptabilisée dans les statistiques).
- `COMPLETED` : Partie terminée, enregistrement dans l'historique Firestore.
