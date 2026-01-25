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
(define-constant ERR-INVALID-MODE (err u109))
(define-constant ERR-CANNOT-CANCEL (err u110))

;; Variables
(define-data-var sale-active bool false)
(define-data-var session-counter uint u0)
(define-data-var min-token-limit uint u1000000)
(define-data-var total-fees uint u0)

;; Storage
(define-map sessions 
  (buff 32) 
  {
    session-id: (buff 32),
    mode: (string-ascii 20),
    creator: principal,
    bet: uint,
    opponent: (optional principal),
    created-at: uint,
    currency-type: (string-ascii 4)
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

;; Deposit sBTC to contract (only contract owner)
(define-public (deposit-sbtc (amount uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer amount tx-sender current-contract (some 0x)))
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

;; Withdrawal sBTC from contract (only contract owner)
(define-public (withdraw-sbtc (amount uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (>= (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token get-balance current-contract)) amount) ERR-INSUFFICIENT-BALANCE)
    (unwrap! (as-contract? ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token" amount))
      (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer amount tx-sender CONTRACT-OWNER (some 0x)))
    ) ERR-NOT-AUTHORIZED)
    (ok true)
  ))

;; Withdrawal accumulated fees (only contract owner)
(define-public (withdraw-fees (amount uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (>= (var-get total-fees) amount) ERR-INSUFFICIENT-BALANCE)
    (var-set total-fees (- (var-get total-fees) amount))
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
    (asserts! (or (is-eq mode "PvP") (or (is-eq mode "PvE") (is-eq mode "Tournament"))) ERR-INVALID-MODE)
    (asserts! (>= amount (var-get min-token-limit)) ERR-AMOUNT-TOO-LOW)
    (try! (has-soul-nft tx-sender))
    (asserts! (unwrap! (can-use-nft nft-id tx-sender) ERR-NFT-ON-COOLDOWN) ERR-NFT-ON-COOLDOWN)
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
          created-at: stacks-block-time,
          currency-type: "STX"
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
    (asserts! (or (is-eq mode "PvP") (or (is-eq mode "PvE") (is-eq mode "Tournament"))) ERR-INVALID-MODE)
    (asserts! (>= amount (var-get min-token-limit)) ERR-AMOUNT-TOO-LOW)
    (try! (has-soul-nft tx-sender))
    (asserts! (unwrap! (can-use-nft nft-id tx-sender) ERR-NFT-ON-COOLDOWN) ERR-NFT-ON-COOLDOWN)
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
          created-at: stacks-block-time,
          currency-type: "STX"
        })
        (random-hash (hash160 (concat 
          (concat (unwrap-panic (to-consensus-buff? stacks-block-time))
                  (unwrap-panic (to-consensus-buff? counter)))
          (unwrap-panic (contract-hash? .strike-core)))))
      )
      (map-set sessions session-id session-data)
      (var-set session-counter (+ counter u1))
      (print session-data)
      (try! (approve-session-internal session-id amount))
      (try! (finalize-session session-id random-hash tx-sender))
      (ok session-id)
    )
  )
)
;; Create a new session with sBTC
(define-public (create-session-with-sbtc (nft-id uint) (mode (string-ascii 20)) (amount uint))
  (begin
    (asserts! (or (is-eq mode "PvP") (or (is-eq mode "PvE") (is-eq mode "Tournament"))) ERR-INVALID-MODE)
    (asserts! (>= amount (var-get min-token-limit)) ERR-AMOUNT-TOO-LOW)
    (try! (has-soul-nft tx-sender))
    (asserts! (unwrap! (can-use-nft nft-id tx-sender) ERR-NFT-ON-COOLDOWN) ERR-NFT-ON-COOLDOWN)
    (try! (contract-call? .soul-nft update-last-used nft-id))
    (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer amount tx-sender current-contract (some 0x)))
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
          created-at: stacks-block-time,
          currency-type: "sBTC"
        })
      )
      (map-set sessions session-id session-data)
      (var-set session-counter (+ counter u1))
      (print session-data)
      (ok session-id)
    )
  )
)
;; Create a session and auto-finalize with contract as opponent (using sBTC)
(define-public (create-session-by-default-with-sbtc (nft-id uint) (mode (string-ascii 20)) (amount uint))
  (begin
    (asserts! (or (is-eq mode "PvP") (or (is-eq mode "PvE") (is-eq mode "Tournament"))) ERR-INVALID-MODE)
    (asserts! (>= amount (var-get min-token-limit)) ERR-AMOUNT-TOO-LOW)
    (try! (has-soul-nft tx-sender))
    (asserts! (unwrap! (can-use-nft nft-id tx-sender) ERR-NFT-ON-COOLDOWN) ERR-NFT-ON-COOLDOWN)
    (try! (contract-call? .soul-nft update-last-used nft-id))
    (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer amount tx-sender current-contract (some 0x)))
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
          created-at: stacks-block-time,
          currency-type: "sBTC"
        })
        (random-hash (hash160 (concat 
          (concat (unwrap-panic (to-consensus-buff? stacks-block-time))
                  (unwrap-panic (to-consensus-buff? counter)))
          (unwrap-panic (contract-hash? .strike-core)))))
      )
      (map-set sessions session-id session-data)
      (var-set session-counter (+ counter u1))
      (print session-data)
      (try! (approve-session-internal-sbtc session-id amount))
      (try! (finalize-session-sbtc session-id random-hash tx-sender))
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
      (creator (get creator session))
      (opponent (get opponent session))
      (updated-session (merge session { opponent: (some tx-sender) }))
    )
    (asserts! (is-none opponent) ERR-SESSION-ALREADY-FINALIZED)
    (asserts! (not (is-eq tx-sender creator)) ERR-NOT-AUTHORIZED)
    (try! (has-soul-nft tx-sender))
    (asserts! (unwrap! (can-use-nft nft-id tx-sender) ERR-NFT-ON-COOLDOWN) ERR-NFT-ON-COOLDOWN)
    (try! (stx-transfer? bet tx-sender current-contract))
    (try! (contract-call? .soul-nft update-last-used nft-id))
    (map-set sessions session-id updated-session)
    (ok true)
  )
)

;; Approve and join a session (using sBTC)
(define-public (approve-session-with-sbtc (nft-id uint) (session-id (buff 32)))
  (let
    (
      (session (unwrap! (map-get? sessions session-id) ERR-SESSION-NOT-FOUND))
      (bet (get bet session))
      (creator (get creator session))
      (opponent (get opponent session))
      (updated-session (merge session { opponent: (some tx-sender) }))
    )
    (asserts! (is-none opponent) ERR-SESSION-ALREADY-FINALIZED)
    (asserts! (not (is-eq tx-sender creator)) ERR-NOT-AUTHORIZED)
    (try! (has-soul-nft tx-sender))
    (asserts! (unwrap! (can-use-nft nft-id tx-sender) ERR-NFT-ON-COOLDOWN) ERR-NFT-ON-COOLDOWN)
    (try! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer bet tx-sender current-contract (some 0x)))
    (try! (contract-call? .soul-nft update-last-used nft-id))
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
      ;; For PvE sessions (opponent = contract), pot is just bet, not bet * 2
      (is-pve (match opponent opp (is-eq opp current-contract) false))
      (total-pot (if is-pve bet (* bet u2)))
      (reward (/ (* total-pot u90) u100))
      (fee (- total-pot reward))
      (is-valid-caller (or (is-eq tx-sender creator)
                           (match opponent
                             opp (is-eq tx-sender opp)
                             false)))
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
    (asserts! is-valid-caller ERR-NOT-AUTHORIZED)
    (asserts! is-valid-winner ERR-INVALID-WINNER)
    (asserts! (>= (stx-get-balance current-contract) reward) ERR-INSUFFICIENT-BALANCE)
    (var-set total-fees (+ (var-get total-fees) fee))
    (map-set finalized-sessions session-id finalize-data)
    (try! (send-stx-to-winner winner reward))
    (print finalize-data)
    (ok true)
  )
)

;; Finalize a session (sBTC version)
(define-public (finalize-session-sbtc (session-id (buff 32)) (resulthash (buff 32)) (winner principal))
  (let 
    (
      (session (unwrap! (map-get? sessions session-id) ERR-SESSION-NOT-FOUND))
      (already-finalized (map-get? finalized-sessions session-id))
      (creator (get creator session))
      (opponent (get opponent session))
      (bet (get bet session))
      ;; For PvE sessions (opponent = contract), pot is just bet, not bet * 2
      (is-pve (match opponent opp (is-eq opp current-contract) false))
      (total-pot (if is-pve bet (* bet u2)))
      (reward (/ (* total-pot u90) u100))
      (fee (- total-pot reward))
      (is-valid-caller (or (is-eq tx-sender creator)
                           (match opponent
                             opp (is-eq tx-sender opp)
                             false)))
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
    (asserts! is-valid-caller ERR-NOT-AUTHORIZED)
    (asserts! is-valid-winner ERR-INVALID-WINNER)
    (asserts! (>= (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token get-balance current-contract)) reward) ERR-INSUFFICIENT-BALANCE)
    (var-set total-fees (+ (var-get total-fees) fee))
    (map-set finalized-sessions session-id finalize-data)
    (try! (send-sbtc-to-winner winner reward))
    (print finalize-data)
    (ok true)
  )
)

;; Cancel a session and refund STX
(define-public (cancel-session (session-id (buff 32)))
  (let 
    (
      (session (unwrap! (map-get? sessions session-id) ERR-SESSION-NOT-FOUND))
      (creator (get creator session))
      (opponent (get opponent session))
      (bet (get bet session))
      (already-finalized (map-get? finalized-sessions session-id))
    )
    (asserts! (is-eq tx-sender creator) ERR-NOT-AUTHORIZED)
    (asserts! (is-none already-finalized) ERR-SESSION-ALREADY-FINALIZED)
    (asserts! (is-none opponent) ERR-CANNOT-CANCEL)
    (unwrap! (as-contract? ((with-stx bet))
      (unwrap! (stx-transfer? bet current-contract creator) ERR-INSUFFICIENT-BALANCE)
    ) ERR-INSUFFICIENT-BALANCE)
    (map-delete sessions session-id)
    (print { event: "session-cancelled", session-id: session-id, refunded: bet })
    (ok true)
  )
)

;; Cancel a session and refund sBTC
(define-public (cancel-session-with-sbtc (session-id (buff 32)))
  (let 
    (
      (session (unwrap! (map-get? sessions session-id) ERR-SESSION-NOT-FOUND))
      (creator (get creator session))
      (opponent (get opponent session))
      (bet (get bet session))
      (already-finalized (map-get? finalized-sessions session-id))
    )
    (asserts! (is-eq tx-sender creator) ERR-NOT-AUTHORIZED)
    (asserts! (is-none already-finalized) ERR-SESSION-ALREADY-FINALIZED)
    (asserts! (is-none opponent) ERR-CANNOT-CANCEL)
    (unwrap! (as-contract? ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token" bet))
      (unwrap! (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer bet current-contract creator (some 0x)) ERR-INSUFFICIENT-BALANCE)
    ) ERR-INSUFFICIENT-BALANCE)
    (map-delete sessions session-id)
    (print { event: "session-cancelled-sbtc", session-id: session-id, refunded: bet })
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
(define-read-only (can-use-nft (nft-id uint) (owner principal))
  (let 
    (
      (nft-owner-opt (unwrap! (contract-call? .soul-nft get-owner nft-id) (err false)))
      (last-used-opt (unwrap! (contract-call? .soul-nft get-last-used nft-id) (err false)))
    )
    (match nft-owner-opt
      nft-owner 
        (if (is-eq nft-owner owner)
          (match last-used-opt
            last-used-time (ok (>= (- stacks-block-time last-used-time) u86400))
            (ok true))
          (err false))
      (err false)
    )
  ))

;; Get total accumulated fees
(define-read-only (get-total-fees)
  (var-get total-fees))

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

;; Internal - Send sBTC tokens to winner player
(define-private (send-sbtc-to-winner (player principal) (amount uint))
  (begin
    (unwrap! (as-contract? ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token" amount))
      (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer amount tx-sender player (some 0x)))
    ) ERR-NOT-AUTHORIZED)
    (ok true)
  ))

;; Internal - Approve session without NFT checks (for auto-finalization)
(define-private (approve-session-internal (session-id (buff 32)) (bet uint))
  (let
    (
      (session (unwrap! (map-get? sessions session-id) ERR-SESSION-NOT-FOUND))
      (updated-session (merge session { opponent: (some current-contract) }))
    )
    (map-set sessions session-id updated-session)
    (ok true)
  )
)

;; Internal - Approve session with sBTC without NFT checks (for auto-finalization)
(define-private (approve-session-internal-sbtc (session-id (buff 32)) (bet uint))
  (let
    (
      (session (unwrap! (map-get? sessions session-id) ERR-SESSION-NOT-FOUND))
      (updated-session (merge session { opponent: (some current-contract) }))
    )
    (map-set sessions session-id updated-session)
    (ok true)
  )
)

;; Register this contract as allowed to mint
(unwrap-panic (as-contract? ((with-all-assets-unsafe))
  (unwrap-panic (contract-call? .soul-nft set-mint-address))
))