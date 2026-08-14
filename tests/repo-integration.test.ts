import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

describe("Repository Integration Smoke", () => {
  it("exposes both RNG and Strike read-only entry points", () => {
    const rngOwner = simnet.callReadOnlyFn("rng-core-v1", "get-owner", [], deployer);
    const strikeGate = simnet.callReadOnlyFn("strike-core-v1", "gate-enabled", [], deployer);

    expect(rngOwner.result.type).toBe("ok");
    expect(strikeGate.result).toBeOk(Cl.bool(false));
  });

  it("returns configured defaults for both modules", () => {
    const minStx = simnet.callReadOnlyFn("strike-core-v1", "get-min-token-limit", [], deployer);
    const rngCoreRef = simnet.callReadOnlyFn("rng-operator-v1", "get-rng-core", [], deployer);

    expect(minStx.result).toBeUint(1000000);
    expect(rngCoreRef.result.type).toBe("ok");
  });

  it("exposes Duel and Skate read-only entry points", () => {
    const season = simnet.callReadOnlyFn(
      "strike-duel-core-v1",
      "get-current-season",
      [],
      deployer,
    );
    const supply = simnet.callReadOnlyFn(
      "skate-gear-v1",
      "get-max-supply",
      [],
      deployer,
    );

    expect(season.result).toBeUint(1);
    expect(supply.result).toBeUint(500);
  });
});
