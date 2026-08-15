import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

describe("Strike Core Contract v1.1", () => {
  beforeEach(() => {
    simnet.callPublicFn("strike-core-v1-1", "flip-gate", [], deployer);
    simnet.callPublicFn("soul-nft-v1", "set-mint-address", [], deployer);
    simnet.callPublicFn("soul-nft-v1", "mint", [Cl.principal(wallet1)], deployer);
    simnet.callPublicFn("strike-core-v1-1", "deposit-stx", [Cl.uint(10000000)], deployer);
    simnet.callPublicFn("strike-core-v1-1", "deposit-sbtc", [Cl.uint(10000000000)], deployer);
  });

  it("exposes the expected defaults", () => {
    const gate = simnet.callReadOnlyFn("strike-core-v1-1", "gate-enabled", [], wallet1);
    const minStx = simnet.callReadOnlyFn("strike-core-v1-1", "get-min-token-limit", [], wallet1);
    const minSbtc = simnet.callReadOnlyFn("strike-core-v1-1", "get-min-token-limit-sbtc", [], wallet1);

    expect(gate.result).toBeOk(Cl.bool(true));
    expect(minStx.result).toBeUint(1000000);
    expect(minSbtc.result).toBeUint(1000000000);
  });

  it("rejects a STX session below the minimum amount", () => {
    const updated = simnet.callPublicFn(
      "strike-core-v1-1",
      "set-min-token-limit",
      [Cl.uint(2000000)],
      deployer
    );
    const denied = simnet.callPublicFn(
      "strike-core-v1-1",
      "create-session",
      [Cl.uint(1), Cl.stringAscii("PvP"), Cl.uint(1000000)],
      wallet1
    );

    expect(updated.result).toBeOk(Cl.bool(true));
    expect(denied.result).toBeErr(Cl.uint(101));
  });

  it("supports the manual STX approve and finalize flow", () => {
    const session = simnet.callPublicFn(
      "strike-core-v1-1",
      "create-session",
      [Cl.uint(1), Cl.stringAscii("PvP"), Cl.uint(1000000)],
      wallet1
    );

    if (session.result.type !== "ok") {
      throw new Error("Failed to create STX session");
    }

    simnet.callPublicFn("soul-nft-v1", "mint", [Cl.principal(wallet2)], deployer);

    const joined = simnet.callPublicFn(
      "strike-core-v1-1",
      "approve-session",
      [Cl.uint(2), session.result.value],
      wallet2
    );

    const finalized = simnet.callPublicFn(
      "strike-core-v1-1",
      "finalize-session",
      [session.result.value, Cl.buffer(new Uint8Array(32).fill(1)), Cl.principal(wallet1)],
      deployer
    );

    const fees = simnet.callReadOnlyFn("strike-core-v1-1", "get-total-fees", [], deployer);

    expect(joined.result).toBeOk(Cl.bool(true));
    expect(finalized.result).toBeOk(Cl.bool(true));
    expect(fees.result).toBeUint(200000);
  });

  it("auto-finalizes a STX session and records the fee split", () => {
    const session = simnet.callPublicFn(
      "strike-core-v1-1",
      "create-session-by-default",
      [Cl.uint(1), Cl.stringAscii("PvE"), Cl.uint(1000000)],
      wallet1
    );

    const finalized = simnet.callReadOnlyFn(
      "strike-core-v1-1",
      "get-finalized-session",
      [session.result.value],
      wallet1
    );
    const fees = simnet.callReadOnlyFn("strike-core-v1-1", "get-total-fees", [], deployer);

    expect(session.result.type).toBe("ok");
    expect(finalized.result.type).toBe("ok");
    expect(fees.result).toBeUint(100000);
  });

  it("updates the sBTC minimum token limit", () => {
    const updated = simnet.callPublicFn(
      "strike-core-v1-1",
      "set-min-token-limit-sbtc",
      [Cl.uint(2000000000)],
      deployer
    );
    const minSbtc = simnet.callReadOnlyFn("strike-core-v1-1", "get-min-token-limit-sbtc", [], wallet1);

    expect(updated.result).toBeOk(Cl.bool(true));
    expect(minSbtc.result).toBeUint(2000000000);
  });
});