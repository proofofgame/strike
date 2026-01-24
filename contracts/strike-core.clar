;; Skullcoin | Strike | Core | v.1.0.0
;; skullco.in

;; Constants and Errors
(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-SALE-NOT-ACTIVE (err u101))
(define-constant ERR-DONT-HAVE-SOUL-NFT (err u102))
(define-constant ERR-AMOUNT-TOO-LOW (err u103))
(define-constant ERR-SESSION-NOT-FOUND (err u104))
(define-constant ERR-INVALID-WINNER (err u105))
(define-constant ERR-SESSION-ALREADY-FINALIZED (err u106))
(define-constant ERR-INSUFFICIENT-BALANCE (err u107))
(define-constant ERR-NFT-ON-COOLDOWN (err u108))

;; Variables
(define-data-var sale-active bool false)
(define-data-var session-counter uint u0)
(define-data-var min-token-limit uint u1000000)

;; Storage
(define-map sessions 
  (buff 32) 
  {
    session-id: (buff 32),
    mode: (string-ascii 20),
    creator: principal,
    bet: uint,
    opponent: (optional principal),
    created-at: uint
  })

(define-map finalized-sessions
  (buff 32)
  {
    session-id: (buff 32),
    resulthash: (buff 32),
    winner: principal,
    reward: uint
  })

;; Check public sales active
(define-read-only (sale-enabled)
  (ok (var-get sale-active)))

;; Set public sale flag (only contract owner)
(define-public (flip-sale)
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (var-set sale-active (not (var-get sale-active)))
    (ok (var-get sale-active))))

;; Set minimum token limit (only contract owner)
(define-public (set-min-token-limit (new-limit uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (var-set min-token-limit new-limit)
    (ok true)))

;; Deposit STX to contract (only contract owner)
(define-public (deposit-stx (amount uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (try! (stx-transfer? amount tx-sender current-contract))
  (ok true)))

;; Withdrawal STX from contract (only contract owner)
(define-public (withdraw-stx (amount uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (>= (stx-get-balance current-contract) amount) ERR-INSUFFICIENT-BALANCE)
    (unwrap! (as-contract? ((with-stx amount))
      (unwrap-panic (stx-transfer? amount tx-sender CONTRACT-OWNER))
    ) ERR-NOT-AUTHORIZED)
    (ok true)
  ))

;; Claim 1 NFT
(define-public (claim-one)
  (begin
    (try! (claim))
  (ok true)))

;; Claim 5 NFT
(define-public (claim-five)
  (begin
    (try! (claim))
    (try! (claim))
    (try! (claim))
    (try! (claim))
    (try! (claim))
  (ok true)))

;; Create a new session
(define-public (create-session (nft-id uint) (mode (string-ascii 20)) (amount uint))
  (begin
    (asserts! (>= amount (var-get min-token-limit)) ERR-AMOUNT-TOO-LOW)
    (try! (has-soul-nft tx-sender))
    (asserts! (unwrap! (can-use-nft nft-id) ERR-NFT-ON-COOLDOWN) ERR-NFT-ON-COOLDOWN)
    (try! (contract-call? .soul-nft update-last-used nft-id))
    (try! (stx-transfer? amount tx-sender current-contract))
    (let 
      (
        (counter (var-get session-counter))
        (session-id (hash160 (concat (concat (unwrap-panic (to-consensus-buff? tx-sender)) 
                                             (unwrap-panic (to-consensus-buff? stacks-block-time))) 
                                     (unwrap-panic (to-consensus-buff? counter)))))
        (session-data {
          session-id: session-id,
          mode: mode,
          creator: tx-sender,
          bet: amount,
          opponent: none,
          created-at: stacks-block-time
        })
      )
      (map-set sessions session-id session-data)
      (var-set session-counter (+ counter u1))
      (print session-data)
      (ok session-id)
    )
  )
)

;; Create a session and auto-finalize with contract as opponent
(define-public (create-session-by-default (nft-id uint) (mode (string-ascii 20)) (amount uint))
  (begin
    (asserts! (>= amount (var-get min-token-limit)) ERR-AMOUNT-TOO-LOW)
    (try! (has-soul-nft tx-sender))
    (asserts! (unwrap! (can-use-nft nft-id) ERR-NFT-ON-COOLDOWN) ERR-NFT-ON-COOLDOWN)
    (try! (contract-call? .soul-nft update-last-used nft-id))
    (try! (stx-transfer? amount tx-sender current-contract))
    (let 
      (
        (counter (var-get session-counter))
        (session-id (hash160 (concat (concat (unwrap-panic (to-consensus-buff? tx-sender)) 
                                             (unwrap-panic (to-consensus-buff? stacks-block-time))) 
                                     (unwrap-panic (to-consensus-buff? counter)))))
        (session-data {
          session-id: session-id,
          mode: mode,
          creator: tx-sender,
          bet: amount,
          opponent: none,
          created-at: stacks-block-time
        })
        (random-hash (hash160 (concat 
          (concat (unwrap-panic (to-consensus-buff? stacks-block-time))
                  (unwrap-panic (to-consensus-buff? counter)))
          (unwrap-panic (contract-hash? .strike-core)))))
      )
      (map-set sessions session-id session-data)
      (var-set session-counter (+ counter u1))
      (print session-data)
      (unwrap! (as-contract? ((with-stx amount))
        (unwrap-panic (approve-session nft-id session-id))
      ) ERR-NOT-AUTHORIZED)
      (try! (finalize-session session-id random-hash tx-sender))
      (ok session-id)
    )
  )
)

;; Approve and join a session
(define-public (approve-session (nft-id uint) (session-id (buff 32)))
  (let
    (
      (session (unwrap! (map-get? sessions session-id) ERR-SESSION-NOT-FOUND))
      (bet (get bet session))
      (updated-session (merge session { opponent: (some tx-sender) }))
    )
    (try! (has-soul-nft tx-sender))
    (asserts! (unwrap! (can-use-nft nft-id) ERR-NFT-ON-COOLDOWN) ERR-NFT-ON-COOLDOWN)
    (try! (contract-call? .soul-nft update-last-used nft-id))
    (try! (stx-transfer? bet tx-sender current-contract))
    (map-set sessions session-id updated-session)
    (ok true)
  )
)

;; Finalize a session
(define-public (finalize-session (session-id (buff 32)) (resulthash (buff 32)) (winner principal))
  (let 
    (
      (session (unwrap! (map-get? sessions session-id) ERR-SESSION-NOT-FOUND))
      (already-finalized (map-get? finalized-sessions session-id))
      (creator (get creator session))
      (opponent (get opponent session))
      (bet (get bet session))
      (reward (/ (* (* bet u2) u90) u100))
      (is-valid-winner (or (is-eq winner creator) 
                           (match opponent 
                             opp (is-eq winner opp)
                             false)))
      (finalize-data {
        session-id: session-id,
        resulthash: resulthash,
        winner: winner,
        reward: reward
      })
    )
    (asserts! (is-none already-finalized) ERR-SESSION-ALREADY-FINALIZED)
    (asserts! is-valid-winner ERR-INVALID-WINNER)
    (map-set finalized-sessions session-id finalize-data)
    (try! (send-stx-to-winner winner reward))
    (print finalize-data)
    (ok true)
  )
)

;; Check if account has Soul NFT
(define-read-only (has-soul-nft (account principal))
  (let ((balance (contract-call? .soul-nft get-balance account)))
    (if (> balance u0)
      (ok true)
      ERR-DONT-HAVE-SOUL-NFT)))

;; Get session data by session-id
(define-read-only (get-session (session-id (buff 32)))
  (ok (map-get? sessions session-id)))

;; Get finalized session data by session-id
(define-read-only (get-finalized-session (session-id (buff 32)))
  (ok (map-get? finalized-sessions session-id)))

;; Check if NFT can be used (24 hours cooldown)
(define-read-only (can-use-nft (nft-id uint))
  (let ((last-used-opt (unwrap! (contract-call? .soul-nft get-last-used nft-id) (ok true))))
    (match last-used-opt
      last-used-time (ok (>= (- stacks-block-time last-used-time) u86400))
      (ok true))))

;; Internal - Mint NFT via public
(define-private (claim)
  (begin
    (asserts! (var-get sale-active) ERR-SALE-NOT-ACTIVE)
    (try! (contract-call? .soul-nft mint tx-sender))
  (ok true)))

;; Internal - Send SIP-010 tokens to winner player
(define-private (send-stx-to-winner (player principal) (amount uint))
  (begin
    (unwrap! (as-contract? ((with-stx amount))
      (unwrap-panic (stx-transfer? amount tx-sender player))
    ) ERR-NOT-AUTHORIZED)
    (ok true)
  ))

;; Register this contract as allowed to mint
(unwrap-panic (as-contract? ((with-all-assets-unsafe))
  (unwrap-panic (contract-call? .soul-nft set-mint-address))
))