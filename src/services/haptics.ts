/**
 * Service de retour haptique (vibrations tactiles) pour télécommandes mobiles et PWA.
 * Fournit un retour sensoriel immédiat pour chaque interaction (saisie, validation, bust, annulation).
 */

class HapticsService {
  private isSupported(): boolean {
    return typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'vibrate' in navigator;
  }

  /**
   * Vibration légère pour la saisie standard (chiffre, touche tactile).
   */
  public tap(): void {
    if (this.isSupported()) {
      try {
        navigator.vibrate(12);
      } catch {
        // Ignorer silencieusement si bloqué par la politique de l'agent utilisateur
      }
    }
  }

  /**
   * Vibration de confirmation / succès (checkout réussi, cible Cricket fermée).
   */
  public success(): void {
    if (this.isSupported()) {
      try {
        navigator.vibrate([20, 60, 25]);
      } catch {
        // Silencieux
      }
    }
  }

  /**
   * Vibration d'erreur ou de Bust (dépassement de score X01).
   */
  public error(): void {
    if (this.isSupported()) {
      try {
        navigator.vibrate([60, 40, 60]);
      } catch {
        // Silencieux
      }
    }
  }

  /**
   * Vibration spécifique pour l'annulation (Undo).
   */
  public undo(): void {
    if (this.isSupported()) {
      try {
        navigator.vibrate(25);
      } catch {
        // Silencieux
      }
    }
  }
}

export const haptics = new HapticsService();
