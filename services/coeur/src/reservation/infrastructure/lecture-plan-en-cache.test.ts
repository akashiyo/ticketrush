import { describe, expect, it, vi } from "vitest";

import type { PlanDeSalle } from "../domaine/plan.js";
import { LecturePlanEnCache } from "./lecture-plan-en-cache.js";

const plan: PlanDeSalle = { evenementId: "evt-1", categories: [] };

describe("LecturePlanEnCache", () => {
  it("1 000 demandes simultanées ne lisent la base qu'une fois", async () => {
    const interne = { lire: vi.fn(async () => plan) };
    const cache = new LecturePlanEnCache(interne);

    await Promise.all(Array.from({ length: 1_000 }, () => cache.lire("evt-1")));

    expect(interne.lire).toHaveBeenCalledTimes(1);
  });

  it("relit la base après 2 s", async () => {
    let maintenant = 0;
    const interne = { lire: vi.fn(async () => plan) };
    const cache = new LecturePlanEnCache(interne, 2_000, () => maintenant);

    await cache.lire("evt-1");
    maintenant = 1_999;
    await cache.lire("evt-1");
    maintenant = 2_000;
    await cache.lire("evt-1");

    expect(interne.lire).toHaveBeenCalledTimes(2);
  });

  it("ne garde pas une lecture en échec", async () => {
    const interne = {
      lire: vi
        .fn<() => Promise<PlanDeSalle | null>>()
        .mockRejectedValueOnce(new Error("panne"))
        .mockResolvedValue(plan),
    };
    const cache = new LecturePlanEnCache(interne);

    await expect(cache.lire("evt-1")).rejects.toThrow("panne");
    expect(await cache.lire("evt-1")).toBe(plan);
  });
});
