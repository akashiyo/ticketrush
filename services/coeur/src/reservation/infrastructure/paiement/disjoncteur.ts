/** Le disjoncteur est ouvert : l'appel est refusé tout de suite, sans contacter le service. */
export class DisjoncteurOuvert extends Error {
  constructor() {
    super("Disjoncteur ouvert");
    this.name = "DisjoncteurOuvert";
  }
}

export type EtatDisjoncteur = "ferme" | "ouvert" | "semi-ouvert";

export interface OptionsDisjoncteur {
  /** Nombre de derniers appels observés. */
  fenetre: number;
  /** En dessous de ce nombre d'appels observés, le disjoncteur ne s'ouvre pas. */
  minimumAppels: number;
  /** Part d'échecs (0 à 1) qui ouvre le disjoncteur. */
  seuilEchec: number;
  /** Durée pendant laquelle les appels sont refusés avant un appel d'essai. */
  dureeOuvertureMs: number;
  horloge: () => number;
}

/**
 * Disjoncteur (cours, partie 9 ; ADR 005) :
 * - **fermé** : les appels passent, on compte les échecs sur les derniers appels ;
 * - **ouvert** : au-delà de 50 % d'échecs, tout appel échoue immédiatement pendant 30 s. Le Cœur
 *   n'épuise pas ses ressources à attendre un prestataire en panne, et le laisse récupérer ;
 * - **semi-ouvert** : ensuite, un seul appel d'essai. Réussi, on referme ; raté, on rouvre.
 */
export class Disjoncteur {
  private etatCourant: EtatDisjoncteur = "ferme";
  private derniers: boolean[] = [];
  private ouvertLe = 0;
  private essaiEnCours = false;
  private readonly options: OptionsDisjoncteur;

  constructor(options: Partial<OptionsDisjoncteur> = {}) {
    this.options = {
      fenetre: 10,
      minimumAppels: 5,
      seuilEchec: 0.5,
      dureeOuvertureMs: 30_000,
      horloge: Date.now,
      ...options,
    };
  }

  get etat(): EtatDisjoncteur {
    return this.etatCourant;
  }

  async executer<T>(appel: () => Promise<T>): Promise<T> {
    if (this.etatCourant === "ouvert") {
      if (this.options.horloge() - this.ouvertLe < this.options.dureeOuvertureMs) {
        throw new DisjoncteurOuvert();
      }
      this.etatCourant = "semi-ouvert";
    }
    if (this.etatCourant === "semi-ouvert") {
      if (this.essaiEnCours) throw new DisjoncteurOuvert();
      this.essaiEnCours = true;
    }

    try {
      const resultat = await appel();
      this.noter(true);
      return resultat;
    } catch (erreur) {
      this.noter(false);
      throw erreur;
    } finally {
      this.essaiEnCours = false;
    }
  }

  private noter(succes: boolean): void {
    if (this.etatCourant === "semi-ouvert") {
      if (succes) {
        this.etatCourant = "ferme";
        this.derniers = [];
      } else {
        this.ouvrir();
      }
      return;
    }
    this.derniers = [...this.derniers, succes].slice(-this.options.fenetre);
    const echecs = this.derniers.filter((s) => !s).length;
    if (
      this.derniers.length >= this.options.minimumAppels &&
      echecs / this.derniers.length > this.options.seuilEchec
    ) {
      this.ouvrir();
    }
  }

  private ouvrir(): void {
    this.etatCourant = "ouvert";
    this.ouvertLe = this.options.horloge();
    this.derniers = [];
  }
}
