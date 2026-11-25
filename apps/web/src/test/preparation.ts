import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vide le DOM après chaque test : sans les « globals » de Vitest, Testing Library ne le fait pas seul.
afterEach(cleanup);
