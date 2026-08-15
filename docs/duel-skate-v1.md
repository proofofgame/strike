# Strike Duel + S-KATE Skate V1

Status: RC1 integrated into this Clarinet project. Nothing in this document is a live deployment.

These contracts keep the proven `strike-core-v1` product rhythm for wallet labels while removing its Soul gate, bets, on-chain opponent join, escrow, and combat finalization. They are independent of `strike-core-v1` raid/session contracts.

## Product flow

1. Player 1 signs `create-duel` and pays the Stacks network fee.
2. Player 2 opens the invite and plays entirely off-chain. Player 2 has no required blockchain transaction.
3. A backend completion voucher is signed only after a meaningful completed battle.
4. Player 1 signs `claim-skate` and receives one damaged S-KATE Skate for the current season.
5. The NFT owner may later sign `repair-skate`, paying the configured repair price and changing durability from `0/1` to `1/1` on-chain.

Combat remains server-authoritative and off-chain. These contracts do not implement Passkey, sponsor, or relayer architecture.

## Wallet signing labels

Leather/Xverse display the public Clarity function name in the signing window:

- `create-duel`
- `claim-skate`
- `repair-skate`

`print` values are emitted after execution for indexers; they cannot change the pre-signing function label.

## Contracts

### `strike-duel-core-v1`

- stores an opaque 32-byte Duel commitment and its creator (`tx-sender`);
- rejects empty, short, and all-zero Duel commitments;
- takes the active season and ruleset from owner-controlled contract state, not user arguments;
- never stores the raw invite secret or the public 6-character off-chain invite ID;
- accepts a backend-signed completion voucher only for the recorded creator;
- allows one Skate claim per Duel and one Skate per wallet per season;
- prevents replay, expired vouchers, cancelled Duel claims, and Player 2 claims;
- records created-Duel and successful-Skate-claim counters;
- validates that the configured reward signer is a non-zero 33-byte compressed-key buffer;
- uses two-step admin rotation (`propose-ownership` → `accept-ownership`).

`duel-count` is an entry count, not proof that every Duel was played. `skate-claim-count` is stronger on-chain evidence because the backend signs only validated battle completions.

### `skate-gear-v1`

- implements the canonical mainnet SIP-009 trait;
- starts with a maximum supply of 500 token IDs;
- mints only when called by the configured Duel controller;
- mints every Skate with durability `0`;
- supports transferable ownership without restoring claim eligibility;
- repairs only tokens owned by `tx-sender`;
- starts with a repair price of `10,000 microSTX` (`0.01 STX`);
- sends repair payments to the configured treasury;
- records durability, repair height, repair count, and total repair fees;
- returns concrete numbered SIP-009 metadata URIs such as `1.json` and `500.json`;
- uses two-step admin rotation (`propose-ownership` → `accept-ownership`).

The owner can change supply, metadata URI, repair price, treasury, and minter under explicit controls. Minter, supply, and metadata each have separate freeze operations. A freeze is irreversible.

## NFT image and IPFS layout

Five hundred NFTs do **not** require 500 image files.

Recommended layout:

```text
image directory
└── skate.webp                  one final square NFT image

metadata directory
├── 1.json
├── 2.json
├── ...
└── 500.json                   small SIP-016 JSON files
```

Every JSON file points to the same immutable `skate.webp` CID. The JSON name contains its token number. The contract itself converts the on-chain token ID to ASCII and returns a concrete URI such as `ipfs://<CID>/1.json`; clients do not need to substitute a placeholder.

Workflow:

1. Upload the final `skate.webp` to IPFS and pin it redundantly.
2. Replace `REPLACE_WITH_IMAGE_CID` in `metadata/metadata-template.json`.
3. Run `npm run metadata:generate` to create `1.json` through `500.json`.
4. Upload the generated metadata directory to IPFS and pin it redundantly.
5. Call `set-metadata-base-uri` with `ipfs://<METADATA_DIRECTORY_CID>/`.
6. Test multiple token IDs through Hiro/Leather/Gamma-compatible indexers.
7. Call `freeze-metadata` only after validation.

Preserve the original WebP, all JSON, and an IPFS CAR/export locally. Use at least two independent pins for the same CIDs.

Static metadata describes the Gear item. The authoritative damaged/repaired value is the on-chain `get-durability` response. No mutable HTTP metadata service is required for V1.

## Completion voucher

The claim path avoids a third on-chain backend transaction.

After a completed battle is validated, the backend:

1. calls `get-claim-hash(duel-id, creator, season, expires-at)`;
2. receives a domain-separated 32-byte hash bound to action, chain ID, contract principal, creator, Duel, season, and expiry;
3. signs that exact digest with ECDSA secp256k1;
4. returns the 64-byte compact low-S signature and expiry to Player 1.

Important signing setting: sign the returned digest directly (`prehash: false`). Do not SHA-256 it again.

The private reward signer must never be stored in frontend code or this repository. Use a dedicated backend secret/KMS. The on-chain owner can rotate its public key.

The backend should issue a voucher only when product completion rules pass, including a real opponent join, sufficient meaningful rounds, final battle status, correct creator/wallet binding, and no cancellation/expiry.

## Deployment order

Testnet first. Mainnet contract names are expected to be:

```text
<DEPLOYER>.skate-gear-v1
<DEPLOYER>.strike-duel-core-v1
```

Both contracts must be deployed from the same intended Strike admin address.

Both contracts support safe two-step ownership rotation. The current owner proposes a new principal and that exact principal must accept. For mainnet, the initial and intended long-term owner should still be the approved admin/multisig, not a disposable development wallet.

1. Deploy `skate-gear-v1`.
2. Deploy `strike-duel-core-v1`.
3. On Gear, call `set-minter(<DEPLOYER>.strike-duel-core-v1)`.
4. Verify a test mint through the complete claim path, then call `freeze-minter`.
5. Set and verify the final IPFS metadata directory URI.
6. Set the production reward-signer compressed public key.
7. Set the repair treasury and confirm the `0.01 STX` starting price.
8. Decide whether the announced edition is permanently 500. Call `freeze-supply` only if the answer is final.
9. Freeze metadata only after wallets/indexers render it correctly.
10. Enable `create-duel`, then enable `claim-skate`.

If ownership must be rotated, call `propose-ownership(new-owner)` and verify the pending principal on-chain before `new-owner` calls `accept-ownership`. Never transfer both contracts without recording the intended final owners and treasury separately.

Never deploy with placeholder metadata, an all-zero reward signer, or a wallet principal accidentally configured as the minter.

This repository does not include a live testnet or mainnet deployment of these two contracts yet.

## Frontend transaction requirements

### `create-duel`

Arguments: one `(buff 32)` server-issued Duel commitment.

- Player 1 origin-signs and pays the estimated network fee.
- Use post-condition mode `deny`.
- No wager, Soul NFT, Player 2 address, or raw invite secret.

### `claim-skate`

Arguments: Duel commitment, voucher expiry block, compact 64-byte signature.

- Player 1 origin-signs and pays the estimated network fee.
- The NFT is minted directly to the recorded creator.
- Disable the button after a successful/pending claim and read on-chain eligibility before retrying.

### `repair-skate`

Arguments: Skate token ID.

- Current owner origin-signs.
- Add an exact STX post-condition for the current `get-repair-price()` amount to `get-repair-treasury()`.
- Use post-condition mode `deny`.
- Refresh `get-durability()` after confirmation.

The contracts are compatible with sponsored transactions but do not require them. V1 policy is self-paid Player 1 transactions.

## Decisions still required before testnet

- final deployer/admin or multisig principal and ownership-rotation procedure;
- production reward-signer public key and key custody;
- final image CID and metadata-directory CID;
- whether supply stays adjustable or is permanently frozen at 500;
- whether one Skate is per season (current implementation) or lifetime;
- final repair treasury and whether `0.01 STX` is the accepted initial economic sink;
- independent security review of the voucher serialization and deployment sequence.
