# Strike - NFT-Gated Gaming Platform

[![codecov](https://codecov.io/gh/proofofgame/strike/branch/main/graph/badge.svg)](https://codecov.io/gh/proofofgame/strike)
[![Tests](https://github.com/proofofgame/strike/actions/workflows/codecov.yml/badge.svg)](https://github.com/proofofgame/strike/actions/workflows/codecov.yml)

A blockchain-based gaming platform built on Stacks, featuring NFT-gated access and session-based gameplay with STX and sBTC rewards.

## Key Features

### Gate System
- **Base functionality gate** (`gate-active`) controls access to most state-changing gameplay/admin functions
- `flip-gate` toggle — owner-only, works even when gate is closed
- Most state-changing gameplay/admin functions require gate to be open (`ERR-GATE-CLOSED u111`)
- Allows safe contract deployment and maintenance windows

### Raid System
- **Raid gate** (`raid-active`) controls access to raid participation functions
- `flip-raid` toggle — owner-only, independent from the base gate
- `enter` and `claim-raid-pass` require raid to be active (`ERR-RAID-NOT-ACTIVE u113`)
- Allows separate control of raid events without affecting core gameplay

### Raid Pass System
- **Enter**: Any user can call `enter` to register as a raid participant (requires raid active)
- **Raid Pass NFT**: Registered users can claim a Raid Pass NFT (1 per principal)
- `raid-pass-users` map tracks who entered the strike
- `claim-raid-pass` checks registration and mints via `.raid-pass-v1` contract
- Raid Pass has separate mint limit (500) and error code range (u300+)

### Multi-Currency Support
- **STX Sessions**: Native Stacks token for betting and rewards
- **sBTC Sessions**: Bitcoin-backed token support via SIP-010
- Separate session creation and management functions per currency
- Automatic currency type tracking in session data
- 10% platform fee on all sessions (90% to winners)

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

### Strike Duel + S-KATE Gear
- Player 1 signs `create-duel` with a server-issued 32-byte commitment (`tx-sender` is the creator)
- Player 2 has **no** required blockchain transaction; combat stays off-chain
- Player 1 later signs `claim-skate` with a backend completion voucher
- `skate-gear-v1` mints damaged (`durability 0/1`); `repair-skate` pays STX and moves durability to `1/1`
- Independent of `strike-core-v1` Soul-gated sessions; see [docs/duel-skate-v1.md](docs/duel-skate-v1.md)

### Session Management
- **PvE (Player vs Environment)**: Auto-finalized sessions with contract as opponent
- **PvP (Player vs Player)**: Two-player competitive sessions
- **Tournament Mode**: Multi-player tournament support
- **Owner-Only Finalization**: Only contract owner can finalize sessions (centralized control for moderation)
- Session cancellation before opponent joins (with full refund)
- Minimum bet enforcement (default: 1 STX for STX sessions, 10 sBTC for sBTC sessions)
- 90% reward distribution to winners, 10% platform fees
- Session data includes timestamps, participants, and currency type tracking

## Clarity 4 Features

This project leverages the latest Clarity 4 enhancements:

- **`as-contract?`**: Enhanced security with explicit asset allowances (`with-stx`, `with-ft`, `with-nft`, `with-all-assets-unsafe`)
- **`current-contract`**: Keyword for getting the current contract's principal
- **`stacks-block-time`**: Block timestamps in seconds for precise session tracking
- **`contract-hash?`**: Contract code hash for improved randomization

## Contracts

### strike-core-v1.clar

Core contract for managing game sessions and NFT-gated access.

#### Public Functions

**STX Session Functions:**

**create-session** `(nft-id uint) (mode (string-ascii 20)) (amount uint)`
- Creates a new game session with STX betting
- Requires caller to own a Soul NFT
- Requires NFT to be off cooldown (24 hours since last use)
- Requires bet amount to meet minimum token limit
- Updates NFT last-used timestamp
- Generates unique session ID from caller, timestamp, and session counter
- Transfers STX bet from creator to contract using `current-contract` keyword
- Records session with `stacks-block-time` timestamp and currency-type "STX"
- Returns session ID
- Example: `(create-session u1 "PvP" u1000000)` for NFT #1 with 1 STX bet

**create-session-by-default** `(nft-id uint) (mode (string-ascii 20)) (amount uint)`
- Creates and auto-finalizes PvE session with STX
- Contract acts as opponent and auto-finalizes
- Uses `contract-hash?` for enhanced randomization
- Internally calls `approve-session-internal` and `finalize-session-internal`
- Rewards 90% to creator, 10% to fees
- Returns session ID

**approve-session** `(nft-id uint) (session-id (buff 32))`
- Allows second player to join a PvP session with STX
- Requires caller to own a Soul NFT and NFT off cooldown
- Prevents session creator from joining their own session
- Prevents overwriting existing opponent
- Updates NFT last-used timestamp
- Transfers bet amount from approver to contract
- Updates session with opponent principal
- Returns success

**finalize-session** `(session-id (buff 32)) (resulthash (buff 32)) (winner principal)`
- Finalizes a STX game session with results
- **Only contract owner can finalize** (centralized moderation control)
- For PvE: reward = 90% of single bet
- For PvP: reward = 90% of combined pot (2x bet)
- Sends reward to winner using `as-contract?` with STX allowance
- Accumulates 10% fee to platform total-fees
- Records session outcome, result hash, and winner address
- Prevents double finalization
- Returns success

**cancel-session** `(session-id (buff 32))`
- Cancels a STX session before opponent joins
- Only creator can cancel
- Cannot cancel after opponent has joined
- Refunds full bet amount to creator
- Deletes session from storage
- Emits cancellation event with refund amount
- Returns success

**sBTC Session Functions:**

**create-session-with-sbtc** `(nft-id uint) (mode (string-ascii 20)) (amount uint)`
- Creates a new game session with sBTC betting
- Same validations as STX version
- Transfers sBTC from creator to contract via SIP-010
- Records session with currency-type "sBTC"
- Returns session ID

**create-session-by-default-with-sbtc** `(nft-id uint) (mode (string-ascii 20)) (amount uint)`
- Creates and auto-finalizes PvE session with sBTC
- Contract acts as opponent
- Internally calls `approve-session-internal-sbtc` and `finalize-session-sbtc-internal`
- Rewards 90% sBTC to creator, 10% to fees
- Returns session ID

**approve-session-with-sbtc** `(nft-id uint) (session-id (buff 32))`
- Allows second player to join a PvP session with sBTC
- Same validations as STX version
- Transfers sBTC bet from approver to contract
- Returns success

**finalize-session-sbtc** `(session-id (buff 32)) (resulthash (buff 32)) (winner principal)`
- Finalizes an sBTC game session
- **Only contract owner can finalize** (centralized moderation control)
- Same logic as STX version but with sBTC transfers
- Uses SIP-010 transfer with memo parameter
- Accumulates fees to total-fees-sbtc (separate from STX fees)
- Returns success

**cancel-session-with-sbtc** `(session-id (buff 32))`
- Cancels an sBTC session before opponent joins
- Same logic as STX cancel
- Refunds full sBTC amount to creator
- Emits sBTC cancellation event
- Returns success

**Treasury Management:**

**deposit-stx** `(amount uint)`
- Deposits STX to contract for reward pool
- Transfers specified amount from sender to contract using `current-contract`
- Owner-only and requires gate to be active

**withdraw-stx** `(amount uint)`
- Withdraws STX from contract (only contract owner)
- Uses `as-contract?` with STX allowance for secure transfers
- Checks sufficient balance before withdrawal
- Transfers specified amount to owner

**deposit-sbtc** `(amount uint)`
- Deposits sBTC to contract for reward pool (only owner)
- Transfers sBTC via SIP-010 standard
- Available for owner to fund sBTC sessions

**withdraw-sbtc** `(amount uint)`
- Withdraws sBTC from contract (only contract owner)
- Uses `as-contract?` with FT allowance for secure transfers
- Checks sufficient sBTC balance before withdrawal
- Transfers to owner with memo parameter

**withdraw-fees** `(amount uint)`
- Withdraws accumulated STX platform fees (only owner)
- Fees collected from STX sessions (10% of pots)
- Deducts from total-fees counter
- Checks sufficient fee balance
- Transfers STX to owner

**withdraw-fees-sbtc** `(amount uint)`
- Withdraws accumulated sBTC platform fees (only owner)
- Fees collected from sBTC sessions (10% of pots)
- Deducts from total-fees-sbtc counter
- Checks sufficient sBTC fee balance
- Transfers sBTC to owner using SIP-010

**Gate & Entry Functions:**

**flip-gate**
- Toggles base functionality gate on/off (only contract owner)
- Works even when gate is closed
- `flip-raid` is also callable without base gate checks
- Returns new gate state

**flip-raid**
- Toggles raid participation gate on/off (only contract owner)
- Independent from the base `gate-active` flag
- Controls access to `enter` and `claim-raid-pass`
- Returns new raid state

**enter**
- Registers caller as a raid participant in `raid-pass-users` map
- Requires raid to be active (`ERR-RAID-NOT-ACTIVE u113`)
- Prints "Entry confirmed"
- Available to any user

**claim-raid-pass**
- Mints 1 Raid Pass NFT to caller
- Requires raid to be active (`ERR-RAID-NOT-ACTIVE u113`)
- Requires caller to have entered via `enter` (`ERR-NOT-IN-RAID u112`)
- Calls `.raid-pass-v1 mint` — limited to 1 per principal (`ERR-ALREADY-MINTED u307`)

**General Functions:**

**claim-one**
- Mints 1 Soul NFT to caller
- Requires gate to be active and sale to be active

**claim-five**
- Mints 5 Soul NFTs to caller in batch
- Requires gate to be active and sale to be active

**flip-sale**
- Toggles public sale state (only contract owner)
- Requires gate to be active
- Returns new sale state

**set-min-token-limit** `(limit uint)`
- Sets minimum bet amount for STX sessions (only contract owner)
- Requires gate to be active
- Prevents sessions with stakes below platform minimum
- Example: `(set-min-token-limit u1000000)` for 1 STX minimum

**set-min-token-limit-sbtc** `(limit uint)`
- Sets minimum bet amount for sBTC sessions (only contract owner)
- Prevents sBTC sessions with stakes below platform minimum
- Default: u1000000000 (10 sBTC)
- Example: `(set-min-token-limit-sbtc u1000000000)` for 10 sBTC minimum

> Note: mint-address registration for `.soul-nft-v1` and `.raid-pass-v1` is executed at deploy time in top-level expressions inside `strike-core-v1`, not via a public callable function.

#### Read-Only Functions

**has-soul-nft** `(account principal)`
- Checks if account owns at least one Soul NFT
- Returns (ok true) if balance > 0, otherwise ERR-DONT-HAVE-SOUL-NFT

**get-session** `(session-id (buff 32))`
- Retrieves session data by session ID
- Returns session details including:
  - `mode`: Game mode (PvE, PvP, Tournament)
  - `creator`: Session creator principal
  - `opponent`: Optional second player principal
  - `bet`: Wagered amount in microSTX or microSAT
  - `created-at`: Unix timestamp from `stacks-block-time`
  - `session-id`: Unique session identifier
  - `currency-type`: "STX" or "sBTC"

**get-finalized-session** `(session-id (buff 32))`
- Retrieves finalized session data by session ID
- Returns result hash, winner, and reward amount

**get-total-fees**
- Returns accumulated STX platform fees
- Represents 10% of all finalized STX session pots
- Available for owner withdrawal

**get-total-fees-sbtc**
- Returns accumulated sBTC platform fees
- Represents 10% of all finalized sBTC session pots
- Available for owner withdrawal

**gate-enabled**
- Returns current gate state (true = open, false = closed)

**raid-enabled**
- Returns current raid state (true = open, false = closed)
- Independent from `gate-enabled`

**sale-enabled**
- Checks if public sale is currently active
- Returns current sale state

**get-min-token-limit**
- Returns current minimum bet amount for STX sessions
- Default: u1000000 (1 STX)

**get-min-token-limit-sbtc**
- Returns current minimum bet amount for sBTC sessions
- Default: u1000000000 (10 sBTC)

**can-use-nft** `(nft-id uint) (owner principal)`
- Checks if NFT is owned by specified principal and off cooldown
- Validates NFT ownership via soul-nft contract
- Returns (ok true) if owned and 24 hours have passed since last use
- Returns (ok false) when on cooldown
- Returns (err false) when NFT is not owned / not found
- Returns (ok true) if NFT has never been used

#### Error Codes

- **ERR-NOT-AUTHORIZED** (u100): Caller not authorized for owner-only functions
- **ERR-SALE-NOT-ACTIVE** (u101): Public sale not currently enabled
- **ERR-DONT-HAVE-SOUL-NFT** (u102): Caller does not own Soul NFT
- **ERR-AMOUNT-TOO-LOW** (u103): Bet amount below minimum token limit
- **ERR-SESSION-NOT-FOUND** (u104): Session ID does not exist
- **ERR-INVALID-WINNER** (u105): Winner is not a session participant
- **ERR-SESSION-ALREADY-FINALIZED** (u106): Session has already been finalized
- **ERR-INSUFFICIENT-BALANCE** (u107): Contract has insufficient balance
- **ERR-NFT-ON-COOLDOWN** (u108): NFT cannot be used yet (24 hour cooldown)
- **ERR-INVALID-MODE** (u109): Invalid session mode specified
- **ERR-CANNOT-CANCEL** (u110): Cannot cancel session (opponent already joined)
- **ERR-GATE-CLOSED** (u111): Base functionality gate is not active
- **ERR-NOT-IN-RAID** (u112): Caller has not entered the raid via `enter`
- **ERR-RAID-NOT-ACTIVE** (u113): Raid participation gate is not active (`enter`, `claim-raid-pass`)

#### Private (Internal) Functions

**claim**
- Internal helper for NFT minting
- Validates sale is active
- Calls soul-nft mint function
- Used by claim-one and claim-five

**send-stx-to-winner** `(player principal) (amount uint)`
- Internal helper for STX reward distribution
- Transfers STX from contract to winner
- Uses `as-contract?` with STX allowance
- Called by finalize-session and finalize-session-internal

**send-sbtc-to-winner** `(player principal) (amount uint)`
- Internal helper for sBTC reward distribution
- Transfers sBTC from contract to winner via SIP-010
- Uses `as-contract?` with FT allowance
- Called by finalize-session-sbtc and finalize-session-sbtc-internal

**approve-session-internal** `(session-id (buff 32))`
- Internal session approval for auto-finalization
- Sets contract as opponent without NFT validation
- Used by create-session-by-default for PvE mode
- Bypasses cooldown and NFT ownership checks

**approve-session-internal-sbtc** `(session-id (buff 32))`
- Internal sBTC session approval for auto-finalization
- Sets contract as opponent without NFT validation
- Used by create-session-by-default-with-sbtc for PvE mode
- Bypasses cooldown and NFT ownership checks

**finalize-session-internal** `(session-id (buff 32)) (resulthash (buff 32)) (winner principal)`
- Internal session finalization for auto-finalized PvE
- Same logic as finalize-session but without owner check
- Accumulates fees to total-fees
- Used by create-session-by-default

**finalize-session-sbtc-internal** `(session-id (buff 32)) (resulthash (buff 32)) (winner principal)`
- Internal sBTC session finalization for auto-finalized PvE
- Same logic as finalize-session-sbtc but without owner check
- Accumulates fees to total-fees-sbtc
- Used by create-session-by-default-with-sbtc

---

### raid-pass-v1.clar

Raid Pass NFT contract implementing SIP-009 standard. Limited to 1 per principal, 500 total supply.

#### Public Functions

**mint** `(new-owner principal)`
- Mints new Raid Pass NFT to specified owner
- Can only be called from authorized mint contract (strike-core-v1)
- Enforces mint limit (500)
- Enforces 1-per-principal limit (`ERR-ALREADY-MINTED u307`)
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
- Set at deploy time by strike-core-v1

**list-in-ustx** `(id uint) (price uint) (comm <commission-trait>)`
- Lists NFT for sale on marketplace

**unlist-in-ustx** `(id uint)`
- Removes NFT from marketplace

**buy-in-ustx** `(id uint) (comm <commission-trait>)`
- Purchases listed NFT

#### Read-Only Functions

**get-balance** `(account principal)` — Returns number of Raid Pass NFTs owned

**get-owner** `(id uint)` — Returns owner of specified token ID

**get-last-token-id** — Returns most recently minted token ID

**get-token-uri** `(token-id uint)` — Returns metadata URI

**get-mint-limit** — Returns maximum mintable supply (default: 500)

**get-listing-in-ustx** `(id uint)` — Returns marketplace listing details

#### Error Codes

- **ERR-SOLD-OUT** (u300): Mint limit reached
- **ERR-WRONG-COMMISSION** (u301): Commission contract mismatch
- **ERR-NOT-AUTHORIZED** (u302): Caller not authorized
- **ERR-NOT-FOUND** (u303): NFT not found
- **ERR-METADATA-FROZEN** (u304): Metadata cannot be changed
- **ERR-MINT-ALREADY-SET** (u305): Mint address already configured
- **ERR-LISTING** (u306): NFT listing error
- **ERR-ALREADY-MINTED** (u307): Principal already has a Raid Pass

---

### soul-nft-v1.clar

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
- Used by strike-core-v1 for cooldown checks

#### Error Codes

- **ERR-SOLD-OUT** (u200): Mint limit reached
- **ERR-WRONG-COMMISSION** (u201): Commission contract mismatch
- **ERR-NOT-AUTHORIZED** (u202): Caller not authorized
- **ERR-NOT-FOUND** (u203): NFT not found
- **ERR-METADATA-FROZEN** (u204): Metadata cannot be changed
- **ERR-MINT-ALREADY-SET** (u205): Mint address already configured
- **ERR-LISTING** (u206): NFT listing error
- **ERR-INVALID-SLOT** (u207): Slot number must be 1-5

---

### strike-duel-core-v1.clar

Creator-only Duel entry and Skate claim. Player 2 and combat are not on-chain.

#### Public Functions

**create-duel** `(duel-id (buff 32))`
- Records `tx-sender` as creator for a 32-byte server-issued commitment
- Rejects empty, short, and all-zero commitments
- Does not store the public 6-character invite ID or invite secret
- Requires `create-active`

**claim-skate** `(duel-id (buff 32)) (expires-at uint) (signature (buff 64))`
- Creator-only; verifies a secp256k1 completion voucher against `get-claim-hash`
- Mints one damaged Skate via `.skate-gear-v1`
- One claim per Duel and one Skate per principal per season

**cancel-duel** `(duel-id (buff 32))`
- Creator-only cancel before claim

Owner functions include `set-create-active`, `set-claim-active`, `set-reward-signer`, `set-current-season`, `set-current-ruleset`, and two-step `propose-ownership` / `accept-ownership`.

#### Read-Only Functions

**get-claim-hash** `(duel-id (buff 32)) (creator principal) (season uint) (expires-at uint)`
- Canonical 32-byte voucher digest. Sign this digest directly (`prehash: false`).

Also: `get-duel`, `get-current-season`, `get-current-ruleset`, `is-duel-claimed`, `is-season-claimed`, `get-reward-signer`.

Full interface, voucher rules, and deployment order: [docs/duel-skate-v1.md](docs/duel-skate-v1.md).

### skate-gear-v1.clar

SIP-009 S-KATE Gear NFT. Minted only by the authorized Duel controller.

#### Public Functions

**mint** `(new-owner principal)` — authorized minter only; every Skate starts at durability `0`

**repair-skate** `(token-id uint)` — owner pays `get-repair-price()` (default 10,000 µSTX) to `get-repair-treasury()` and sets durability `1`

**transfer** `(token-id uint) (sender principal) (recipient principal)` — SIP-009 transfer; does not restore claim eligibility

Owner functions include `set-minter`, `freeze-minter`, `set-max-supply`, `freeze-supply`, `set-metadata-base-uri`, `freeze-metadata`, `set-repair-price`, `set-repair-treasury`, and two-step ownership rotation.

#### Read-Only Functions

**get-durability** `(token-id uint)` — authoritative damaged (`0`) / repaired (`1`) value

Also: `get-token-uri`, `get-owner`, `get-last-token-id`, `get-max-supply`, `get-repair-price`, `get-repair-treasury`.

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

# Run test suite
npm test

# Generate numbered SIP-016 Skate metadata after setting the image CID
npm run metadata:generate

# Run with coverage report
npm run test:report
```

### Test Coverage

**strike-core-v1.test.ts** (79 tests: 77 passed, 2 skipped):
- **Gate management** (flip-gate toggle, owner-only, gate-closed blocking)
- **Raid management** (raid-enabled check, flip-raid toggle, owner-only, block enter when closed, block claim-raid-pass when closed)
- **Enter & Raid Pass** (enter, multi-user enter, claim-raid-pass, fail without enter, 1-per-principal limit)
- Session creation with STX and sBTC
- Session finalization with PvE/PvP reward calculation
- **Owner-only finalization security** (CONTRACT-OWNER restriction)
- NFT claiming (single and batch)
- Token management (deposit/withdraw STX and sBTC)
- **sBTC minimum token limit management** (set/get)
- **sBTC fee management** (separate tracking and withdrawal)
- Session joining and approval
- Session cancellation with STX and sBTC refunds
- Fee management and withdrawal (STX and sBTC separate)
- NFT cooldown validation (24-hour mechanism)
- Clarity 4 feature validation (stacks-block-time)
- Mode validation
- Authorization checks
- Withdrawal security and balance checks
- PvE auto-finalization with STX and sBTC
- Finalization security and validation
- Multiple NFT management
- Read-only function verification

**Skipped Tests (2):**
- sBTC session creation test (requires wallet sBTC balance in simnet)
- sBTC session cancellation test (requires wallet sBTC balance in simnet)

*Note: Skipped tests require testnet/mainnet deployment for full sBTC integration testing due to simnet limitations with external contract administrative functions.*

**raid-pass-v1.test.ts** (33 tests):
- NFT minting via enter → claim-raid-pass flow
- 1-per-principal mint limit enforcement
- Mint limit (sold out) enforcement
- Transfer and balance updates
- Marketplace listing/unlisting/purchase
- Metadata URI management and freeze
- Mint address registration (set at deploy)
- Mint limit configuration and authorization
- Read-only function verification

**strike-duel-v1.test.ts** (12 tests):
- Creator Duel entry and duplicate / zero / short commitment rejection
- Damaged Skate mint via completion voucher
- Player 2 claim rejection
- Forged, expired, replayed, and same-season claim rejection
- Transfer without renewed claim eligibility
- Owner-only paid repair and durability `0 → 1`
- Minter hijack / direct mint rejection
- Adjustable then frozen supply
- Numbered SIP-009 metadata URI
- Malformed reward signer rejection
- Two-step ownership transfer on both Duel contracts

**soul-nft-v1.test.ts** (23 tests):
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
- **sBTC Integration**: Ensure sBTC token contract is deployed and accessible via SIP-010 standard
- sBTC transfers use memo parameter `(some 0x)` for compatibility
- Allowances ensure secure cross-contract calls for multi-currency support
- Session timestamps use `stacks-block-time` for accurate tracking
- Platform fees accumulate separately from session pots (10% fee on all finalized sessions)

---

# Randomness

On-chain VRF-based random number generation for the Stacks blockchain.

## Key Features

### Core RNG Flow
- Request/finalize lifecycle for deterministic and verifiable randomness
- VRF-seed based derivation using sha512/256 hash chain
- Operator callback delivery via `receive-randomness`

### Modes
- `MODE-FAST` (u1): uses VRF seed from the previous block, finalized in the same transaction
- `MODE-NEXT-TENURE` (u2): uses VRF seed from a future tenure, finalized in a later transaction

### Access Control
- Requester and operator allowlists on core contract
- Owner-only admin operations with transferable ownership
- Operator validates active core contract via `data-var` + `contract-of` check

## Contracts

### rng-traits-v1

Stable trait definitions shared by core and operator.

#### Traits

**rng-operator-trait**
- `(receive-randomness (uint uint) (response bool uint))`

**rng-core-trait**
- `(request-randomness (<rng-operator-trait> uint) (response uint uint))`
- `(finalize-randomness (uint <rng-operator-trait>) (response uint uint))`

### rng-core-v1

Core RNG engine: manages requests, derives randomness from VRF seeds, enforces request/operator policy.

#### Read-Only Functions

**get-owner**
- Returns current contract owner principal.

**get-requests-enabled**
- Returns whether new requests are currently accepted.

**get-last-request-id**
- Returns last assigned request ID.

**get-requester-allowed** `(requester principal)`
- Returns requester allowlist status.

**get-operator-allowed** `(operator principal)`
- Returns operator allowlist status.

**get-request** `(request-id uint)`
- Returns full request record or `ERR-REQUEST-NOT-FOUND (u404)`.

**get-randomness** `(request-id uint)`
- Returns finalized randomness or `u404/u409`.

**get-randomness-in-range** `(request-id uint) (max uint)`
- Returns `randomness mod max`.
- Fails with `u404/u409/u411`.

#### Admin Functions (owner-only)

**transfer-ownership** `(new-owner principal)`
- Transfers owner role.

**flip-requests-enabled**
- Toggles request acceptance.

**set-requester-allowed** `(requester principal) (allowed bool)`
- Adds/removes requester from allowlist.

**set-operator-allowed** `(operator principal) (allowed bool)`
- Adds/removes operator from allowlist.

#### Public Flow

**request-randomness** `(operator <rng-operator-trait>) (mode uint)`
- Creates a new RNG request through allowlisted operator.

**finalize-randomness** `(request-id uint) (operator <rng-operator-trait>)`
- Finalizes pending request and pushes callback to operator.

#### Error Codes

- **ERR-NOT-AUTHORIZED** (u401): caller is not contract owner
- **ERR-INVALID-OPERATOR** (u402): operator not allowlisted or tx-sender mismatch
- **ERR-REQUESTER-NOT-ALLOWED** (u403): requester not on allowlist
- **ERR-REQUEST-NOT-FOUND** (u404): request does not exist
- **ERR-ALREADY-FINALIZED** (u405): request already finalized
- **ERR-REQUESTS-DISABLED** (u406): request creation paused
- **ERR-CALLBACK-FAILED** (u407): operator callback failed
- **ERR-NO-VRF-SEED** (u408): VRF seed unavailable for target height
- **ERR-INVALID-STATE** (u409): randomness not available yet
- **ERR-TOO-EARLY** (u410): not reached target height in NEXT-TENURE mode
- **ERR-ZERO-MAX** (u411): `max=0` for range function
- **ERR-INVALID-MODE** (u412): mode is not FAST/NEXT-TENURE

### rng-operator-v1

User-facing operator wrapper: submits requests to core, stores resolved randomness, exposes helper functions.

#### Read-Only Functions

**get-owner**
- Returns current contract owner.

**get-last-request-id**
- Returns last request ID created via operator.

**get-last-random**
- Returns last received randomness value.

**get-rng-core**
- Returns active core contract principal.

**get-result** `(request-id uint)`
- Returns result record or `ERR-REQUEST-NOT-FOUND (u502)`.

**get-result-in-range** `(request-id uint) (max uint)`
- Returns `randomness mod max`.
- Fails with `u502/u504/u505`.

#### Admin Functions (owner-only)

**transfer-ownership** `(new-owner principal)`
- Transfers owner role.

**set-rng-core** `(new-core principal)`
- Switches active core contract.

#### Public Flow

**request-rng** `(core <rng-core-trait>) (self <rng-operator-trait>) (mode uint)`
- Requests randomness with explicit mode.

**request-rng-now** `(core <rng-core-trait>) (self <rng-operator-trait>)`
- FAST path: request and finalize immediately when possible.

**request-rng-next-tenure** `(core <rng-core-trait>) (self <rng-operator-trait>)`
- NEXT-TENURE request path.

**finalize-request** `(request-id uint) (core <rng-core-trait>) (self <rng-operator-trait>)`
- Finalizes pending request.

**receive-randomness** `(request-id uint) (randomness uint)`
- Core callback that stores resolved randomness.

#### Error Codes

- **ERR-NOT-AUTHORIZED** (u501): caller is not contract owner
- **ERR-REQUEST-NOT-FOUND** (u502): request is missing in operator storage
- **ERR-ALREADY-RESOLVED** (u503): randomness already stored for request
- **ERR-INVALID-STATE** (u504): randomness not resolved yet
- **ERR-ZERO-MAX** (u505): `max=0` for range function
- **ERR-INVALID-MODE** (u506): mode is not FAST/NEXT-TENURE
- **ERR-INVALID-CORE** (u507): passed core does not match configured `rng-core`

All contracts target **Clarity 4** / **Epoch 3.3**.

## Architecture

```
Caller → rng-operator-v1 → rng-core-v1 → VRF seed → sha512/256 hash chain → uint
                ↑                  ↓
          stores result     callback: receive-randomness
```

## Tests

53 tests across 3 test files. Run with `npm test`.

### rng-core-v1.test.ts (25 tests)

- **initial state**: deployer is owner, requests enabled, `last-request-id=0`, operators/requesters not allowed
- **read-only guards**: unknown request/result checks, range guard with `max=0`
- **allowlists**: owner allow/revoke for operators and requesters, non-owner restrictions
- **requests toggle**: owner disable/re-enable flow, non-owner rejected
- **request-randomness guards**: disabled mode, invalid modes, tx-sender/operator mismatch
- **finalize-randomness guards**: reject non-existent request
- **ownership transfer**: owner handover, old owner lockout, new owner admin access

### rng-operator-v1.test.ts (25 tests)

- **initial state**: deployer owner, `last-request-id=0`, `last-random=0`, default core points to `.rng-core-v1`
- **read-only guards**: unknown result checks and `max=0` range guard
- **set-rng-core**: owner can update, non-owner blocked
- **receive-randomness**: rejects unknown request IDs
- **request flow**: validates wrong core handling, invalid mode handling, and core error propagation
- **ownership transfer**: non-owner blocked, owner transfer succeeds, permissions switch correctly

### repo-integration.test.ts (3 tests)

- **module wiring smoke**: checks RNG and Strike read-only entry points are callable in one simnet run
- **default config smoke**: verifies core defaults (`get-min-token-limit`, `get-rng-core`) are returned as expected
- **Duel / Skate wiring smoke**: checks `get-current-season` and `get-max-supply` in the same simnet run

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).

---

# Made with :heart: by the Skullcoin Labs