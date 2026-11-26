/**
 * Fonction de fitness n° 2, volet événements (ADR 021) : compare deux versions d'un contrat
 * AsyncAPI et liste les changements qui casseraient un consommateur.
 *
 * Règle du contrat (packages/contrats/asyncapi, ADR 005) : « évolution compatible uniquement :
 * ajouter un champ optionnel ; jamais renommer ni supprimer ». Sont donc incompatibles :
 * - un message supprimé ;
 * - un champ supprimé (ou renommé : supprimé puis ajouté) ;
 * - un champ obligatoire ajouté, ou un champ optionnel devenu obligatoire ;
 * - un champ obligatoire devenu optionnel (le consommateur comptait dessus) ;
 * - un type, un format, une constante ou une liste de valeurs modifiés.
 * Sont compatibles : un message ajouté, un champ optionnel ajouté, une description modifiée.
 */

type Schema = {
  $ref?: string;
  allOf?: Schema[];
  type?: string | string[];
  format?: string;
  const?: unknown;
  enum?: unknown[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
};

export type ContratAsyncApi = {
  components?: {
    messages?: Record<string, { payload?: Schema }>;
    schemas?: Record<string, Schema>;
  };
};

/** Résout les `$ref` internes et fusionne les `allOf` en un seul schéma. */
function aplatir(schema: Schema | undefined, contrat: ContratAsyncApi, profondeur = 0): Schema {
  if (!schema || profondeur > 20) return {};
  if (schema.$ref) {
    const nom = schema.$ref.replace("#/components/schemas/", "");
    const cible = contrat.components?.schemas?.[nom];
    if (!cible) throw new Error(`Référence introuvable : ${schema.$ref}`);
    return aplatir({ ...cible, ...withoutRef(schema) }, contrat, profondeur + 1);
  }
  if (schema.allOf) {
    const parties = schema.allOf.map((s) => aplatir(s, contrat, profondeur + 1));
    const fusion: Schema = { ...withoutAllOf(schema) };
    for (const partie of parties) {
      fusion.type ??= partie.type;
      fusion.properties = { ...fusion.properties, ...partie.properties };
      fusion.required = [...new Set([...(fusion.required ?? []), ...(partie.required ?? [])])];
    }
    return fusion;
  }
  return schema;
}

function withoutRef(schema: Schema): Schema {
  const copie = { ...schema };
  delete copie.$ref;
  return copie;
}

function withoutAllOf(schema: Schema): Schema {
  const copie = { ...schema };
  delete copie.allOf;
  return copie;
}

const egal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function comparerSchemas(
  avant: Schema | undefined,
  apres: Schema | undefined,
  chemin: string,
  ctxAvant: ContratAsyncApi,
  ctxApres: ContratAsyncApi,
  ruptures: string[],
): void {
  const a = aplatir(avant, ctxAvant);
  const b = aplatir(apres, ctxApres);

  for (const cle of ["type", "format", "const"] as const) {
    if (!egal(a[cle], b[cle])) {
      ruptures.push(
        `${chemin} : ${cle} modifié (${JSON.stringify(a[cle])} → ${JSON.stringify(b[cle])})`,
      );
    }
  }
  if (!egal([...(a.enum ?? [])].sort(), [...(b.enum ?? [])].sort())) {
    ruptures.push(`${chemin} : valeurs possibles modifiées`);
  }

  const requisAvant = new Set(a.required ?? []);
  const requisApres = new Set(b.required ?? []);
  for (const [nom, sousSchema] of Object.entries(a.properties ?? {})) {
    const sousChemin = `${chemin}.${nom}`;
    const suite = b.properties?.[nom];
    if (!suite) {
      ruptures.push(`${sousChemin} : champ supprimé ou renommé`);
      continue;
    }
    if (requisAvant.has(nom) && !requisApres.has(nom)) {
      ruptures.push(`${sousChemin} : champ obligatoire devenu optionnel`);
    }
    if (!requisAvant.has(nom) && requisApres.has(nom)) {
      ruptures.push(`${sousChemin} : champ optionnel devenu obligatoire`);
    }
    comparerSchemas(sousSchema, suite, sousChemin, ctxAvant, ctxApres, ruptures);
  }
  for (const nom of Object.keys(b.properties ?? {})) {
    if (!a.properties?.[nom] && requisApres.has(nom)) {
      ruptures.push(`${chemin}.${nom} : champ obligatoire ajouté`);
    }
  }
  if (a.items || b.items) {
    comparerSchemas(a.items, b.items, `${chemin}[]`, ctxAvant, ctxApres, ruptures);
  }
}

/** Liste les changements incompatibles entre deux versions ; tableau vide = compatible. */
export function changementsIncompatibles(avant: ContratAsyncApi, apres: ContratAsyncApi): string[] {
  const ruptures: string[] = [];
  const messagesApres = apres.components?.messages ?? {};
  for (const [nom, message] of Object.entries(avant.components?.messages ?? {})) {
    const suite = messagesApres[nom];
    if (!suite) {
      ruptures.push(`${nom} : message supprimé`);
      continue;
    }
    comparerSchemas(message.payload, suite.payload, nom, avant, apres, ruptures);
  }
  return ruptures;
}
