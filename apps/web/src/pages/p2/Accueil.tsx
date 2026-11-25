import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";

/**
 * Accueil provisoire : rejoindre la salle d'attente d'une vente par son identifiant.
 * Le catalogue des événements (P1) remplacera ce formulaire.
 */
export function Accueil() {
  const navigate = useNavigate();
  const [evenementId, setEvenementId] = useState("");

  const rejoindre = (e: FormEvent) => {
    e.preventDefault();
    const id = evenementId.trim();
    if (id) void navigate(`/vente/${encodeURIComponent(id)}`);
  };

  return (
    <section aria-labelledby="titre-accueil">
      <h1 id="titre-accueil">Rejoindre une mise en vente</h1>
      <form onSubmit={rejoindre}>
        <label htmlFor="evenement">Identifiant de l'événement</label>
        <input
          id="evenement"
          value={evenementId}
          onChange={(e) => setEvenementId(e.target.value)}
          placeholder="par exemple concert-demo"
          required
        />
        <button type="submit">Rejoindre la salle d'attente</button>
      </form>
    </section>
  );
}
