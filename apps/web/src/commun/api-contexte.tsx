import { createContext, type ReactNode, useContext, useMemo } from "react";

import { useAuth } from "../auth/auth";
import { type ApiFile, creerApiFile } from "./api-file";

const ContexteApi = createContext<ApiFile | null>(null);

/** Fournit le client de la File, branché sur le jeton de l'utilisateur connecté. */
export function FournisseurApi({ children, api }: { children: ReactNode; api?: ApiFile }) {
  const { utilisateur } = useAuth();
  const valeur = useMemo(
    () => api ?? creerApiFile(() => utilisateur?.access_token),
    [api, utilisateur],
  );
  return <ContexteApi.Provider value={valeur}>{children}</ContexteApi.Provider>;
}

export function useApiFile(): ApiFile {
  const api = useContext(ContexteApi);
  if (!api) throw new Error("useApiFile doit être utilisé dans <FournisseurApi>");
  return api;
}
