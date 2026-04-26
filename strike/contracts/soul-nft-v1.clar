;; Soul NFT | Strike | Soul NFT | v.1.0.0
;; skullco.in

;; Traits
(impl-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)
(use-trait commission-trait 'SP2ESPYE74G94D2HD9X470426W1R6C2P22B4Z1Q5.commission-trait.commission)

;; Define NFT token
(define-non-fungible-token soul-nft uint)

;; Storage
(define-map token-count principal uint)
(define-map market uint {price: uint, commission: principal})
(define-map mint-address bool principal)
(define-map nft-equipment uint {
  slot-1: (optional uint),
  slot-2: (optional uint),
  slot-3: (optional uint),
  slot-4: (optional uint),
  slot-5: (optional uint),
  last-used: uint
})

;; Constants and Errors
(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-SOLD-OUT (err u200))
(define-constant ERR-WRONG-COMMISSION (err u201))
(define-constant ERR-NOT-AUTHORIZED (err u202))
(define-constant ERR-NOT-FOUND (err u203))
(define-constant ERR-METADATA-FROZEN (err u204))
(define-constant ERR-MINT-ALREADY-SET (err u205))
(define-constant ERR-LISTING (err u206))
(define-constant ERR-INVALID-SLOT (err u207))

;; Variables
(define-data-var last-id uint u0)
(define-data-var mint-limit uint u10000)
(define-data-var metadata-frozen bool false)
(define-data-var base-uri (string-ascii 80) "ipfs://CID/")

;; Get balance
(define-read-only (get-balance (account principal))
  (default-to u0
    (map-get? token-count account)))

;; Transfer token to a specified principal
(define-public (transfer (id uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (asserts! (is-none (map-get? market id)) ERR-LISTING)
    (try! (trnsfr id sender recipient))
    (ok true)))

;; Get the owner of the specified token ID
(define-read-only (get-owner (id uint))
  (ok (nft-get-owner? soul-nft id)))

;; Get the last token ID
(define-read-only (get-last-token-id)
  (ok (var-get last-id)))

;; Get the token URI
(define-read-only (get-token-uri (token-id uint))
  (ok (some (concat (concat (var-get base-uri) "{id}") ".json"))))

;; Get the mint limit
(define-read-only (get-mint-limit)
  (ok (var-get mint-limit)))

;; Change the base uri (only contract owner)
(define-public (set-base-uri (new-base-uri (string-ascii 80)))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (not (var-get metadata-frozen)) ERR-METADATA-FROZEN)
    (var-set base-uri new-base-uri)
    (ok true)))

;; Set mint limit (only contract owner)
(define-public (set-mint-limit (limit uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (var-set mint-limit limit)
    (ok true)))

;; Freeze metadata
(define-public (freeze-metadata)
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (var-set metadata-frozen true)
    (ok true)))

;; Manage the mint
(define-private (called-from-mint)
  (let ((the-mint
          (unwrap! (map-get? mint-address true)
                    false)))
    (is-eq contract-caller the-mint)))

;; Set mint address
(define-public (set-mint-address)
  (let ((the-mint (map-get? mint-address true)))
    (asserts! (and (is-none the-mint)
              (map-insert mint-address true tx-sender))
                ERR-MINT-ALREADY-SET)
    (ok tx-sender)))

;; Mint new NFT (called from mint contract)
(define-public (mint (new-owner principal))
    (let ((next-id (+ u1 (var-get last-id))))
      (asserts! (called-from-mint) ERR-NOT-AUTHORIZED)
      (asserts! (< (var-get last-id) (var-get mint-limit)) ERR-SOLD-OUT)
      (match (nft-mint? soul-nft next-id new-owner)
        success
        (let
        ((current-balance (get-balance new-owner)))
          (begin
            (var-set last-id next-id)
            (map-set token-count
              new-owner
              (+ current-balance u1)
            )
            (ok true)))
        error (err (* error u10002)))))

;; Non-custodial marketplace
(define-private (trnsfr (id uint) (sender principal) (recipient principal))
  (match (nft-transfer? soul-nft id sender recipient)
        success
          (let
            ((sender-balance (get-balance sender))
            (recipient-balance (get-balance recipient)))
              (map-set token-count
                    sender
                    (- sender-balance u1))
              (map-set token-count
                    recipient
                    (+ recipient-balance u1))
              (ok success))
        error (err error)))

(define-private (is-sender-owner (id uint))
  (let ((owner (unwrap! (nft-get-owner? soul-nft id) false)))
    (or (is-eq tx-sender owner) (is-eq contract-caller owner))))

(define-read-only (get-listing-in-ustx (id uint))
  (map-get? market id))

(define-public (list-in-ustx (id uint) (price uint) (comm <commission-trait>))
  (let ((listing  {price: price, commission: (contract-of comm)}))
    (asserts! (is-sender-owner id) ERR-NOT-AUTHORIZED)
    (map-set market id listing)
    (print (merge listing {a: "list-in-ustx", id: id}))
    (ok true)))

(define-public (unlist-in-ustx (id uint))
  (begin
    (asserts! (is-sender-owner id) ERR-NOT-AUTHORIZED)
    (map-delete market id)
    (print {a: "unlist-in-ustx", id: id})
    (ok true)))
	
(define-public (buy-in-ustx (id uint) (comm <commission-trait>))
  (let ((owner (unwrap! (nft-get-owner? soul-nft id) ERR-NOT-FOUND))
      (listing (unwrap! (map-get? market id) ERR-LISTING))
      (price (get price listing)))
    (asserts! (is-eq (contract-of comm) (get commission listing)) ERR-WRONG-COMMISSION)
    (try! (stx-transfer? price tx-sender owner))
    (try! (contract-call? comm pay id price))
    (try! (trnsfr id owner tx-sender))
    (map-delete market id)
    (print {a: "buy-in-ustx", id: id})
    (ok true)))

;; Equipment Management Functions
(define-public (set-equipment (nft-id uint) (slot-1 (optional uint)) (slot-2 (optional uint)) (slot-3 (optional uint)) (slot-4 (optional uint)) (slot-5 (optional uint)))
  (let ((owner (unwrap! (nft-get-owner? soul-nft nft-id) ERR-NOT-FOUND)))
    (asserts! (is-eq tx-sender owner) ERR-NOT-AUTHORIZED)
    (ok (map-set nft-equipment nft-id {
      slot-1: slot-1,
      slot-2: slot-2,
      slot-3: slot-3,
      slot-4: slot-4,
      slot-5: slot-5,
      last-used: stacks-block-time
    }))))

(define-public (equip-slot (nft-id uint) (slot uint) (item-id (optional uint)))
  (let ((owner (unwrap! (nft-get-owner? soul-nft nft-id) ERR-NOT-FOUND))
        (current-equipment (default-to {
          slot-1: none,
          slot-2: none,
          slot-3: none,
          slot-4: none,
          slot-5: none,
          last-used: u0
        } (map-get? nft-equipment nft-id))))
    (asserts! (is-eq tx-sender owner) ERR-NOT-AUTHORIZED)
    (asserts! (and (>= slot u1) (<= slot u5)) ERR-INVALID-SLOT)
    (ok (map-set nft-equipment nft-id
      (if (is-eq slot u1)
        (merge current-equipment {slot-1: item-id})
        (if (is-eq slot u2)
          (merge current-equipment {slot-2: item-id})
          (if (is-eq slot u3)
            (merge current-equipment {slot-3: item-id})
            (if (is-eq slot u4)
              (merge current-equipment {slot-4: item-id})
              (merge current-equipment {slot-5: item-id})))))))))

(define-public (update-last-used (nft-id uint))
  (let ((owner (unwrap! (nft-get-owner? soul-nft nft-id) ERR-NOT-FOUND))
        (current-equipment (default-to {
          slot-1: none,
          slot-2: none,
          slot-3: none,
          slot-4: none,
          slot-5: none,
          last-used: u0
        } (map-get? nft-equipment nft-id))))
    (asserts! (is-eq tx-sender owner) ERR-NOT-AUTHORIZED)
    (ok (map-set nft-equipment nft-id (merge current-equipment {last-used: stacks-block-time})))))

(define-read-only (get-equipment (nft-id uint))
  (ok (map-get? nft-equipment nft-id)))

(define-read-only (get-slot (nft-id uint) (slot uint))
  (let ((equipment (map-get? nft-equipment nft-id)))
    (ok (if (is-some equipment)
      (if (is-eq slot u1)
        (get slot-1 (unwrap-panic equipment))
        (if (is-eq slot u2)
          (get slot-2 (unwrap-panic equipment))
          (if (is-eq slot u3)
            (get slot-3 (unwrap-panic equipment))
            (if (is-eq slot u4)
              (get slot-4 (unwrap-panic equipment))
              (if (is-eq slot u5)
                (get slot-5 (unwrap-panic equipment))
                none)))))
      none))))

(define-read-only (get-last-used (nft-id uint))
  (ok (match (map-get? nft-equipment nft-id)
    equipment (some (get last-used equipment))
    none)))