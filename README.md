# Strike - NFT-Gated Gaming Platform

A blockchain-based gaming platform built on Stacks, featuring NFT-gated access and session-based gameplay with STX rewards.

## Clarity 4 Features

This project leverages the latest Clarity 4 enhancements:

- **`as-contract?`**: Enhanced security with explicit asset allowances (`with-stx`, `with-ft`, `with-nft`, `with-all-assets-unsafe`)
- **`current-contract`**: Keyword for getting the current contract's principal
- **`stacks-block-time`**: Block timestamps in seconds for precise session tracking
- **`contract-hash?`**: Contract code hash for improved randomization

## Contracts

### strike-core.clar

Core contract for managing game sessions and NFT-gated access.

#### Public Functions

**create-session** `(mode (string-ascii 20)) (amount uint)`
- Creates a new game session with specified mode (PVE, PVP, etc.)
- Requires caller to own a Soul NFT
- Requires bet amount to meet minimum token limit
- Generates unique session ID using contract hash and counter
- Transfers STX bet from creator to contract using `current-contract` keyword
- Records session with `stacks-block-time` timestamp
- Stores session data in pve-sessions map
- Returns session ID
- Example: `(create-session "PVE" u1000000)` for 1 STX bet

**finalize-session** `(session-id (buff 32)) (resulthash (buff 32)) (winner principal)`
- Finalizes a game session with results
- Sends 90% of bet pool to winner using `as-contract?` with STX allowance
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

**deposit-stx** `(amount uint)`
- Deposits STX to contract for reward pool
- Transfers specified amount from sender to contract using `current-contract`
- Available to any user

**withdraw-stx** `(amount uint)`
- Withdraws STX from contract (only contract owner)
- Uses `as-contract?` with STX allowance for secure transfers
- Transfers specified amount to owner

**set-min-token-limit** `(limit uint)`
- Sets minimum bet amount for creating sessions (only contract owner)
- Prevents sessions with stakes below platform minimum
- Example: `(set-min-token-limit u1000000)` for 1 STX minimum

**approve-session** `(session-id (buff 32))`
- Allows second player to join and approve a PVP session
- Requires caller to own a Soul NFT
- Transfers bet amount from approver to contract
- Updates session with opponent principal
- Returns success

**create-session-by-default** `(mode (string-ascii 20)) (amount uint)`
- Alternative session creation with automatic approval
- Uses `contract-hash?` for enhanced randomization
- Internally calls approve-session using `as-contract?` with STX allowance
- Returns session ID

**set-mint-address**
- Registers soul-nft contract as authorized minter
- Uses `as-contract?` with all-assets allowance
- Can only be called once by contract owner

#### Read-Only Functions

**has-soul-nft** `(account principal)`
- Checks if account owns at least one Soul NFT
- Returns (ok true) if balance > 0, otherwise ERR-DONT-HAVE-SOUL-NFT

**get-session** `(session-id (buff 32))`
- Retrieves session data by session ID
- Returns session details including:
  - `mode`: Game mode (PVE, PVP, etc.)
  - `creator`: Session creator principal
  - `opponent`: Optional second player principal
  - `bet`: Wagered amount in microSTX
  - `created-at`: Unix timestamp from `stacks-block-time`
  - `session-id`: Unique session identifier

**get-finalized-session** `(session-id (buff 32))`
- Retrieves finalized session data by session ID
- Returns result hash and winner

**sale-enabled**
- Checks if public sale is currently active
- Returns current sale state

**get-min-token-limit**
- Returns current minimum bet amount
- Default: u1000000 (1 STX)

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

### Setup

```bash
# Install dependencies
npm install

# Ensure Clarinet 3.13.1+ for Clarity 4 support
clarinet --version
```

### Testing

```bash
# Check contracts (Clarity 4 syntax)
clarinet check

# Run test suite (34 tests: 20 strike-core + 14 soul-nft)
npm test
```

### Test Coverage

**strike-core.test.ts** (20 tests):
- Session creation and counter increment
- Session finalization and data storage
- NFT claiming (single and batch)
- Token management (deposit, withdraw, min limits)
- Session joining and approval
- Clarity 4 feature validation (stacks-block-time)
- Authorization checks
- Read-only function verification

**soul-nft.test.ts** (14 tests):
- NFT minting and transfers
- Marketplace listing/unlisting
- NFT purchases with commission
- Balance and ownership queries
- Metadata URI management

## Deployment Notes

- Contracts require **Clarity 4** (Epoch 3.3)
- Set `clarity_version = 4` and `epoch = '3.3'` in Clarinet.toml
- Allowances ensure secure cross-contract calls
- Session timestamps use `stacks-block-time` for accurate tracking