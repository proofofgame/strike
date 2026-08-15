# Strike Duel → Skate RC1 canary admin checklist

Status: **preparation only**. Do not broadcast, freeze, or enable create/claim until
every gate below is checked. No private keys belong in this file.

## Principals

| Role | Value |
| --- | --- |
| Deployer / initial owner | `SP3T54N6G4HN7GPBCYMSDKP4W00C45X19GQ4VT13Y` |
| Skate contract | `SP3T54N6G4HN7GPBCYMSDKP4W00C45X19GQ4VT13Y.skate-gear-v1` |
| Duel contract | `SP3T54N6G4HN7GPBCYMSDKP4W00C45X19GQ4VT13Y.strike-duel-core-v1` |
| `set-minter` argument | `'SP3T54N6G4HN7GPBCYMSDKP4W00C45X19GQ4VT13Y.strike-duel-core-v1` |

`set-minter` must be the **Duel contract principal**, never a wallet.

## Final metadata base URI

Pinned metadata directory CID from Anton:

`ipfs://bafybeidatjszvnpakzn5gntvxqoqjxac3o6zazj2vxnapa3rk44joolapq/`

Verified live:

- `…/1.json` → `S-KATE Skate #1`
- `…/500.json` → `S-KATE Skate #500`

On-chain token URIs will be that base plus `{id}.json`. Do not invent another CID.

## Post-deploy admin (after both publishes confirm)

Required order. Replace only the reward-signer placeholder.

```clarity
;; 1. Deploy skate-gear-v1, then strike-duel-core-v1 (see duel-skate-rc1.mainnet-plan.yaml).

;; 2. Minter = Duel CONTRACT principal
(contract-call? 'SP3T54N6G4HN7GPBCYMSDKP4W00C45X19GQ4VT13Y.skate-gear-v1 set-minter 'SP3T54N6G4HN7GPBCYMSDKP4W00C45X19GQ4VT13Y.strike-duel-core-v1)

;; 3. Dedicated unfunded compressed secp256k1 public key
(contract-call? 'SP3T54N6G4HN7GPBCYMSDKP4W00C45X19GQ4VT13Y.strike-duel-core-v1 set-reward-signer 0xREPLACE_33_BYTE_COMPRESSED_PUBKEY)

;; 4. Repair treasury only if fees must not land on the deployer (default is deployer)
;; (contract-call? 'SP3T54N6G4HN7GPBCYMSDKP4W00C45X19GQ4VT13Y.skate-gear-v1 set-repair-treasury 'TREASURY_PRINCIPAL)

;; 5. Controlled canary supply
(contract-call? 'SP3T54N6G4HN7GPBCYMSDKP4W00C45X19GQ4VT13Y.skate-gear-v1 set-max-supply u2)

;; 6. Final metadata directory URI (trailing slash required)
(contract-call? 'SP3T54N6G4HN7GPBCYMSDKP4W00C45X19GQ4VT13Y.skate-gear-v1 set-metadata-base-uri "ipfs://bafybeidatjszvnpakzn5gntvxqoqjxac3o6zazj2vxnapa3rk44joolapq/")
```

Keep `create-active` false and `claim-active` false.

Do **not** call `freeze-minter`, `freeze-supply`, or `freeze-metadata`.
Do **not** call `set-create-active` or `set-claim-active` until read-only verification passes.

## Expected values after admin, before activation

| Check | Expected |
| --- | --- |
| Skate `get-contract-owner` | `SP3T54N6G4HN7GPBCYMSDKP4W00C45X19GQ4VT13Y` |
| Duel `get-contract-owner` | `SP3T54N6G4HN7GPBCYMSDKP4W00C45X19GQ4VT13Y` |
| `get-minter` | `SP3T54N6G4HN7GPBCYMSDKP4W00C45X19GQ4VT13Y.strike-duel-core-v1` |
| `get-reward-signer` | `0xREPLACE_33_BYTE_COMPRESSED_PUBKEY` (not 33 zero bytes) |
| `get-metadata-base-uri` | `ipfs://bafybeidatjszvnpakzn5gntvxqoqjxac3o6zazj2vxnapa3rk44joolapq/` |
| `get-max-supply` | `u2` |
| Eventual collection supply (later, unfrozen) | `u500` |
| `is-create-active` | `false` |
| `is-claim-active` | `false` |
| `get-current-season` | `u1` |
| `get-current-ruleset` | `u1` |
| `get-repair-price` | `u10000` |
| `get-last-token-id` | `(ok u0)` |

Metadata JSON for token IDs `1.json` … `500.json` is already in this pinned directory, so raising `max-supply` from `u2` to `u500` later does not require a new metadata CID.

## Activation (only after the table matches)

1. `set-create-active(true)` — keep claim closed.
2. One controlled `create-duel`.
3. Verify the Duel row (`get-duel`, `get-duel-count`).
4. Backend voucher via live `get-claim-hash`.
5. `set-claim-active(true)`.
6. Controlled `claim-skate`.
7. Verify: `get-owner` = creator, `get-durability` = `u0`, `get-token-uri` = `ipfs://bafybeidatjszvnpakzn5gntvxqoqjxac3o6zazj2vxnapa3rk44joolapq/1.json`, `is-duel-claimed` true, `is-season-claimed` true.
8. If claim fails: immediately `set-create-active(false)` and `set-claim-active(false)`.
