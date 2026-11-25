import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { JournalJson } from "./journal.js";

function journalEnMemoire(): { journal: JournalJson; lignes: () => Record<string, unknown>[] } {
  const morceaux: string[] = [];
  const destination = new Writable({
    write(morceau, _encodage, suite) {
      morceaux.push(String(morceau));
      suite();
    },
  });
  return {
    journal: new JournalJson({ niveau: "trace", destination }),
    lignes: () =>
      morceaux
        .join("")
        .trim()
        .split("\n")
        .map((ligne) => JSON.parse(ligne) as Record<string, unknown>),
  };
}

describe("JournalJson", () => {
  it("écrit une ligne JSON avec niveau, message et contexte NestJS", () => {
    const { journal, lignes } = journalEnMemoire();
    journal.log("3 acheteur(s) admis", "AdmissionWorker");

    const [ligne] = lignes();
    expect(ligne).toMatchObject({
      level: "info",
      msg: "3 acheteur(s) admis",
      contexte: "AdmissionWorker",
    });
    expect(typeof ligne?.time).toBe("string");
  });

  it("garde l'erreur quand NestJS passe une Error puis le contexte", () => {
    const { journal, lignes } = journalEnMemoire();
    journal.error("Tour d'admission en échec", new Error("Redis indisponible"), "AdmissionWorker");

    const [ligne] = lignes();
    expect(ligne).toMatchObject({ level: "error", contexte: "AdmissionWorker" });
    expect(ligne?.err).toMatchObject({ message: "Redis indisponible", type: "Error" });
  });

  it("traduit verbose en trace, et accepte un message objet", () => {
    const { journal, lignes } = journalEnMemoire();
    journal.verbose({ evenementId: "e1", admis: 2 });

    expect(lignes()[0]).toMatchObject({ level: "trace", evenementId: "e1", admis: 2 });
  });
});
