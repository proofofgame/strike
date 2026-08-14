import "@stacks/clarinet-sdk/vitest";

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { Cl, ClarityType, type BufferCV } from "@stacks/transactions";
import { beforeEach, describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const player1 = accounts.get("wallet_1")!;
const player2 = accounts.get("wallet_2")!;
const treasury = accounts.get("wallet_3")!;

const rewardPrivateKey = new Uint8Array(32).fill(7);
const rewardPublicKey = secp256k1.getPublicKey(rewardPrivateKey, true);

function duelId(byte: number) {
  return Cl.buffer(new Uint8Array(32).fill(byte));
}

function configureContracts() {
  const corePrincipal = Cl.contractPrincipal(deployer, "strike-duel-core-v1");

  expect(
    simnet.callPublicFn("skate-gear-v1", "set-minter", [corePrincipal], deployer).result,
  ).toBeOk(Cl.bool(true));

  expect(
    simnet.callPublicFn(
      "strike-duel-core-v1",
      "set-reward-signer",
      [Cl.buffer(rewardPublicKey)],
      deployer,
    ).result,
  ).toBeOk(Cl.bool(true));

  expect(
    simnet.callPublicFn(
      "strike-duel-core-v1",
      "set-create-active",
      [Cl.bool(true)],
      deployer,
    ).result,
  ).toBeOk(Cl.bool(true));

  expect(
    simnet.callPublicFn(
      "strike-duel-core-v1",
      "set-claim-active",
      [Cl.bool(true)],
      deployer,
    ).result,
  ).toBeOk(Cl.bool(true));
}

function setSeason(season: number) {
  if (season === 1) return;
  expect(
    simnet.callPublicFn(
      "strike-duel-core-v1",
      "set-current-season",
      [Cl.uint(season)],
      deployer,
    ).result,
  ).toBeOk(Cl.bool(true));
}

function createDuel(id: ReturnType<typeof duelId>, season = 1, sender = player1) {
  setSeason(season);
  return simnet.callPublicFn(
    "strike-duel-core-v1",
    "create-duel",
    [id],
    sender,
  );
}

function voucherSignature(
  id: ReturnType<typeof duelId>,
  creator: string,
  season: number,
  expiresAt: number,
) {
  const { result } = simnet.callReadOnlyFn(
    "strike-duel-core-v1",
    "get-claim-hash",
    [id, Cl.principal(creator), Cl.uint(season), Cl.uint(expiresAt)],
    creator,
  );

  expect(result).toHaveClarityType(ClarityType.Buffer);
  const digest = Uint8Array.from(Buffer.from((result as BufferCV).value, "hex"));

  // Clarity verifies the digest directly. Do not hash it a second time.
  return Cl.buffer(
    secp256k1.sign(digest, rewardPrivateKey, {
      format: "compact",
      prehash: false,
      lowS: true,
    }),
  );
}

describe("Strike Duel + S-KATE Skate RC1", () => {
  // Nested like existing Strike tests so clarinet-sdk 3.16 resets simnet
  // before this hook, not after it.
  beforeEach(() => {
    configureContracts();
  });

describe("Player 1 Duel entry", () => {
  it("creates an on-chain Duel commitment owned by tx-sender", () => {
    const id = duelId(1);
    const call = createDuel(id);

    expect(call.result).toBeOk(id);
    expect(call.events.some((event) => event.event === "print_event")).toBe(true);

    const duel = simnet.callReadOnlyFn(
      "strike-duel-core-v1",
      "get-duel",
      [id],
      player1,
    );
    expect(duel.result).toBeSome(
      Cl.tuple({
        creator: Cl.principal(player1),
        ruleset: Cl.uint(1),
        season: Cl.uint(1),
        "created-at": Cl.uint(simnet.blockHeight),
        cancelled: Cl.bool(false),
      }),
    );
  });

  it("rejects duplicate, zero, empty, and short Duel commitments", () => {
    const id = duelId(2);
    expect(createDuel(id).result).toBeOk(id);
    expect(createDuel(id).result).toBeErr(Cl.uint(103));

    const zero = Cl.buffer(new Uint8Array(32));
    expect(createDuel(zero).result).toBeErr(Cl.uint(110));

    const empty = Cl.buffer(new Uint8Array());
    expect(createDuel(empty).result).toBeErr(Cl.uint(110));

    const short = Cl.buffer(new Uint8Array(31).fill(1));
    expect(createDuel(short).result).toBeErr(Cl.uint(110));
  });
});

describe("Skate claim authorization", () => {
  it("mints one damaged Skate to the Duel creator", () => {
    const id = duelId(3);
    const expiresAt = simnet.blockHeight + 100;
    expect(createDuel(id).result).toBeOk(id);

    const signature = voucherSignature(id, player1, 1, expiresAt);
    const claim = simnet.callPublicFn(
      "strike-duel-core-v1",
      "claim-skate",
      [id, Cl.uint(expiresAt), signature],
      player1,
    );

    expect(claim.result).toBeOk(Cl.uint(1));
    expect(
      simnet.callReadOnlyFn("skate-gear-v1", "get-owner", [Cl.uint(1)], player1).result,
    ).toBeOk(Cl.some(Cl.principal(player1)));
    expect(
      simnet.callReadOnlyFn("skate-gear-v1", "get-durability", [Cl.uint(1)], player1)
        .result,
    ).toBeOk(Cl.uint(0));
  });

  it("does not allow Player 2 to use Player 1's completion voucher", () => {
    const id = duelId(4);
    const expiresAt = simnet.blockHeight + 100;
    expect(createDuel(id).result).toBeOk(id);
    const signature = voucherSignature(id, player1, 1, expiresAt);

    const claim = simnet.callPublicFn(
      "strike-duel-core-v1",
      "claim-skate",
      [id, Cl.uint(expiresAt), signature],
      player2,
    );
    expect(claim.result).toBeErr(Cl.uint(100));
  });

  it("rejects forged, expired, replayed, and second same-season claims", () => {
    const id = duelId(5);
    const expiresAt = simnet.blockHeight + 100;
    expect(createDuel(id).result).toBeOk(id);

    const forged = Cl.buffer(new Uint8Array(64).fill(9));
    expect(
      simnet.callPublicFn(
        "strike-duel-core-v1",
        "claim-skate",
        [id, Cl.uint(expiresAt), forged],
        player1,
      ).result,
    ).toBeErr(Cl.uint(109));

    const signature = voucherSignature(id, player1, 1, expiresAt);
    expect(
      simnet.callPublicFn(
        "strike-duel-core-v1",
        "claim-skate",
        [id, Cl.uint(expiresAt), signature],
        player1,
      ).result,
    ).toBeOk(Cl.uint(1));

    expect(
      simnet.callPublicFn(
        "strike-duel-core-v1",
        "claim-skate",
        [id, Cl.uint(expiresAt), signature],
        player1,
      ).result,
    ).toBeErr(Cl.uint(106));

    const second = duelId(6);
    expect(createDuel(second).result).toBeOk(second);
    const secondSignature = voucherSignature(second, player1, 1, expiresAt);
    expect(
      simnet.callPublicFn(
        "strike-duel-core-v1",
        "claim-skate",
        [second, Cl.uint(expiresAt), secondSignature],
        player1,
      ).result,
    ).toBeErr(Cl.uint(107));

    const expired = duelId(7);
    expect(createDuel(expired, 2).result).toBeOk(expired);
    const oldHeight = 1;
    const expiredSignature = voucherSignature(expired, player1, 2, oldHeight);
    expect(
      simnet.callPublicFn(
        "strike-duel-core-v1",
        "claim-skate",
        [expired, Cl.uint(oldHeight), expiredSignature],
        player1,
      ).result,
    ).toBeErr(Cl.uint(108));
  });

  it("does not restore claim eligibility after the Skate is transferred", () => {
    const first = duelId(8);
    const expiresAt = simnet.blockHeight + 100;
    expect(createDuel(first, 3).result).toBeOk(first);
    const firstSignature = voucherSignature(first, player1, 3, expiresAt);
    expect(
      simnet.callPublicFn(
        "strike-duel-core-v1",
        "claim-skate",
        [first, Cl.uint(expiresAt), firstSignature],
        player1,
      ).result,
    ).toBeOk(Cl.uint(1));

    expect(
      simnet.callPublicFn(
        "skate-gear-v1",
        "transfer",
        [Cl.uint(1), Cl.principal(player1), Cl.principal(player2)],
        player1,
      ).result,
    ).toBeOk(Cl.bool(true));

    const second = duelId(9);
    // The contract, not the player, keeps using the current on-chain season (3).
    expect(createDuel(second).result).toBeOk(second);
    const secondSignature = voucherSignature(second, player1, 3, expiresAt);
    expect(
      simnet.callPublicFn(
        "strike-duel-core-v1",
        "claim-skate",
        [second, Cl.uint(expiresAt), secondSignature],
        player1,
      ).result,
    ).toBeErr(Cl.uint(107));
  });
});

describe("paid on-chain repair", () => {
  it("repairs durability 0/1 to 1/1 once and only for the NFT owner", () => {
    const id = duelId(10);
    const expiresAt = simnet.blockHeight + 100;
    expect(createDuel(id, 4).result).toBeOk(id);
    const signature = voucherSignature(id, player1, 4, expiresAt);
    expect(
      simnet.callPublicFn(
        "strike-duel-core-v1",
        "claim-skate",
        [id, Cl.uint(expiresAt), signature],
        player1,
      ).result,
    ).toBeOk(Cl.uint(1));

    expect(
      simnet.callPublicFn("skate-gear-v1", "repair-skate", [Cl.uint(1)], player2).result,
    ).toBeErr(Cl.uint(300));

    expect(
      simnet.callPublicFn(
        "skate-gear-v1",
        "set-repair-treasury",
        [Cl.principal(treasury)],
        deployer,
      ).result,
    ).toBeOk(Cl.bool(true));

    const repair = simnet.callPublicFn(
      "skate-gear-v1",
      "repair-skate",
      [Cl.uint(1)],
      player1,
    );
    expect(repair.result).toBeOk(Cl.bool(true));
    expect(repair.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "stx_transfer_event",
          data: expect.objectContaining({
            amount: "10000",
            sender: player1,
            recipient: treasury,
          }),
        }),
      ]),
    );

    expect(
      simnet.callReadOnlyFn("skate-gear-v1", "get-durability", [Cl.uint(1)], player1)
        .result,
    ).toBeOk(Cl.uint(1));
    expect(
      simnet.callReadOnlyFn("skate-gear-v1", "get-repair-count", [], player1).result,
    ).toBeUint(1);
    expect(
      simnet.callReadOnlyFn("skate-gear-v1", "get-total-repair-fees", [], player1)
        .result,
    ).toBeUint(10000);
    expect(
      simnet.callPublicFn("skate-gear-v1", "repair-skate", [Cl.uint(1)], player1).result,
    ).toBeErr(Cl.uint(308));
  });
});

describe("SIP-009 metadata", () => {
  it("returns a concrete numbered metadata URI and none for an unknown token", () => {
    const id = duelId(11);
    const expiresAt = simnet.blockHeight + 100;
    expect(createDuel(id, 5).result).toBeOk(id);
    const signature = voucherSignature(id, player1, 5, expiresAt);
    expect(
      simnet.callPublicFn(
        "strike-duel-core-v1",
        "claim-skate",
        [id, Cl.uint(expiresAt), signature],
        player1,
      ).result,
    ).toBeOk(Cl.uint(1));

    expect(
      simnet.callReadOnlyFn("skate-gear-v1", "get-token-uri", [Cl.uint(1)], player1)
        .result,
    ).toBeOk(
      Cl.some(
        Cl.stringAscii("ipfs://REPLACE_WITH_METADATA_DIRECTORY_CID/1.json"),
      ),
    );
    expect(
      simnet.callReadOnlyFn("skate-gear-v1", "get-token-uri", [Cl.uint(2)], player1)
        .result,
    ).toBeOk(Cl.none());
  });
});

describe("owner and supply controls", () => {
  it("rejects malformed reward signer keys without replacing the valid signer", () => {
    expect(
      simnet.callPublicFn(
        "strike-duel-core-v1",
        "set-reward-signer",
        [Cl.buffer(new Uint8Array(32).fill(1))],
        deployer,
      ).result,
    ).toBeErr(Cl.uint(114));
    expect(
      simnet.callPublicFn(
        "strike-duel-core-v1",
        "set-reward-signer",
        [Cl.buffer(new Uint8Array(33))],
        deployer,
      ).result,
    ).toBeErr(Cl.uint(114));
    expect(
      simnet.callReadOnlyFn(
        "strike-duel-core-v1",
        "get-reward-signer",
        [],
        player1,
      ).result,
    ).toBeBuff(rewardPublicKey);
  });

  it("uses a two-step ownership transfer on both contracts", () => {
    expect(
      simnet.callPublicFn(
        "strike-duel-core-v1",
        "propose-ownership",
        [Cl.principal(player2)],
        deployer,
      ).result,
    ).toBeOk(Cl.bool(true));
    expect(
      simnet.callPublicFn(
        "strike-duel-core-v1",
        "accept-ownership",
        [],
        player1,
      ).result,
    ).toBeErr(Cl.uint(100));
    expect(
      simnet.callPublicFn(
        "strike-duel-core-v1",
        "accept-ownership",
        [],
        player2,
      ).result,
    ).toBeOk(Cl.bool(true));
    expect(
      simnet.callReadOnlyFn(
        "strike-duel-core-v1",
        "get-contract-owner",
        [],
        player1,
      ).result,
    ).toBePrincipal(player2);
    expect(
      simnet.callPublicFn(
        "strike-duel-core-v1",
        "set-create-active",
        [Cl.bool(false)],
        deployer,
      ).result,
    ).toBeErr(Cl.uint(100));

    expect(
      simnet.callPublicFn(
        "skate-gear-v1",
        "propose-ownership",
        [Cl.principal(player2)],
        deployer,
      ).result,
    ).toBeOk(Cl.bool(true));
    expect(
      simnet.callPublicFn("skate-gear-v1", "accept-ownership", [], player2).result,
    ).toBeOk(Cl.bool(true));
    expect(
      simnet.callReadOnlyFn("skate-gear-v1", "get-contract-owner", [], player1)
        .result,
    ).toBePrincipal(player2);
    expect(
      simnet.callPublicFn(
        "skate-gear-v1",
        "set-repair-price",
        [Cl.uint(20000)],
        deployer,
      ).result,
    ).toBeErr(Cl.uint(300));
  });

  it("prevents minter hijacking and direct public minting", () => {
    expect(
      simnet.callPublicFn(
        "skate-gear-v1",
        "set-minter",
        [Cl.principal(player2)],
        player2,
      ).result,
    ).toBeErr(Cl.uint(300));

    expect(
      simnet.callPublicFn("skate-gear-v1", "mint", [Cl.principal(player2)], player2)
        .result,
    ).toBeErr(Cl.uint(300));
  });

  it("starts at 500 and permits owner adjustment only until freeze", () => {
    expect(
      simnet.callReadOnlyFn("skate-gear-v1", "get-max-supply", [], player1).result,
    ).toBeUint(500);

    expect(
      simnet.callPublicFn("skate-gear-v1", "set-max-supply", [Cl.uint(750)], deployer)
        .result,
    ).toBeOk(Cl.bool(true));
    expect(
      simnet.callPublicFn("skate-gear-v1", "freeze-supply", [], deployer).result,
    ).toBeOk(Cl.bool(true));
    expect(
      simnet.callPublicFn("skate-gear-v1", "set-max-supply", [Cl.uint(1000)], deployer)
        .result,
    ).toBeErr(Cl.uint(305));
  });
});
});
