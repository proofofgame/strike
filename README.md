# Strike - NFT-Gated Gaming Platform

A blockchain-based gaming platform built on Stacks, featuring NFT-gated access and session-based gameplay with STX rewards.

## Key Features

### NFT Equipment System
- Each Soul NFT has 5 customizable equipment slots
- Equipment slots can hold optional item IDs
- Last-used timestamp tracks NFT activity
- Separate functions for full equipment set vs individual slot changes

### NFT Cooldown Mechanism
- 24-hour cooldown period between NFT uses in gameplay
- Prevents same NFT from creating/joining multiple sessions rapidly
- Cooldown tracked via `stacks-block-time` (86400 seconds)
- First use of NFT has no cooldown

### Session Management
- PVE (Player vs Environment) and PVP (Player vs Player) modes
- Minimum bet enforcement (default: 1 STX)
- 90% reward distribution to winners
- Session data includes timestamps and participant tracking

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

**create-session** `(nft-id uint) (mode (string-ascii 20)) (amount uint)`
- Creates a new game session with specified mode (PVE, PVP, etc.)
- Requires caller to own a Soul NFT
- Requires NFT to be off cooldown (24 hours since last use)
- Requires bet amount to meet minimum token limit
- Updates NFT last-used timestamp
- Generates unique session ID using contract hash and counter
- Transfers STX bet from creator to contract using `current-contract` keyword
- Records session with `stacks-block-time` timestamp
- Stores session data in pve-sessions map
- Returns session ID
- Example: `(create-session u1 "PVE" u1000000)` for NFT #1 with 1 STX bet

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

**approve-session** `(nft-id uint) (session-id (buff 32))`
- Allows second player to join and approve a PVP session
- Requires caller to own a Soul NFT
- Requires NFT to be off cooldown (24 hours since last use)
- Updates NFT last-used timestamp
- Transfers bet amount from approver to contract
- Updates session with opponent principal
- Returns success

**create-session-by-default** `(nft-id uint) (mode (string-ascii 20)) (amount uint)`
- Alternative session creation with automatic approval
- Requires NFT to be off cooldown (24 hours since last use)
- Updates NFT last-used timestamp
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

**can-use-nft** `(nft-id uint)`
- Checks if NFT is off cooldown and can be used
- Returns (ok true) if 24 hours have passed since last use
- Returns (ok false) if NFT is still on cooldown
- Returns (ok true) if NFT has never been used

#### Error Codes

- `100` - ERR-NOT-AUTHORIZED: Caller not authorized for owner-only functions
- `101` - ERR-SALE-NOT-ACTIVE: Public sale not currently enabled
- `102` - ERR-DONT-HAVE-SOUL-NFT: Caller does not own Soul NFT
- `103` - ERR-AMOUNT-TOO-LOW: Bet amount below minimum token limit
- `104` - ERR-SESSION-NOT-FOUND: Session ID does not exist
- `105` - ERR-INVALID-WINNER: Winner is not a session participant
- `106` - ERR-SESSION-ALREADY-FINALIZED: Session has already been finalized
- `107` - ERR-INSUFFICIENT-BALANCE: Contract has insufficient balance
- `108` - ERR-NFT-ON-COOLDOWN: NFT cannot be used yet (24 hour cooldown)

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

**set-equipment** `(nft-id uint) (slot-1 (optional uint)) (slot-2 (optional uint)) (slot-3 (optional uint)) (slot-4 (optional uint)) (slot-5 (optional uint))`
- Sets all equipment slots for an NFT at once
- Requires caller to be NFT owner
- Updates last-used timestamp to current block time
- Each slot can hold an optional item ID
- Returns success

**equip-slot** `(nft-id uint) (slot uint) (item-id (optional uint))`
- Equips or unequips an item to a specific slot (1-5)
- Requires caller to be NFT owner
- Does not update last-used timestamp (only for gameplay)
- Returns success

**update-last-used** `(nft-id uint)`
- Updates the last-used timestamp for an NFT
- Requires caller to be NFT owner
- Sets timestamp to current `stacks-block-time`
- Used for cooldown mechanism
- Returns success

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

**get-equipment** `(nft-id uint)`
- Returns all equipment data for an NFT
- Includes all 5 slots and last-used timestamp
- Returns none if NFT has no equipment set

**get-slot** `(nft-id uint) (slot uint)`
- Returns item ID equipped in specific slot (1-5)
- Returns none if slot is empty or NFT has no equipment

**get-last-used** `(nft-id uint)`
- Returns last-used timestamp for an NFT
- Returns none if NFT has never been used
- Used by strike-core for cooldown checks

#### Error Codes

- `200` - ERR-SOLD-OUT: Mint limit reached
- `201` - ERR-WRONG-COMMISSION: Commission contract mismatch
- `202` - ERR-NOT-AUTHORIZED: Caller not authorized
- `203` - ERR-NOT-FOUND: NFT not found
- `204` - ERR-METADATA-FROZEN: Metadata cannot be changed
- `205` - ERR-MINT-ALREADY-SET: Mint address already configured
- `206` - ERR-LISTING: NFT listing error
- `207` - ERR-INVALID-SLOT: Slot number must be 1-5

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

# Run test suite (46 tests: 23 strike-core + 23 soul-nft)
npm test
```

### Test Coverage

**strike-core.test.ts** (23 tests):
- Session creation and counter increment
- Session finalization and data storage
- NFT claiming (single and batch)
- Token management (deposit, withdraw, min limits)
- Session joining and approval
- NFT cooldown validation (24-hour mechanism)
- Clarity 4 feature validation (stacks-block-time)
- Authorization checks
- Read-only function verification

**soul-nft.test.ts** (23 tests):
- NFT minting and transfers
- Marketplace listing/unlisting
- NFT purchases with commission
- Balance and ownership queries
- Metadata URI management
- Equipment management (set-equipment, equip-slot, update-last-used)
- Equipment read functions (get-equipment, get-slot, get-last-used)
- Slot validation and authorization checks

## Deployment Notes

- Contracts require **Clarity 4** (Epoch 3.3)
- Set `clarity_version = 4` and `epoch = '3.3'` in Clarinet.toml
- Allowances ensure secure cross-contract calls
- Session timestamps use `stacks-block-time` for accurate tracking

# Made with :heart: by the Skullcoin Labs