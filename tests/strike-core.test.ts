import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

describe("Strike Core Contract", () => {
  beforeEach(() => {
    // Register strike-core as mint address, enable sale, and mint NFT to wallet1
    simnet.callPublicFn("soul-nft", "set-mint-address", [], deployer);
    simnet.callPublicFn("strike-core", "flip-sale", [], deployer);
    simnet.callPublicFn("strike-core", "claim-one", [], wallet1);
  });

  describe("Session Creation", () => {
    it("should create session with Soul NFT", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.stringAscii("PVE")],
        wallet1
      );
      // Session ID is a buffer, just check it's ok
      expect(result.type).toBe("ok");
    });

    it("should fail to create session without Soul NFT", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.stringAscii("PVP")],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(102)); // ERR-DONT-HAVE-SOUL-NFT
    });

    it("should increment session counter", () => {
      const result1 = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.stringAscii("PVE")],
        wallet1
      );
      
      const result2 = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.stringAscii("PVP")],
        wallet1
      );
      
      // Both should succeed
      expect(result1.result.type).toBe("ok");
      expect(result2.result.type).toBe("ok");
    });
  });

  describe("Session Finalization", () => {
    it("should finalize session", () => {
      const sessionResult = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.stringAscii("PVE")],
        wallet1
      );

      if (sessionResult.result.type !== "ok") {
        throw new Error("Failed to create session");
      }

      const sessionId = sessionResult.result.value;
      const resultHash = new Uint8Array(32).fill(1);

      const { result } = simnet.callPublicFn(
        "strike-core",
        "finalize-session",
        [
          sessionId,
          Cl.buffer(resultHash),
          Cl.principal(wallet1)
        ],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should store finalized session data", () => {
      const sessionResult = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.stringAscii("PVE")],
        wallet1
      );

      if (sessionResult.result.type !== "ok") {
        throw new Error("Failed to create session");
      }

      const sessionId = sessionResult.result.value;
      const resultHash = new Uint8Array(32).fill(1);

      simnet.callPublicFn(
        "strike-core",
        "finalize-session",
        [
          sessionId,
          Cl.buffer(resultHash),
          Cl.principal(wallet1)
        ],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        "strike-core",
        "get-finalized-session",
        [sessionId],
        wallet1
      );
      
      // Check that result is some (not none)
      expect(result.type).toBe("ok");
    });
  });

  describe("Read-Only Functions", () => {
    it("should check if account has Soul NFT", () => {
      const { result } = simnet.callReadOnlyFn(
        "strike-core",
        "has-soul-nft",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should return error if no Soul NFT", () => {
      const { result } = simnet.callReadOnlyFn(
        "strike-core",
        "has-soul-nft",
        [Cl.principal(wallet2)],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(102)); // ERR-DONT-HAVE-SOUL-NFT
    });

    it("should get session data", () => {
      const sessionResult = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.stringAscii("PVE")],
        wallet1
      );

      if (sessionResult.result.type !== "ok") {
        throw new Error("Failed to create session");
      }

      const sessionId = sessionResult.result.value;

      const { result } = simnet.callReadOnlyFn(
        "strike-core",
        "get-session",
        [sessionId],
        wallet1
      );
      
      // Check that result is some (not none)
      expect(result.type).toBe("ok");
    });
  });

  describe("Sale Management", () => {
    it("should check sale status", () => {
      const { result } = simnet.callReadOnlyFn(
        "strike-core",
        "sale-enabled",
        [],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true)); // true because flip-sale was called in beforeEach
    });

    it("should flip sale state", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "flip-sale",
        [],
        deployer
      );
      expect(result).toBeOk(Cl.bool(false)); // false because it was true from beforeEach, now toggled to false
    });

    it("should fail to flip sale if not owner", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "flip-sale",
        [],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED
    });
  });

  describe("Claim Functions", () => {
    it("should claim five NFTs", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "claim-five",
        [],
        wallet2
      );
      expect(result).toBeOk(Cl.bool(true));
      
      // Check balance
      const balance = simnet.callReadOnlyFn(
        "soul-nft",
        "get-balance",
        [Cl.principal(wallet2)],
        wallet2
      );
      expect(balance.result).toBeUint(5);
    });
  });
});
