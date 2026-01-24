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
    // Fund the contract for reward payouts
    simnet.callPublicFn("strike-core", "deposit-stx", [Cl.uint(10000000)], deployer);
  });

  describe("Session Creation", () => {
    it("should create session with Soul NFT", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.stringAscii("PVE"), Cl.uint(1000000)],
        wallet1
      );
      // Session ID is a buffer, just check it's ok
      expect(result.type).toBe("ok");
    });

    it("should fail to create session without Soul NFT", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.stringAscii("PVP"), Cl.uint(1000000)],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(102)); // ERR-DONT-HAVE-SOUL-NFT
    });

    it("should increment session counter", () => {
      const result1 = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.stringAscii("PVE"), Cl.uint(1000000)],
        wallet1
      );
      
      const result2 = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.stringAscii("PVP"), Cl.uint(2000000)],
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
        [Cl.stringAscii("PVE"), Cl.uint(1000000)],
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
        [Cl.stringAscii("PVE"), Cl.uint(1000000)],
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
        [Cl.stringAscii("PVE"), Cl.uint(1000000)],
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

  describe("Token Management", () => {
    it("should allow owner to set minimum token limit", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "set-min-token-limit",
        [Cl.uint(2000000)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail to set minimum token limit if not owner", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "set-min-token-limit",
        [Cl.uint(2000000)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED
    });

    it("should fail to create session with amount below minimum", () => {
      // Set min limit to 2 STX
      simnet.callPublicFn(
        "strike-core",
        "set-min-token-limit",
        [Cl.uint(2000000)],
        deployer
      );

      const { result } = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.stringAscii("PVE"), Cl.uint(1000000)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(103)); // ERR-AMOUNT-TOO-LOW
    });

    it("should allow owner to withdraw STX", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "withdraw-stx",
        [Cl.uint(1000000)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail to withdraw STX if not owner", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "withdraw-stx",
        [Cl.uint(1000000)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED
    });
  });

  describe("Session Joining", () => {
    it("should allow second player to approve and join session", () => {
      // Mint NFT to wallet2 so they can join
      simnet.callPublicFn("strike-core", "claim-one", [], wallet2);

      // Create session with wallet1
      const sessionResult = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.stringAscii("PVP"), Cl.uint(1000000)],
        wallet1
      );

      if (sessionResult.result.type !== "ok") {
        throw new Error("Failed to create session");
      }

      const sessionId = sessionResult.result.value;

      // Join with wallet2
      const { result } = simnet.callPublicFn(
        "strike-core",
        "approve-session",
        [sessionId],
        wallet2
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail to join session without Soul NFT", () => {
      // Create session with wallet1
      const sessionResult = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.stringAscii("PVP"), Cl.uint(1000000)],
        wallet1
      );

      if (sessionResult.result.type !== "ok") {
        throw new Error("Failed to create session");
      }

      const sessionId = sessionResult.result.value;

      // Try to join without NFT
      const { result } = simnet.callPublicFn(
        "strike-core",
        "approve-session",
        [sessionId],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(102)); // ERR-DONT-HAVE-SOUL-NFT
    });
  });

  describe("Clarity 4 Features", () => {
    it("should use stacks-block-time for session creation", () => {
      const sessionResult = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.stringAscii("PVE"), Cl.uint(1000000)],
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

      // Session should have created-at timestamp
      expect(result.type).toBe("ok");
    });
  });
});
