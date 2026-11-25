import { describe, expect, it } from "vitest";

import { VERSION_CONTRATS } from "./index.js";

describe("contrats", () => {
  it("expose une version au format semver", () => {
    expect(VERSION_CONTRATS).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
