# 04_USER_STORIES.md
## Parcours Utilisateur (User Flow)

### Étape 1 : Authentification et Accueil
- **US 1.1 :** En tant qu'administrateur, je veux me connecter avec mon compte Google de manière sécurisée via Firebase Auth pour accéder à "Minou Dart".
- **US 1.2 :** Une fois connecté, j'arrive sur le tableau de bord principal me permettant de lancer une nouvelle partie ou de consulter l'historique.

### Étape 2 : Sélection des Joueurs
- **US 2.1 :** En tant qu'utilisateur, je veux voir une liste de joueurs préexistants avec des cases à cocher (checkboxes) pour sélectionner ceux qui vont jouer la partie (de 1 à 8 joueurs).
- **US 2.2 :** Je veux pouvoir cliquer sur un bouton "Créer un joueur" pour ajouter une nouvelle personne à la base de données.
- **US 2.3 :** Je veux pouvoir réorganiser l'ordre de passage des joueurs sélectionnés avant de valider.

### Étape 3 : Configuration du Jeu
- **US 3.1 :** Je veux sélectionner le type de jeu (X01 ou Cricket).
- **US 3.2 :** Si X01 est choisi, je veux un menu déroulant pour choisir le score de départ (101 à 1001) et un interrupteur (toggle) pour activer/désactiver le "Double Out".
- **US 3.3 :** Si Cricket est choisi, je veux un sélecteur pour le mode (Classique, Aléatoire, Aléatoire Non-Adjacent).

### Étape 4 : Le Menu en Jeu (In-Game Controls)
- **US 4.1 :** Pendant une partie, je veux pouvoir ouvrir un menu contextuel (Burger menu) depuis mon téléphone.
- **US 4.2 :** Depuis ce menu, je veux pouvoir mettre la partie en "Pause" (bloque la saisie).
- **US 4.3 :** Je veux pouvoir cliquer sur "Retour au menu principal". Le système doit alors mettre la partie en cache. Si je relance l'application, on doit me proposer de "Reprendre la partie en cours".
- **US 4.4 :** Je veux pouvoir cliquer sur "Annuler la partie" (Abort) pour la supprimer définitivement sans impacter les statistiques des joueurs.
