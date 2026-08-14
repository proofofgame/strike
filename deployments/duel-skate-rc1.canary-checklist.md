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

## Post-deploy admin (after both publishes confirm)

Exact Clarity forms. Replace only the two placeholders.

```clarity
(contract-call? 'SP3T54N6G4HN7GPBCYMSDKP4W00C45X19GQ4VT13Y.skate-gear-v1 set-minter 'SP3T54N6G4HN7GPBCYMSDKP4W00C45X19GQ4VT13Y.strike-duel-core-v1)

(contract-call? 'SP3T54N6G4HN7GPBCYMSDKP4W00C45X19GQ4VT13Y.strike-duel-core-v1 set-reward-signer 0xREPLACE_33_BYTE_COMPRESSED_PUBKEY)

(contract-call? 'SP3T54N6G4HN7GPBCYMSDKP4W00C45X19GQ4VT13Y.skate-gear-v1 set-max-supply u2)

(contract-call? 'SP3T54N6G4HN7GPBCYMSDKP4W00C45X19GQ4VT13Y.skate-gear-v1 set-metadata-base-uri "ipfs://REPLACE_WITH_METADATA_DIRECTORY_CID/")
```

Do **not** call `freeze-minter`, `freeze-supply`, or `freeze-metadata`.
Do **not** call `set-create-active` or `set-claim-active` until read-only verification passes.

Repair treasury defaults to the deployer. Call `set-repair-treasury` only if fees must go elsewhere.

## Expected values after admin, before activation

| Check | Expected |
| --- | --- |
| Skate `get-contract-owner` | `SP3T54N6G4HN7GPBCYMSDKP4W00C45X19GQ4VT13Y` |
| Duel `get-contract-owner` | `SP3T54N6G4HN7GPBCYMSDKP4W00C45X19GQ4VT13Y` |
| `get-minter` | `SP3T54N6G4HN7GPBCYMSDKP4W00C45X19GQ4VT13Y.strike-duel-core-v1` |
| `get-reward-signer` | `0xREPLACE_33_BYTE_COMPRESSED_PUBKEY` (not 33 zero bytes) |
| `get-metadata-base-uri` | `ipfs://REPLACE_WITH_METADATA_DIRECTORY_CID/` until the real directory CID is pinned |
| `get-max-supply` | `u2` |
| Eventual collection supply (later, unfrozen) | `u500` |
| `is-create-active` | `false` |
| `is-claim-active` | `false` |
| `get-current-season` | `u1` |
| `get-current-ruleset` | `u1` |
| `get-repair-price` | `u10000` |
| `get-last-token-id` | `(ok u0)` |

Metadata JSON for token IDs `1.json` … `500.json` must already be in the pinned directory **before** raising `max-supply` from `u2` to `u500`, so `metadata-base-uri` does not change.

## Activation (only after the table matches)

1. `set-create-active(true)` — keep claim closed.
2. One controlled `create-duel`.
3. Backend voucher via live `get-claim-hash`.
4. `set-claim-active(true)`.
5. Controlled `claim-skate`.
6. If claim fails: immediately `set-create-active(false)` and `set-claim-active(false)`.
