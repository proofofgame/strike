## Contracts

### strike-core.clar

Core contract for managing game sessions and NFT-gated access.

#### Public Functions

**create-session** `(mode (string-ascii 20))`
- Creates a new game session with specified mode (PVE, PVP, etc.)
- Requires caller to own a Soul NFT
- Generates unique session ID using hash of sender, block height, and counter
- Stores session data in pve-sessions map
- Returns session ID

**finalize-session** `(session-id (buff 32)) (resulthash (buff 32)) (winner principal)`
- Finalizes a game session with results
- Records session outcome, result hash, and winner address
- Stores finalized data in finalized-sessions map
- Returns success

**claim-one**
- Mints 1 Soul NFT to caller
- Requires sale to be active

**claim-five**
- Mints 5 Soul NFTs to caller in batch
- Requires sale to be active

**flip-sale**
- Toggles public sale state (only contract owner)
- Returns new sale state

**withdraw-stx** `(amount uint)`
- Withdraws STX from contract (only contract owner)
- Transfers specified amount to owner

#### Read-Only Functions

**has-soul-nft** `(account principal)`
- Checks if account owns at least one Soul NFT
- Returns (ok true) if balance > 0, otherwise ERR-DONT-HAVE-SOUL-NFT

**get-session** `(session-id (buff 32))`
- Retrieves session data by session ID
- Returns session details including mode and creator

**get-finalized-session** `(session-id (buff 32))`
- Retrieves finalized session data by session ID
- Returns result hash and winner

**sale-enabled**
- Checks if public sale is currently active
- Returns current sale state

---

### soul-nft.clar

NFT contract with marketplace functionality implementing SIP-009 standard.

#### Public Functions

**mint** `(new-owner principal)`
- Mints new Soul NFT to specified owner
- Can only be called from authorized mint contract
- Enforces mint limit
- Increments token counter

**transfer** `(id uint) (sender principal) (recipient principal)`
- Transfers NFT from sender to recipient
- Requires caller to be the sender
- Prevents transfer of listed NFTs

**set-base-uri** `(new-base-uri (string-ascii 80))`
- Updates base URI for token metadata (only contract owner)
- Cannot be changed if metadata is frozen

**set-mint-limit** `(limit uint)`
- Sets maximum mintable supply (only contract owner)

**freeze-metadata**
- Permanently locks metadata URI (only contract owner)
- Irreversible operation

**set-mint-address**
- Registers authorized minting contract
- Can only be set once

**list-in-ustx** `(id uint) (price uint) (comm <commission-trait>)`
- Lists NFT for sale on marketplace
- Sets price in microSTX
- Specifies commission contract

**unlist-in-ustx** `(id uint)`
- Removes NFT from marketplace
- Only owner can unlist

**buy-in-ustx** `(id uint) (comm <commission-trait>)`
- Purchases listed NFT
- Transfers STX to seller
- Pays commission fee
- Transfers NFT to buyer

#### Read-Only Functions

**get-balance** `(account principal)`
- Returns number of Soul NFTs owned by account

**get-owner** `(id uint)`
- Returns owner of specified token ID

**get-last-token-id**
- Returns most recently minted token ID

**get-token-uri** `(token-id uint)`
- Returns metadata URI for token

**get-mint-limit**
- Returns maximum mintable supply

**get-listing-in-ustx** `(id uint)`
- Returns marketplace listing details for token
- Includes price and commission contract

## Development

```bash
# Check contracts
clarinet check

# Run tests
npm test
```