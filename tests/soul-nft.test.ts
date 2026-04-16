import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

describe("Soul NFT Contract", () => {
  beforeEach(() => {
    // Enable base functionality gate, register strike-core as mint address and enable sale
    simnet.callPublicFn("strike-core", "flip-gate", [], deployer);
    simnet.callPublicFn("soul-nft", "set-mint-address", [], deployer);
    simnet.callPublicFn("strike-core", "flip-sale", [], deployer);
  });

  describe("Minting", () => {
    it("should mint NFT to new owner", () => {
      const { result } = simnet.callPublicFn(
        "strike-core",
        "claim-one",
        [],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should increment last token ID after mint", () => {
      simnet.callPublicFn("strike-core", "claim-one", [], wallet1);
      
      const { result } = simnet.callReadOnlyFn(
        "soul-nft",
        "get-last-token-id",
        [],
        wallet1
      );
      expect(result).toBeOk(Cl.uint(1));
    });

    it("should update balance after mint", () => {
      simnet.callPublicFn("strike-core", "claim-one", [], wallet1);
      
      const { result } = simnet.callReadOnlyFn(
        "soul-nft",
        "get-balance",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(result).toBeUint(1);
    });

    it("should fail if not called from mint address", () => {
      const { result } = simnet.callPublicFn(
        "soul-nft",
        "mint",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(202)); // ERR-NOT-AUTHORIZED
    });

    it("should fail if mint limit reached", () => {
      // Set low mint limit
      simnet.callPublicFn("soul-nft", "set-mint-limit", [Cl.uint(1)], deployer);
      
      // Mint first NFT
      simnet.callPublicFn("strike-core", "claim-one", [], wallet1);
      
      // Try to mint second NFT
      const { result } = simnet.callPublicFn(
        "strike-core",
        "claim-one",
        [],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(200)); // ERR-SOLD-OUT
    });
  });

  describe("Transfer", () => {
    beforeEach(() => {
      simnet.callPublicFn("strike-core", "claim-one", [], wallet1);
    });

    it("should transfer NFT to recipient", () => {
      const { result } = simnet.callPublicFn(
        "soul-nft",
        "transfer",
        [Cl.uint(1), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should update balances after transfer", () => {
      simnet.callPublicFn(
        "soul-nft",
        "transfer",
        [Cl.uint(1), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet1
      );
      
      const balance1 = simnet.callReadOnlyFn(
        "soul-nft",
        "get-balance",
        [Cl.principal(wallet1)],
        wallet1
      );
      const balance2 = simnet.callReadOnlyFn(
        "soul-nft",
        "get-balance",
        [Cl.principal(wallet2)],
        wallet2
      );
      
      expect(balance1.result).toBeUint(0);
      expect(balance2.result).toBeUint(1);
    });

    it("should fail if not sender", () => {
      const { result } = simnet.callPublicFn(
        "soul-nft",
        "transfer",
        [Cl.uint(1), Cl.principal(wallet1), Cl.principal(wallet2)],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(202)); // ERR-NOT-AUTHORIZED
    });
  });

  describe("Marketplace", () => {
    beforeEach(() => {
      simnet.callPublicFn("strike-core", "claim-one", [], wallet1);
    });

    it("should list NFT for sale", () => {
      const { result } = simnet.callPublicFn(
        "soul-nft",
        "list-in-ustx",
        [
          Cl.uint(1),
          Cl.uint(1000000),
          Cl.principal("SP2ESPYE74G94D2HD9X470426W1R6C2P22B4Z1Q5.commission-trait")
        ],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should unlist NFT", () => {
      simnet.callPublicFn(
        "soul-nft",
        "list-in-ustx",
        [
          Cl.uint(1),
          Cl.uint(1000000),
          Cl.principal("SP2ESPYE74G94D2HD9X470426W1R6C2P22B4Z1Q5.commission-trait")
        ],
        wallet1
      );

      const { result } = simnet.callPublicFn(
        "soul-nft",
        "unlist-in-ustx",
        [Cl.uint(1)],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should get listing info", () => {
      simnet.callPublicFn(
        "soul-nft",
        "list-in-ustx",
        [
          Cl.uint(1),
          Cl.uint(1000000),
          Cl.principal("SP2ESPYE74G94D2HD9X470426W1R6C2P22B4Z1Q5.commission-trait")
        ],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        "soul-nft",
        "get-listing-in-ustx",
        [Cl.uint(1)],
        wallet1
      );
      expect(result).toBeSome(
        Cl.tuple({
          price: Cl.uint(1000000),
          commission: Cl.principal("SP2ESPYE74G94D2HD9X470426W1R6C2P22B4Z1Q5.commission-trait")
        })
      );
    });
  });

  describe("Metadata Management", () => {
    it("should set base URI", () => {
      const { result } = simnet.callPublicFn(
        "soul-nft",
        "set-base-uri",
        [Cl.stringAscii("ipfs://newCID/")],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should freeze metadata", () => {
      const { result } = simnet.callPublicFn(
        "soul-nft",
        "freeze-metadata",
        [],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail to set base URI after freeze", () => {
      simnet.callPublicFn("soul-nft", "freeze-metadata", [], deployer);
      
      const { result } = simnet.callPublicFn(
        "soul-nft",
        "set-base-uri",
        [Cl.stringAscii("ipfs://newCID/")],
        deployer
      );
      expect(result).toBeErr(Cl.uint(204)); // ERR-METADATA-FROZEN
    });
  });

  describe("Equipment Management", () => {
    it("should set equipment for NFT", () => {
      // Mint NFT first
      simnet.callPublicFn("strike-core", "claim-one", [], wallet1);

      const { result } = simnet.callPublicFn(
        "soul-nft",
        "set-equipment",
        [
          Cl.uint(1),
          Cl.some(Cl.uint(10)),
          Cl.some(Cl.uint(20)),
          Cl.none(),
          Cl.none(),
          Cl.none()
        ],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail to set equipment for non-owned NFT", () => {
      simnet.callPublicFn("strike-core", "claim-one", [], wallet1);

      const { result } = simnet.callPublicFn(
        "soul-nft",
        "set-equipment",
        [
          Cl.uint(1),
          Cl.some(Cl.uint(10)),
          Cl.none(),
          Cl.none(),
          Cl.none(),
          Cl.none()
        ],
        wallet2
      );
      expect(result).toBeErr(Cl.uint(202)); // ERR-NOT-AUTHORIZED
    });

    it("should equip item to specific slot", () => {
      simnet.callPublicFn("strike-core", "claim-one", [], wallet1);

      const { result } = simnet.callPublicFn(
        "soul-nft",
        "equip-slot",
        [Cl.uint(1), Cl.uint(1), Cl.some(Cl.uint(100))],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail to equip invalid slot", () => {
      simnet.callPublicFn("strike-core", "claim-one", [], wallet1);

      const { result } = simnet.callPublicFn(
        "soul-nft",
        "equip-slot",
        [Cl.uint(1), Cl.uint(10), Cl.some(Cl.uint(100))],
        wallet1
      );
      expect(result).toBeErr(Cl.uint(207)); // ERR-INVALID-SLOT
    });

    it("should update last-used timestamp", () => {
      simnet.callPublicFn("strike-core", "claim-one", [], wallet1);

      const { result } = simnet.callPublicFn(
        "soul-nft",
        "update-last-used",
        [Cl.uint(1)],
        wallet1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should get equipment data", () => {
      simnet.callPublicFn("strike-core", "claim-one", [], wallet1);
      simnet.callPublicFn(
        "soul-nft",
        "set-equipment",
        [
          Cl.uint(1),
          Cl.some(Cl.uint(10)),
          Cl.some(Cl.uint(20)),
          Cl.none(),
          Cl.none(),
          Cl.none()
        ],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        "soul-nft",
        "get-equipment",
        [Cl.uint(1)],
        wallet1
      );
      expect(result.type).toBe("ok");
    });

    it("should get specific slot data", () => {
      simnet.callPublicFn("strike-core", "claim-one", [], wallet1);
      simnet.callPublicFn(
        "soul-nft",
        "equip-slot",
        [Cl.uint(1), Cl.uint(1), Cl.some(Cl.uint(100))],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        "soul-nft",
        "get-slot",
        [Cl.uint(1), Cl.uint(1)],
        wallet1
      );
      expect(result).toBeOk(Cl.some(Cl.uint(100)));
    });

    it("should get last-used timestamp", () => {
      simnet.callPublicFn("strike-core", "claim-one", [], wallet1);
      simnet.callPublicFn(
        "soul-nft",
        "update-last-used",
        [Cl.uint(1)],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        "soul-nft",
        "get-last-used",
        [Cl.uint(1)],
        wallet1
      );
      expect(result.type).toBe("ok");
    });

    it("should return none for never used NFT", () => {
      simnet.callPublicFn("strike-core", "claim-one", [], wallet1);

      const { result } = simnet.callReadOnlyFn(
        "soul-nft",
        "get-last-used",
        [Cl.uint(1)],
        wallet1
      );
      expect(result).toBeOk(Cl.none());
    });
  });
});
