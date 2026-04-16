import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

describe("Raid Pass Contract", () => {
  beforeEach(() => {
    // Enable base functionality gate and raid participation
    simnet.callPublicFn("strike-core", "flip-gate", [], deployer);
    simnet.callPublicFn("strike-core", "flip-raid", [], deployer);
  });

  describe("Minting", () => {
    it("should mint raid-pass after entering", () => {
      simnet.callPublicFn("strike-core", "enter", [], wallet1);

      const { result } = simnet.callPublicFn(
        "strike-core",
        "claim-raid-pass",
        [],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should increment last token ID after mint", () => {
      simnet.callPublicFn("strike-core", "enter", [], wallet1);
      simnet.callPublicFn("strike-core", "claim-raid-pass", [], wallet1);

      const { result } = simnet.callReadOnlyFn(
        "raid-pass",
        "get-last-token-id",
        [],
        wallet1
      );
      expect(result).toBeOk(Cl.uint(1));
    });

    it("should update balance after mint", () => {
      simnet.callPublicFn("strike-core", "enter", [], wallet1);
      simnet.callPublicFn("strike-core", "claim-raid-pass", [], wallet1);

      const { result } = simnet.callReadOnlyFn(
        "raid-pass",
        "get-balance",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(result).toBeUint(1);
    });

    it("should set correct owner after mint", () => {
      simnet.callPublicFn("strike-core", "enter", [], wallet1);
      simnet.callPublicFn("strike-core", "claim-raid-pass", [], wallet1);

      const { result } = simnet.callReadOnlyFn(
        "raid-pass",
        "get-owner",
        [Cl.uint(1)],
        wallet1
      );
      expect(result).toBeOk(Cl.some(Cl.principal(wallet1)));
    });

    it("should fail if not called from mint address", () => {
      const { result } = simnet.callPublicFn(
        "raid-pass",
        "mint",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(302)); // ERR-NOT-AUTHORIZED
    });

    it("should fail without entering first", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "claim-raid-pass",
        [],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(112)); // ERR-NOT-IN-RAID
    });

    it("should fail to mint second raid-pass (1 per principal)", () => {
      simnet.callPublicFn("strike-core", "enter", [], wallet1);
      simnet.callPublicFn("strike-core", "claim-raid-pass", [], wallet1);

      // Enter again and try to claim second
      simnet.callPublicFn("strike-core", "enter", [], wallet1);
      const { result } = simnet.callPublicFn(
        "strike-core",
        "claim-raid-pass",
        [],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(307)); // ERR-ALREADY-MINTED
    });

    it("should allow different users to mint", () => {
      simnet.callPublicFn("strike-core", "enter", [], wallet1);
      simnet.callPublicFn("strike-core", "claim-raid-pass", [], wallet1);

      simnet.callPublicFn("strike-core", "enter", [], wallet2);
      const { result } = simnet.callPublicFn(
        "strike-core",
        "claim-raid-pass",
        [],
        wallet2
      );
      expect(result).toBeOk(Cl.bool(true));

      const lastId = simnet.callReadOnlyFn(
        "raid-pass",
        "get-last-token-id",
        [],
        deployer
      );
      expect(lastId.result).toBeOk(Cl.uint(2));
    });

    it("should fail if mint limit reached", () => {
      // Set low mint limit
      simnet.callPublicFn("raid-pass", "set-mint-limit", [Cl.uint(1)], deployer);

      simnet.callPublicFn("strike-core", "enter", [], wallet1);
      simnet.callPublicFn("strike-core", "claim-raid-pass", [], wallet1);

      // Second user tries
      simnet.callPublicFn("strike-core", "enter", [], wallet2);
      const { result } = simnet.callPublicFn(
        "strike-core",
        "claim-raid-pass",
        [],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(300)); // ERR-SOLD-OUT
    });
  });

  describe("Transfer", () => {
    beforeEach(() => {
      simnet.callPublicFn("strike-core", "enter", [], wallet1);
      simnet.callPublicFn("strike-core", "claim-raid-pass", [], wallet1);
    });

    it("should transfer raid-pass to recipient", () => {
      const { result } = simnet.callPublicFn(
        "raid-pass",
        "transfer",
        [Cl.uint(1), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should update balances after transfer", () => {
      simnet.callPublicFn(
        "raid-pass",
        "transfer",
        [Cl.uint(1), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet1
      );

      const balance1 = simnet.callReadOnlyFn(
        "raid-pass",
        "get-balance",
        [Cl.principal(wallet1)],
        wallet1
      );
      const balance2 = simnet.callReadOnlyFn(
        "raid-pass",
        "get-balance",
        [Cl.principal(wallet2)],
        wallet2
      );

      expect(balance1.result).toBeUint(0);
      expect(balance2.result).toBeUint(1);
    });

    it("should update owner after transfer", () => {
      simnet.callPublicFn(
        "raid-pass",
        "transfer",
        [Cl.uint(1), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        "raid-pass",
        "get-owner",
        [Cl.uint(1)],
        wallet2
      );
      expect(result).toBeOk(Cl.some(Cl.principal(wallet2)));
    });

    it("should fail if not sender", () => {
      const { result } = simnet.callPublicFn(
        "raid-pass",
        "transfer",
        [Cl.uint(1), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(302)); // ERR-NOT-AUTHORIZED
    });

    it("should fail to transfer listed NFT", () => {
      simnet.callPublicFn(
        "raid-pass",
        "list-in-ustx",
        [
          Cl.uint(1),
          Cl.uint(1000000),
          Cl.principal("SP2ESPYE74G94D2HD9X470426W1R6C2P22B4Z1Q5.commission-trait"),
        ],
        wallet1
      );

      const { result } = simnet.callPublicFn(
        "raid-pass",
        "transfer",
        [Cl.uint(1), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(306)); // ERR-LISTING
    });
  });

  describe("Marketplace", () => {
    beforeEach(() => {
      simnet.callPublicFn("strike-core", "enter", [], wallet1);
      simnet.callPublicFn("strike-core", "claim-raid-pass", [], wallet1);
    });

    it("should list raid-pass for sale", () => {
      const { result } = simnet.callPublicFn(
        "raid-pass",
        "list-in-ustx",
        [
          Cl.uint(1),
          Cl.uint(1000000),
          Cl.principal("SP2ESPYE74G94D2HD9X470426W1R6C2P22B4Z1Q5.commission-trait"),
        ],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should unlist raid-pass", () => {
      simnet.callPublicFn(
        "raid-pass",
        "list-in-ustx",
        [
          Cl.uint(1),
          Cl.uint(1000000),
          Cl.principal("SP2ESPYE74G94D2HD9X470426W1R6C2P22B4Z1Q5.commission-trait"),
        ],
        wallet1
      );

      const { result } = simnet.callPublicFn(
        "raid-pass",
        "unlist-in-ustx",
        [Cl.uint(1)],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should get listing info", () => {
      simnet.callPublicFn(
        "raid-pass",
        "list-in-ustx",
        [
          Cl.uint(1),
          Cl.uint(1000000),
          Cl.principal("SP2ESPYE74G94D2HD9X470426W1R6C2P22B4Z1Q5.commission-trait"),
        ],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        "raid-pass",
        "get-listing-in-ustx",
        [Cl.uint(1)],
        wallet1
      );
      expect(result).toBeSome(
        Cl.tuple({
          price: Cl.uint(1000000),
          commission: Cl.principal(
            "SP2ESPYE74G94D2HD9X470426W1R6C2P22B4Z1Q5.commission-trait"
          ),
        })
      );
    });

    it("should fail to list if not owner", () => {
      const { result } = simnet.callPublicFn(
        "raid-pass",
        "list-in-ustx",
        [
          Cl.uint(1),
          Cl.uint(1000000),
          Cl.principal("SP2ESPYE74G94D2HD9X470426W1R6C2P22B4Z1Q5.commission-trait"),
        ],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(302)); // ERR-NOT-AUTHORIZED
    });

    it("should fail to unlist if not owner", () => {
      simnet.callPublicFn(
        "raid-pass",
        "list-in-ustx",
        [
          Cl.uint(1),
          Cl.uint(1000000),
          Cl.principal("SP2ESPYE74G94D2HD9X470426W1R6C2P22B4Z1Q5.commission-trait"),
        ],
        wallet1
      );

      const { result } = simnet.callPublicFn(
        "raid-pass",
        "unlist-in-ustx",
        [Cl.uint(1)],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(302)); // ERR-NOT-AUTHORIZED
    });

    it("should return none for unlisted NFT", () => {
      const { result } = simnet.callReadOnlyFn(
        "raid-pass",
        "get-listing-in-ustx",
        [Cl.uint(1)],
        wallet1
      );
      expect(result).toBeNone();
    });
  });

  describe("Metadata Management", () => {
    it("should get token URI", () => {
      simnet.callPublicFn("strike-core", "enter", [], wallet1);
      simnet.callPublicFn("strike-core", "claim-raid-pass", [], wallet1);

      const { result } = simnet.callReadOnlyFn(
        "raid-pass",
        "get-token-uri",
        [Cl.uint(1)],
        wallet1
      );
      expect(result).toBeOk(
        Cl.some(Cl.stringAscii("ipfs://CID/{id}.json"))
      );
    });

    it("should set base URI", () => {
      const { result } = simnet.callPublicFn(
        "raid-pass",
        "set-base-uri",
        [Cl.stringAscii("ipfs://newCID/")],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail to set base URI if not owner", () => {
      const { result } = simnet.callPublicFn(
        "raid-pass",
        "set-base-uri",
        [Cl.stringAscii("ipfs://newCID/")],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(302)); // ERR-NOT-AUTHORIZED
    });

    it("should freeze metadata", () => {
      const { result } = simnet.callPublicFn(
        "raid-pass",
        "freeze-metadata",
        [],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail to set base URI after freeze", () => {
      simnet.callPublicFn("raid-pass", "freeze-metadata", [], deployer);

      const { result } = simnet.callPublicFn(
        "raid-pass",
        "set-base-uri",
        [Cl.stringAscii("ipfs://newCID/")],
        deployer
      );
      expect(result).toBeErr(Cl.uint(304)); // ERR-METADATA-FROZEN
    });

    it("should fail to freeze metadata if not owner", () => {
      const { result } = simnet.callPublicFn(
        "raid-pass",
        "freeze-metadata",
        [],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(302)); // ERR-NOT-AUTHORIZED
    });
  });

  describe("Read-Only Functions", () => {
    it("should return mint limit", () => {
      const { result } = simnet.callReadOnlyFn(
        "raid-pass",
        "get-mint-limit",
        [],
        deployer
      );
      expect(result).toBeOk(Cl.uint(500));
    });

    it("should return zero balance for new account", () => {
      const { result } = simnet.callReadOnlyFn(
        "raid-pass",
        "get-balance",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(result).toBeUint(0);
    });

    it("should return last token id as zero initially", () => {
      const { result } = simnet.callReadOnlyFn(
        "raid-pass",
        "get-last-token-id",
        [],
        deployer
      );
      expect(result).toBeOk(Cl.uint(0));
    });
  });

  describe("Mint Address", () => {
    it("should have strike-core as mint address (set at deploy)", () => {
      // strike-core registers itself at deploy time, so direct mint from non-mint fails
      const { result } = simnet.callPublicFn(
        "raid-pass",
        "mint",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(result).toBeErr(Cl.uint(302)); // ERR-NOT-AUTHORIZED
    });

    it("should fail to set mint address again", () => {
      const { result } = simnet.callPublicFn(
        "raid-pass",
        "set-mint-address",
        [],
        deployer
      );
      expect(result).toBeErr(Cl.uint(305)); // ERR-MINT-ALREADY-SET
    });
  });

  describe("Mint Limit", () => {
    it("should allow owner to change mint limit", () => {
      const { result } = simnet.callPublicFn(
        "raid-pass",
        "set-mint-limit",
        [Cl.uint(1000)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));

      const limit = simnet.callReadOnlyFn(
        "raid-pass",
        "get-mint-limit",
        [],
        deployer
      );
      expect(limit.result).toBeOk(Cl.uint(1000));
    });

    it("should fail to change mint limit if not owner", () => {
      const { result } = simnet.callPublicFn(
        "raid-pass",
        "set-mint-limit",
        [Cl.uint(1000)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(302)); // ERR-NOT-AUTHORIZED
    });
  });
});
