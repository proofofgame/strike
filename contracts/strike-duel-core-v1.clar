;; Skullcoin | Strike | Duel Creator + Skate Claim | v1.0.0-rc1
;; Player 1 creates the Duel and later claims the Skate.
;; Player 2 and all combat rounds remain off-chain/server-authoritative.

;; Errors
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-CREATE-CLOSED (err u101))
(define-constant ERR-CLAIM-CLOSED (err u102))
(define-constant ERR-DUEL-EXISTS (err u103))
(define-constant ERR-DUEL-NOT-FOUND (err u104))
(define-constant ERR-DUEL-CANCELLED (err u105))
(define-constant ERR-DUEL-ALREADY-CLAIMED (err u106))
(define-constant ERR-SEASON-ALREADY-CLAIMED (err u107))
(define-constant ERR-VOUCHER-EXPIRED (err u108))
(define-constant ERR-INVALID-VOUCHER (err u109))
(define-constant ERR-INVALID-DUEL-ID (err u110))
(define-constant ERR-INVALID-RULESET (err u111))
(define-constant ERR-INVALID-SEASON (err u112))
(define-constant ERR-DUEL-ALREADY-CANCELLED (err u113))
(define-constant ERR-INVALID-SIGNER (err u114))
(define-constant ERR-NO-PENDING-OWNER (err u115))
(define-constant ERR-INVALID-OWNER (err u116))

(define-constant ZERO-BUFF-32 0x0000000000000000000000000000000000000000000000000000000000000000)
(define-constant ZERO-BUFF-33 0x000000000000000000000000000000000000000000000000000000000000000000)

;; Two-step ownership transfer prevents permanent loss from an address typo.
;; Mainnet should still deploy from the intended Skullcoin admin/multisig.
(define-data-var contract-owner principal tx-sender)
(define-data-var pending-owner (optional principal) none)

;; The backend public key is deliberately unset at deployment. The owner must
;; install the production completion-voucher signer before enabling claims.
(define-data-var reward-signer-pubkey (buff 33)
  0x000000000000000000000000000000000000000000000000000000000000000000)

(define-data-var create-active bool false)
(define-data-var claim-active bool false)
(define-data-var current-season uint u1)
(define-data-var current-ruleset uint u1)
(define-data-var duel-count uint u0)
(define-data-var skate-claim-count uint u0)

(define-map duels
  (buff 32)
  {
    creator: principal,
    ruleset: uint,
    season: uint,
    created-at: uint,
    cancelled: bool
  })

;; Both maps are required. A transferred Skate never re-opens eligibility.
(define-map claimed-duels (buff 32) bool)
(define-map claimed-seasons { player: principal, season: uint } bool)

(define-private (is-owner)
  (is-eq tx-sender (var-get contract-owner)))

(define-private (is-valid-duel-id (duel-id (buff 32)))
  (and
    (is-eq (len duel-id) u32)
    (not (is-eq duel-id ZERO-BUFF-32))))

(define-read-only (get-contract-owner)
  (var-get contract-owner))

(define-read-only (get-pending-owner)
  (var-get pending-owner))

(define-read-only (get-duel (duel-id (buff 32)))
  (map-get? duels duel-id))

(define-read-only (get-duel-count)
  (var-get duel-count))

(define-read-only (get-skate-claim-count)
  (var-get skate-claim-count))

(define-read-only (get-current-season)
  (var-get current-season))

(define-read-only (get-current-ruleset)
  (var-get current-ruleset))

(define-read-only (is-duel-claimed (duel-id (buff 32)))
  (default-to false (map-get? claimed-duels duel-id)))

(define-read-only (is-season-claimed (player principal) (season uint))
  (default-to false (map-get? claimed-seasons { player: player, season: season })))

(define-read-only (is-create-active)
  (var-get create-active))

(define-read-only (is-claim-active)
  (var-get claim-active))

(define-read-only (get-reward-signer)
  (var-get reward-signer-pubkey))

;; Canonical voucher hash. The backend can call this read-only function and sign
;; the returned 32 bytes, avoiding any cross-language serialization ambiguity.
;; Domain separation binds the voucher to this action, chain, and contract.
(define-read-only (get-claim-hash
    (duel-id (buff 32))
    (creator principal)
    (season uint)
    (expires-at uint))
  (sha256
    (unwrap-panic
      (to-consensus-buff? {
        action: "claim-skate-v1",
        chain-id: chain-id,
        contract: current-contract,
        creator: creator,
        duel-id: duel-id,
        expires-at: expires-at,
        season: season
      }))))

(define-private (valid-voucher
    (duel-id (buff 32))
    (creator principal)
    (season uint)
    (expires-at uint)
    (signature (buff 64)))
  (secp256k1-verify
    (get-claim-hash duel-id creator season expires-at)
    signature
    (var-get reward-signer-pubkey)))

;; --- Owner administration ---

(define-public (propose-ownership (new-owner principal))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (asserts! (not (is-eq new-owner (var-get contract-owner))) ERR-INVALID-OWNER)
    (var-set pending-owner (some new-owner))
    (print { event: "duel-ownership-proposed", current-owner: tx-sender, pending-owner: new-owner })
    (ok true)))

(define-public (accept-ownership)
  (match (var-get pending-owner)
    new-owner
      (begin
        (asserts! (is-eq tx-sender new-owner) ERR-NOT-AUTHORIZED)
        (let ((previous-owner (var-get contract-owner)))
          (var-set contract-owner new-owner)
          (var-set pending-owner none)
          (print { event: "duel-ownership-transferred", previous-owner: previous-owner, new-owner: new-owner })
          (ok true)))
    ERR-NO-PENDING-OWNER))

(define-public (cancel-ownership-transfer)
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (var-set pending-owner none)
    (ok true)))

(define-public (set-create-active (active bool))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (var-set create-active active)
    (print { event: "duel-create-status", active: active })
    (ok true)))

(define-public (set-claim-active (active bool))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (var-set claim-active active)
    (print { event: "duel-claim-status", active: active })
    (ok true)))

(define-public (set-reward-signer (new-pubkey (buff 33)))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (asserts!
      (and
        (is-eq (len new-pubkey) u33)
        (not (is-eq new-pubkey ZERO-BUFF-33)))
      ERR-INVALID-SIGNER)
    (var-set reward-signer-pubkey new-pubkey)
    (print { event: "duel-reward-signer-set", pubkey-hash: (hash160 new-pubkey) })
    (ok true)))

(define-public (set-current-season (new-season uint))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (asserts! (> new-season (var-get current-season)) ERR-INVALID-SEASON)
    (var-set current-season new-season)
    (print { event: "duel-season-set", season: new-season })
    (ok true)))

(define-public (set-current-ruleset (new-ruleset uint))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (asserts! (> new-ruleset u0) ERR-INVALID-RULESET)
    (var-set current-ruleset new-ruleset)
    (print { event: "duel-ruleset-set", ruleset: new-ruleset })
    (ok true)))

;; --- Player 1 flow ---

;; Public wallet UX label: CREATE DUEL.
;; duel-id is a server-generated 32-byte commitment, never the raw invite secret.
(define-public (create-duel (duel-id (buff 32)))
  (let (
      (ruleset (var-get current-ruleset))
      (season (var-get current-season))
      (duel {
      creator: tx-sender,
      ruleset: ruleset,
      season: season,
      created-at: stacks-block-height,
      cancelled: false
    }))
    (asserts! (var-get create-active) ERR-CREATE-CLOSED)
    (asserts! (is-valid-duel-id duel-id) ERR-INVALID-DUEL-ID)
    (asserts! (map-insert duels duel-id duel) ERR-DUEL-EXISTS)
    (var-set duel-count (+ (var-get duel-count) u1))
    (print (merge duel {
      event: "duel-created",
      duel-id: duel-id
    }))
    (ok duel-id)))

(define-public (cancel-duel (duel-id (buff 32)))
  (let ((duel (unwrap! (map-get? duels duel-id) ERR-DUEL-NOT-FOUND)))
    (asserts! (is-eq tx-sender (get creator duel)) ERR-NOT-AUTHORIZED)
    (asserts! (not (get cancelled duel)) ERR-DUEL-ALREADY-CANCELLED)
    (asserts! (not (is-duel-claimed duel-id)) ERR-DUEL-ALREADY-CLAIMED)
    (map-set duels duel-id (merge duel { cancelled: true }))
    (print { event: "duel-cancelled", duel-id: duel-id, creator: tx-sender })
    (ok true)))

;; Public wallet UX label: CLAIM SKATE.
;; The backend signs only after the off-chain battle satisfies completion rules.
(define-public (claim-skate
    (duel-id (buff 32))
    (expires-at uint)
    (signature (buff 64)))
  (let (
      (duel (unwrap! (map-get? duels duel-id) ERR-DUEL-NOT-FOUND))
      (creator (get creator duel))
      (season (get season duel)))
    (asserts! (var-get claim-active) ERR-CLAIM-CLOSED)
    (asserts! (is-eq tx-sender creator) ERR-NOT-AUTHORIZED)
    (asserts! (not (get cancelled duel)) ERR-DUEL-CANCELLED)
    (asserts! (not (is-duel-claimed duel-id)) ERR-DUEL-ALREADY-CLAIMED)
    (asserts! (not (is-season-claimed creator season)) ERR-SEASON-ALREADY-CLAIMED)
    (asserts! (>= expires-at stacks-block-height) ERR-VOUCHER-EXPIRED)
    (asserts! (valid-voucher duel-id creator season expires-at signature) ERR-INVALID-VOUCHER)

    ;; These writes and the nested mint are atomic. A failed mint rolls them back.
    (map-set claimed-duels duel-id true)
    (map-set claimed-seasons { player: creator, season: season } true)
    (let ((token-id (try! (contract-call? .skate-gear-v1 mint creator))))
      (var-set skate-claim-count (+ (var-get skate-claim-count) u1))
      (print {
        event: "skate-claimed",
        duel-id: duel-id,
        creator: creator,
        season: season,
        token-id: token-id
      })
      (ok token-id))))
