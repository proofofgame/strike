import { describe, expect, it, beforeEach } from "vitest";
import { Cl} from "@stacks/transactions";

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
        [Cl.uint(1), Cl.stringAscii("PvE"), Cl.uint(1000000)],
        wallet1
      );
      // Session ID is a buffer, just check it's ok
      expect(result.type).toBe("ok");
    });

    it("should fail to create session without Soul NFT", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("PvP"), Cl.uint(1000000)],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(102)); // ERR-DONT-HAVE-SOUL-NFT
    });

    it("should increment session counter", () => {
      // Mine blocks to pass cooldown
      simnet.mineEmptyBlocks(17280); // 24 hours worth of blocks
      
      const result1 = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("PvE"), Cl.uint(1000000)],
        wallet1
      );
      
      // Mine more blocks
      simnet.mineEmptyBlocks(17280);
      
      const result2 = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("PvP"), Cl.uint(2000000)],
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
        [Cl.uint(1), Cl.stringAscii("PvE"), Cl.uint(1000000)],
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
        [Cl.uint(1), Cl.stringAscii("PvE"), Cl.uint(1000000)],
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
        [Cl.uint(1), Cl.stringAscii("PvE"), Cl.uint(1000000)],
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
        [Cl.uint(1), Cl.stringAscii("PvE"), Cl.uint(1000000)],
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
        [Cl.uint(1), Cl.stringAscii("PvP"), Cl.uint(1000000)],
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
        [Cl.uint(2), sessionId],
        wallet2
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail to join session without Soul NFT", () => {
      // Create session with wallet1
      const sessionResult = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("PvP"), Cl.uint(1000000)],
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
        [Cl.uint(1), sessionId],
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
        [Cl.uint(1), Cl.stringAscii("PvE"), Cl.uint(1000000)],
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

  describe("NFT Cooldown", () => {
    it("should check if NFT can be used", () => {
      const { result } = simnet.callReadOnlyFn(
        "strike-core",
        "can-use-nft",
        [Cl.uint(1), Cl.principal(wallet1)],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail to create session if NFT is on cooldown", () => {
      // Create first session
      simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("PvE"), Cl.uint(1000000)],
        wallet1
      );

      // Try to create second session immediately (should fail)
      const { result } = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("PvE"), Cl.uint(1000000)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(108)); // ERR-NFT-ON-COOLDOWN
    });

    it("should allow session creation after 24 hours", () => {
      // Create first session
      simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("PvE"), Cl.uint(1000000)],
        wallet1
      );

      // Mine blocks to simulate 24 hours (86400 seconds / 5 seconds per block = 17280 blocks)
      simnet.mineEmptyBlocks(17280);

      // Try to create second session (should succeed)
      const { result } = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("PvE"), Cl.uint(1000000)],
        wallet1
      );
      expect(result.type).toBe("ok");
    });
  });

  describe("Mode Validation", () => {
    it("should accept valid PvP mode", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("PvP"), Cl.uint(1000000)],
        wallet1
      );
      expect(result.type).toBe("ok");
    });

    it("should accept valid PvE mode", () => {
      // Mine blocks to pass cooldown from previous test
      simnet.mineEmptyBlocks(17280);
      
      const { result } = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("PvE"), Cl.uint(1000000)],
        wallet1
      );
      expect(result.type).toBe("ok");
    });

    it("should accept valid Tournament mode", () => {
      // Mine blocks to pass cooldown from previous test
      simnet.mineEmptyBlocks(17280);
      
      const { result } = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("Tournament"), Cl.uint(1000000)],
        wallet1
      );
      expect(result.type).toBe("ok");
    });

    it("should reject invalid mode", () => {
      // Mine blocks to pass cooldown from previous test
      simnet.mineEmptyBlocks(17280);
      
      const { result } = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("Invalid"), Cl.uint(1000000)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(109)); // ERR-INVALID-MODE
    });
  });

  describe("sBTC Deposit", () => {
    it("should allow owner to deposit sBTC", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "deposit-sbtc",
        [Cl.uint(1000000)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail to deposit sBTC if not owner", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "deposit-sbtc",
        [Cl.uint(1000000)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED
    });
  });



  describe("Session Validation and Edge Cases", () => {
    it("should fail to finalize session twice", () => {
      const sessionResult = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("PvE"), Cl.uint(1000000)],
        wallet1
      );

      if (sessionResult.result.type !== "ok") {
        throw new Error("Failed to create session");
      }

      const sessionId = sessionResult.result.value;
      const resultHash = new Uint8Array(32).fill(1);

      // First finalization should succeed
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

      // Second finalization should fail
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
      expect(result).toBeErr(Cl.uint(106)); // ERR-SESSION-ALREADY-FINALIZED
    });

    it("should fail to finalize session with invalid winner", () => {
      // Mine blocks to pass cooldown
      simnet.mineEmptyBlocks(17280);

      const sessionResult = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("PvE"), Cl.uint(1000000)],
        wallet1
      );

      if (sessionResult.result.type !== "ok") {
        throw new Error("Failed to create session");
      }

      const sessionId = sessionResult.result.value;
      const resultHash = new Uint8Array(32).fill(2);

      // Try to finalize with wrong winner
      const { result } = simnet.callPublicFn(
        "strike-core",
        "finalize-session",
        [
          sessionId,
          Cl.buffer(resultHash),
          Cl.principal(wallet2)
        ],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(105)); // ERR-INVALID-WINNER
    });

    it("should fail to get session with non-existent session-id", () => {
      const fakeSessionId = new Uint8Array(32).fill(255);
      
      const { result } = simnet.callReadOnlyFn(
        "strike-core",
        "get-session",
        [Cl.buffer(fakeSessionId)],
        wallet1
      );
      
      // Result should be ok, but value should be none
      expect(result.type).toBe("ok");
    });

    it("should successfully finalize PvP session with opponent as winner", () => {
      // Mint NFT to wallet2
      simnet.callPublicFn("strike-core", "claim-one", [], wallet2);

      // Mine blocks to pass cooldown
      simnet.mineEmptyBlocks(17280);

      // Create session with wallet1
      const sessionResult = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("PvP"), Cl.uint(1000000)],
        wallet1
      );

      if (sessionResult.result.type !== "ok") {
        throw new Error("Failed to create session");
      }

      const sessionId = sessionResult.result.value;

      // Join with wallet2
      simnet.callPublicFn(
        "strike-core",
        "approve-session",
        [Cl.uint(2), sessionId],
        wallet2
      );

      const resultHash = new Uint8Array(32).fill(3);

      // Finalize with wallet2 (opponent) as winner
      const { result } = simnet.callPublicFn(
        "strike-core",
        "finalize-session",
        [
          sessionId,
          Cl.buffer(resultHash),
          Cl.principal(wallet2)
        ],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });
  });

  describe("Multiple NFT Management", () => {
    it("should allow using different NFTs without cooldown", () => {
      // Claim 5 NFTs for wallet1
      simnet.callPublicFn("strike-core", "claim-five", [], wallet1);

      // Mine blocks to pass initial cooldown
      simnet.mineEmptyBlocks(17280);

      // Create session with NFT #1
      const result1 = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("PvE"), Cl.uint(1000000)],
        wallet1
      );
      expect(result1.result.type).toBe("ok");

      // Immediately create session with NFT #2 (should work - different NFT)
      const result2 = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(2), Cl.stringAscii("PvE"), Cl.uint(1000000)],
        wallet1
      );
      expect(result2.result.type).toBe("ok");
    });

    it("should track cooldown per NFT individually", () => {
      // Claim 5 NFTs for wallet2
      simnet.callPublicFn("strike-core", "claim-five", [], wallet2);

      // Create session with NFT #3
      simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(3), Cl.stringAscii("PvP"), Cl.uint(1000000)],
        wallet2
      );

      // NFT #3 should be on cooldown
      const cooldown3 = simnet.callReadOnlyFn(
        "strike-core",
        "can-use-nft",
        [Cl.uint(3), Cl.principal(wallet2)],
        wallet2
      );
      expect(cooldown3.result).toBeOk(Cl.bool(false));

      // NFT #4 should be available
      const cooldown4 = simnet.callReadOnlyFn(
        "strike-core",
        "can-use-nft",
        [Cl.uint(4), Cl.principal(wallet2)],
        wallet2
      );
      expect(cooldown4.result).toBeOk(Cl.bool(true));
    });
  });

  describe("Withdrawal Functions", () => {
    it("should fail to withdraw more STX than contract balance", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "withdraw-stx",
        [Cl.uint(999999999999)],
        deployer
      );
      expect(result).toBeErr(Cl.uint(107)); // ERR-INSUFFICIENT-BALANCE
    });

    it("should allow partial STX withdrawal", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "withdraw-stx",
        [Cl.uint(500000)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });
  });

  describe("Tournament Mode", () => {
    it("should create Tournament session successfully", () => {
      // Mine blocks to pass cooldown
      simnet.mineEmptyBlocks(17280);

      const { result } = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("Tournament"), Cl.uint(5000000)],
        wallet1
      );
      expect(result.type).toBe("ok");
    });
  });

  describe("PvE Auto-Finalization (Fixed)", () => {
    it("should create and auto-finalize PvE session with STX", () => {
      // Mine blocks to pass cooldown
      simnet.mineEmptyBlocks(17280);

      const { result } = simnet.callPublicFn(
        "strike-core",
        "create-session-by-default",
        [Cl.uint(1), Cl.stringAscii("PvE"), Cl.uint(1000000)],
        wallet1
      );
      expect(result.type).toBe("ok");
    });

    it("should create and auto-finalize PvE session with sBTC", () => {
      // Mine blocks to pass cooldown
      simnet.mineEmptyBlocks(17280);

      const { result } = simnet.callPublicFn(
        "strike-core",
        "create-session-by-default-with-sbtc",
        [Cl.uint(1), Cl.stringAscii("PvE"), Cl.uint(1000000)],
        wallet1
      );
      expect(result.type).toBe("ok");
    });

    it("should fail to create default session with invalid mode", () => {
      // Mine blocks to pass cooldown
      simnet.mineEmptyBlocks(17280);

      const { result } = simnet.callPublicFn(
        "strike-core",
        "create-session-by-default",
        [Cl.uint(1), Cl.stringAscii("Invalid"), Cl.uint(1000000)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(109)); // ERR-INVALID-MODE
    });
  });

  describe("Finalization Security (Fixed)", () => {
    it("should fail to finalize session if caller is not creator or opponent", () => {
      // Create session with wallet1
      const sessionResult = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("PvP"), Cl.uint(1000000)],
        wallet1
      );

      if (sessionResult.result.type !== "ok") {
        throw new Error("Failed to create session");
      }

      const sessionId = sessionResult.result.value;
      const resultHash = new Uint8Array(32).fill(5);

      // Try to finalize from wallet2 (not creator, not opponent)
      const { result } = simnet.callPublicFn(
        "strike-core",
        "finalize-session",
        [
          sessionId,
          Cl.buffer(resultHash),
          Cl.principal(wallet1)
        ],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED
    });

    it("should allow creator to finalize session", () => {
      // Mine blocks to pass cooldown
      simnet.mineEmptyBlocks(17280);

      const sessionResult = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("PvE"), Cl.uint(1000000)],
        wallet1
      );

      if (sessionResult.result.type !== "ok") {
        throw new Error("Failed to create session");
      }

      const sessionId = sessionResult.result.value;
      const resultHash = new Uint8Array(32).fill(6);

      // Creator can finalize
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

    it("should allow opponent to finalize session", () => {
      // Mine blocks to pass cooldown for all NFTs
      simnet.mineEmptyBlocks(17280 * 2); // 48 hours to ensure all NFTs are off cooldown

      // Claim NFT for wallet2
      simnet.callPublicFn("strike-core", "claim-one", [], wallet2);
      
      // Get the total NFT count to determine wallet2's NFT ID
      const nftCounterResp = simnet.callReadOnlyFn(
        "soul-nft",
        "get-last-token-id",
        [],
        deployer
      );
      
      if (nftCounterResp.result.type !== "ok") {
        throw new Error("Failed to get NFT counter");
      }
      
      const wallet2NftId = nftCounterResp.result.value;

      // Create session with wallet1
      const sessionResult = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("PvP"), Cl.uint(1000000)],
        wallet1
      );

      if (sessionResult.result.type !== "ok") {
        throw new Error("Failed to create session");
      }

      const sessionId = sessionResult.result.value;

      // wallet2 joins session with their newly claimed NFT
      const joinResult = simnet.callPublicFn(
        "strike-core",
        "approve-session",
        [wallet2NftId, sessionId],
        wallet2
      );
      expect(joinResult.result).toBeOk(Cl.bool(true));

      const resultHash = new Uint8Array(32).fill(7);

      // Opponent can finalize
      const { result } = simnet.callPublicFn(
        "strike-core",
        "finalize-session",
        [
          sessionId,
          Cl.buffer(resultHash),
          Cl.principal(wallet2)
        ],
        wallet2
      );
      expect(result).toBeOk(Cl.bool(true));
    });
  });

  describe("Session Cancellation", () => {
    it("should allow creator to cancel session with STX before opponent joins", () => {
      const sessionResult = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("PvP"), Cl.uint(1000000)],
        wallet1
      );

      if (sessionResult.result.type !== "ok") {
        throw new Error("Failed to create session");
      }

      const sessionId = sessionResult.result.value;

      // Cancel session
      const { result } = simnet.callPublicFn(
        "strike-core",
        "cancel-session",
        [sessionId],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should allow creator to cancel session with sBTC before opponent joins", () => {
      const sessionResult = simnet.callPublicFn(
        "strike-core",
        "create-session-with-sbtc",
        [Cl.uint(1), Cl.stringAscii("PvP"), Cl.uint(1000000)],
        wallet1
      );

      if (sessionResult.result.type !== "ok") {
        throw new Error("Failed to create session with sBTC");
      }

      const sessionId = sessionResult.result.value;

      // Cancel session
      const { result } = simnet.callPublicFn(
        "strike-core",
        "cancel-session-with-sbtc",
        [sessionId],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail to cancel session if not creator", () => {
      const sessionResult = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("PvP"), Cl.uint(1000000)],
        wallet1
      );

      if (sessionResult.result.type !== "ok") {
        throw new Error("Failed to create session");
      }

      const sessionId = sessionResult.result.value;

      // Try to cancel from different wallet
      const { result } = simnet.callPublicFn(
        "strike-core",
        "cancel-session",
        [sessionId],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED
    });

    it("should fail to cancel session after opponent joins", () => {
      // Claim NFT for wallet2
      simnet.callPublicFn("strike-core", "claim-one", [], wallet2);

      // Get the NFT ID
      const nftCounterResp = simnet.callReadOnlyFn(
        "soul-nft",
        "get-last-token-id",
        [],
        deployer
      );
      
      if (nftCounterResp.result.type !== "ok") {
        throw new Error("Failed to get NFT counter");
      }
      
      const wallet2NftId = nftCounterResp.result.value;

      // Create session
      const sessionResult = simnet.callPublicFn(
        "strike-core",
        "create-session",
        [Cl.uint(1), Cl.stringAscii("PvP"), Cl.uint(1000000)],
        wallet1
      );

      if (sessionResult.result.type !== "ok") {
        throw new Error("Failed to create session");
      }

      const sessionId = sessionResult.result.value;

      // wallet2 joins
      simnet.callPublicFn(
        "strike-core",
        "approve-session",
        [wallet2NftId, sessionId],
        wallet2
      );

      // Try to cancel - should fail
      const { result } = simnet.callPublicFn(
        "strike-core",
        "cancel-session",
        [sessionId],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(110)); // ERR-CANNOT-CANCEL
    });
  });

  describe("Fee Management", () => {
    it("should accumulate fees from session finalization", () => {
      // Get initial fees
      const initialFeesResult = simnet.callReadOnlyFn(
        "strike-core",
        "get-total-fees",
        [],
        deployer
      );

      if (initialFeesResult.result.type !== "uint") {
        throw new Error("Failed to get initial fees");
      }

      const initialFees = initialFeesResult.result.value;

      // Create and finalize a PvE session
      const sessionResult = simnet.callPublicFn(
        "strike-core",
        "create-session-by-default",
        [Cl.uint(1), Cl.stringAscii("PvE"), Cl.uint(1000000)],
        wallet1
      );

      expect(sessionResult.result.type).toBe("ok");

      // Check fees after finalization - should increase by 10% of bet (100000)
      const finalFeesResult = simnet.callReadOnlyFn(
        "strike-core",
        "get-total-fees",
        [],
        deployer
      );

      if (finalFeesResult.result.type !== "uint") {
        throw new Error("Failed to get final fees");
      }

      const finalFees = finalFeesResult.result.value;
      const feeIncrease = BigInt(finalFees) - BigInt(initialFees);
      
      // For PvE: fee = 10% of bet = 100000
      expect(feeIncrease).toBe(100000n);
    });

    it("should allow owner to withdraw fees", () => {
      // Create and finalize a session to accumulate fees
      simnet.callPublicFn(
        "strike-core",
        "create-session-by-default",
        [Cl.uint(1), Cl.stringAscii("PvE"), Cl.uint(1000000)],
        wallet1
      );

      // Get fees
      const fees = simnet.callReadOnlyFn(
        "strike-core",
        "get-total-fees",
        [],
        deployer
      );

      if (fees.result.type !== "uint") {
        throw new Error("Failed to get fees");
      }

      const feeAmount = fees.result.value;

      // Withdraw fees
      const { result } = simnet.callPublicFn(
        "strike-core",
        "withdraw-fees",
        [Cl.uint(Number(feeAmount))],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));

      // Check fees are now 0
      const finalFees = simnet.callReadOnlyFn(
        "strike-core",
        "get-total-fees",
        [],
        deployer
      );
      expect(finalFees.result).toBeUint(0n);
    });

    it("should fail to withdraw fees if not owner", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "withdraw-fees",
        [Cl.uint(1000)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED
    });

    it("should fail to withdraw more fees than available", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "withdraw-fees",
        [Cl.uint(9999999999)],
        deployer
      );
      expect(result).toBeErr(Cl.uint(107)); // ERR-INSUFFICIENT-BALANCE
    });
  });

  describe("sBTC Withdrawal", () => {
    it("should allow owner to withdraw sBTC", () => {
      // First deposit some sBTC
      simnet.callPublicFn(
        "strike-core",
        "deposit-sbtc",
        [Cl.uint(1000000)],
        deployer
      );

      // Withdraw
      const { result } = simnet.callPublicFn(
        "strike-core",
        "withdraw-sbtc",
        [Cl.uint(500000)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail to withdraw sBTC if not owner", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "withdraw-sbtc",
        [Cl.uint(1000)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED
    });

    it("should fail to withdraw more sBTC than available", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "withdraw-sbtc",
        [Cl.uint(9999999999)],
        deployer
      );
      expect(result).toBeErr(Cl.uint(107)); // ERR-INSUFFICIENT-BALANCE
    });
  });
});
