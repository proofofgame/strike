;; Skullcoin | Strike | Core | v.1.0.0
;; skullco.in

;; Constants and Errors
(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-SALE-NOT-ACTIVE (err u101))
(define-constant ERR-DONT-HAVE-SOUL-NFT (err u102))

;; Variables
(define-data-var sale-active bool false)
(define-data-var session-counter uint u0)

;; Storage
(define-map sessions 
  (buff 32) 
  {
    session-id: (buff 32),
    mode: (string-ascii 20),
    creator: principal
  })

(define-map finalized-sessions
  (buff 32)
  {
    session-id: (buff 32),
    resulthash: (buff 32),
    winner: principal
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

;; Withdrawal STX from contract (only contract owner)
;; (define-public (withdraw-stx (amount uint))
;;   (begin
;;     (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
;;     (try! (as-contract (stx-transfer? amount tx-sender CONTRACT-OWNER)))
;;   (ok true)))

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
(define-public (create-session (mode (string-ascii 20)))
  (begin
    (try! (has-soul-nft tx-sender))
    (let 
      (
        (counter (var-get session-counter))
        (session-id (hash160 (concat (concat (unwrap-panic (to-consensus-buff? tx-sender)) 
                                             (unwrap-panic (to-consensus-buff? stacks-block-height))) 
                                     (unwrap-panic (to-consensus-buff? counter)))))
        (session-data {
          session-id: session-id,
          mode: mode,
          creator: tx-sender
        })
      )
      (map-set sessions session-id session-data)
      (var-set session-counter (+ counter u1))
      (print session-data)
      (ok session-id)
    )
  )
)

;; Finalize a session
(define-public (finalize-session (session-id (buff 32)) (resulthash (buff 32)) (winner principal))
  (let 
    (
      (finalize-data {
        session-id: session-id,
        resulthash: resulthash,
        winner: winner
      })
    )
    (map-set finalized-sessions session-id finalize-data)
    (print finalize-data)
    (ok true)
  )
)

;; Check if account has soul NFT
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

;; Internal - Mint NFT via public
(define-private (claim)
  (begin
    (asserts! (var-get sale-active) ERR-SALE-NOT-ACTIVE)
    (try! (contract-call? .soul-nft mint tx-sender))
  (ok true)))

;; Register this contract as allowed to mint
(as-contract (contract-call? .soul-nft set-mint-address))