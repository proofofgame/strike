;; Skullcoin | Strike | S-KATE Gear NFT | v1.0.0-rc1
;; SIP-009 NFT with on-chain damaged/repaired durability.

(impl-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)

(define-non-fungible-token skate uint)

;; Errors
(define-constant ERR-NOT-AUTHORIZED (err u300))
(define-constant ERR-SOLD-OUT (err u301))
(define-constant ERR-TOKEN-NOT-FOUND (err u302))
(define-constant ERR-MINTER-NOT-SET (err u303))
(define-constant ERR-MINTER-FROZEN (err u304))
(define-constant ERR-SUPPLY-FROZEN (err u305))
(define-constant ERR-METADATA-FROZEN (err u306))
(define-constant ERR-INVALID-SUPPLY (err u307))
(define-constant ERR-ALREADY-REPAIRED (err u308))
(define-constant ERR-INVALID-PRICE (err u309))
(define-constant ERR-INVALID-RECIPIENT (err u310))
(define-constant ERR-NO-PENDING-OWNER (err u311))
(define-constant ERR-INVALID-OWNER (err u312))

;; Two-step ownership transfer prevents permanent loss from an address typo.
;; Mainnet deployment should still use the Skullcoin admin/multisig.
(define-data-var contract-owner principal tx-sender)
(define-data-var pending-owner (optional principal) none)

;; Collection and administration
(define-data-var last-id uint u0)
(define-data-var max-supply uint u500)
(define-data-var supply-frozen bool false)
;; 211 + the maximum int-to-ascii output (40) + ".json" (5) = 256,
;; the SIP-009 token URI limit.
(define-data-var metadata-base-uri (string-ascii 211) "ipfs://REPLACE_WITH_METADATA_DIRECTORY_CID/")
(define-data-var metadata-frozen bool false)
(define-data-var authorized-minter (optional principal) none)
(define-data-var minter-frozen bool false)

;; Repair is deliberately tiny for V1: 0.01 STX = 10,000 microSTX.
(define-data-var repair-price uint u10000)
(define-data-var repair-treasury principal tx-sender)
(define-data-var repair-count uint u0)
(define-data-var total-repair-fees uint u0)

;; Index/helper state
(define-map token-count principal uint)
(define-map durability uint uint)
(define-map repaired-at uint uint)

(define-private (is-owner)
  (is-eq tx-sender (var-get contract-owner)))

(define-private (is-authorized-minter)
  (match (var-get authorized-minter)
    minter (is-eq contract-caller minter)
    false))

;; --- SIP-009 read-only surface ---

(define-read-only (get-last-token-id)
  (ok (var-get last-id)))

(define-read-only (get-token-uri (token-id uint))
  (if (is-some (nft-get-owner? skate token-id))
    (ok (some
      (concat
        (concat (var-get metadata-base-uri) (int-to-ascii token-id))
        ".json")))
    (ok none)))

(define-read-only (get-owner (token-id uint))
  (ok (nft-get-owner? skate token-id)))

(define-public (transfer (token-id uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (asserts! (not (is-eq sender recipient)) ERR-INVALID-RECIPIENT)
    (try! (nft-transfer? skate token-id sender recipient))
    (map-set token-count sender (- (get-balance-internal sender) u1))
    (map-set token-count recipient (+ (get-balance-internal recipient) u1))
    (print {
      event: "skate-transfer",
      token-id: token-id,
      sender: sender,
      recipient: recipient
    })
    (ok true)))

;; --- Collection reads ---

(define-private (get-balance-internal (account principal))
  (default-to u0 (map-get? token-count account)))

(define-read-only (get-balance (account principal))
  (get-balance-internal account))

(define-read-only (get-max-supply)
  (var-get max-supply))

(define-read-only (get-metadata-base-uri)
  (var-get metadata-base-uri))

(define-read-only (get-minter)
  (var-get authorized-minter))

(define-read-only (get-contract-owner)
  (var-get contract-owner))

(define-read-only (get-pending-owner)
  (var-get pending-owner))

(define-read-only (get-durability (token-id uint))
  (if (is-some (nft-get-owner? skate token-id))
    (ok (default-to u0 (map-get? durability token-id)))
    ERR-TOKEN-NOT-FOUND))

(define-read-only (is-repaired (token-id uint))
  (match (get-durability token-id)
    current (ok (is-eq current u1))
    error-code (err error-code)))

(define-read-only (get-repaired-at (token-id uint))
  (if (is-some (nft-get-owner? skate token-id))
    (ok (map-get? repaired-at token-id))
    ERR-TOKEN-NOT-FOUND))

(define-read-only (get-repair-price)
  (var-get repair-price))

(define-read-only (get-repair-treasury)
  (var-get repair-treasury))

(define-read-only (get-repair-count)
  (var-get repair-count))

(define-read-only (get-total-repair-fees)
  (var-get total-repair-fees))

;; --- Owner administration ---

(define-public (propose-ownership (new-owner principal))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (asserts! (not (is-eq new-owner (var-get contract-owner))) ERR-INVALID-OWNER)
    (var-set pending-owner (some new-owner))
    (print { event: "skate-ownership-proposed", current-owner: tx-sender, pending-owner: new-owner })
    (ok true)))

(define-public (accept-ownership)
  (match (var-get pending-owner)
    new-owner
      (begin
        (asserts! (is-eq tx-sender new-owner) ERR-NOT-AUTHORIZED)
        (let ((previous-owner (var-get contract-owner)))
          (var-set contract-owner new-owner)
          (var-set pending-owner none)
          (print { event: "skate-ownership-transferred", previous-owner: previous-owner, new-owner: new-owner })
          (ok true)))
    ERR-NO-PENDING-OWNER))

(define-public (cancel-ownership-transfer)
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (var-set pending-owner none)
    (ok true)))

(define-public (set-minter (new-minter principal))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (asserts! (not (var-get minter-frozen)) ERR-MINTER-FROZEN)
    (var-set authorized-minter (some new-minter))
    (print { event: "skate-minter-set", minter: new-minter })
    (ok true)))

(define-public (freeze-minter)
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (asserts! (is-some (var-get authorized-minter)) ERR-MINTER-NOT-SET)
    (var-set minter-frozen true)
    (ok true)))

(define-public (set-max-supply (new-limit uint))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (asserts! (not (var-get supply-frozen)) ERR-SUPPLY-FROZEN)
    (asserts! (and (> new-limit u0) (>= new-limit (var-get last-id))) ERR-INVALID-SUPPLY)
    (var-set max-supply new-limit)
    (print { event: "skate-supply-set", max-supply: new-limit })
    (ok true)))

(define-public (freeze-supply)
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (var-set supply-frozen true)
    (ok true)))

(define-public (set-metadata-base-uri (new-base-uri (string-ascii 211)))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (asserts! (not (var-get metadata-frozen)) ERR-METADATA-FROZEN)
    (var-set metadata-base-uri new-base-uri)
    (print { event: "skate-metadata-set", base-uri: new-base-uri })
    (ok true)))

(define-public (freeze-metadata)
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (var-set metadata-frozen true)
    (ok true)))

(define-public (set-repair-price (new-price uint))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (asserts! (> new-price u0) ERR-INVALID-PRICE)
    (var-set repair-price new-price)
    (print { event: "skate-repair-price-set", price: new-price })
    (ok true)))

(define-public (set-repair-treasury (new-treasury principal))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (var-set repair-treasury new-treasury)
    (print { event: "skate-repair-treasury-set", treasury: new-treasury })
    (ok true)))

;; --- Mint and repair ---

;; Called only by strike-duel-core-v1 after a valid creator claim voucher.
;; Every Skate is minted damaged: durability 0/1.
(define-public (mint (new-owner principal))
  (let ((next-id (+ (var-get last-id) u1)))
    (asserts! (is-some (var-get authorized-minter)) ERR-MINTER-NOT-SET)
    (asserts! (is-authorized-minter) ERR-NOT-AUTHORIZED)
    (asserts! (<= next-id (var-get max-supply)) ERR-SOLD-OUT)
    (try! (nft-mint? skate next-id new-owner))
    (var-set last-id next-id)
    (map-set token-count new-owner (+ (get-balance-internal new-owner) u1))
    (map-set durability next-id u0)
    (print {
      event: "skate-minted",
      token-id: next-id,
      owner: new-owner,
      durability: u0
    })
    (ok next-id)))

;; Public wallet UX label: REPAIR SKATE.
;; The owner pays the configured STX repair price to the Skullcoin treasury.
(define-public (repair-skate (token-id uint))
  (let (
      (owner (unwrap! (nft-get-owner? skate token-id) ERR-TOKEN-NOT-FOUND))
      (current-durability (default-to u0 (map-get? durability token-id)))
      (price (var-get repair-price))
      (treasury (var-get repair-treasury)))
    (asserts! (is-eq tx-sender owner) ERR-NOT-AUTHORIZED)
    (asserts! (is-eq current-durability u0) ERR-ALREADY-REPAIRED)
    (try! (stx-transfer? price tx-sender treasury))
    (map-set durability token-id u1)
    (map-set repaired-at token-id stacks-block-height)
    (var-set repair-count (+ (var-get repair-count) u1))
    (var-set total-repair-fees (+ (var-get total-repair-fees) price))
    (print {
      event: "skate-repaired",
      token-id: token-id,
      owner: tx-sender,
      paid: price,
      durability: u1
    })
    (ok true)))
