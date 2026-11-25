import "./style.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Application } from "./app/Application";
import { creerGestionnaire, FournisseurAuth } from "./auth/auth";
import { FournisseurApi } from "./commun/api-contexte";

const racine = document.getElementById("racine");
if (!racine) throw new Error("Élément #racine introuvable");

createRoot(racine).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <FournisseurAuth gestionnaire={creerGestionnaire()}>
        <FournisseurApi>
          <Application />
        </FournisseurApi>
      </FournisseurAuth>
    </QueryClientProvider>
  </StrictMode>,
);
