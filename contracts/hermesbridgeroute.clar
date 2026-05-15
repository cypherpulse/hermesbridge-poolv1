;; ================================================
;; Hermes Bridge Pool
;; Simple STX Pool - Users send STX, Owner manages
;; ================================================

(define-constant ERR_INVALID_AMOUNT (err u101))
(define-constant ERR_NOT_OWNER      (err u102))
(define-constant ERR_NO_DEPOSIT     (err u103))
(define-constant ERR_PAUSED         (err u104))
(define-constant ERR_INVALID_OWNER  (err u105))

(define-constant CONTRACT_PRINCIPAL .hermesbridgepoolv1)

;; Data
(define-map deposits principal uint)           ;; Track user deposits
(define-data-var total-deposited uint u0)
(define-data-var paused bool false)
(define-data-var pool-owner principal tx-sender)

;; ===================== HELPERS =====================
(define-private (assert-not-paused)
  (begin
    (asserts! (not (var-get paused)) ERR_PAUSED)
    (ok true)))

(define-private (assert-owner)
  (begin
    (asserts! (is-eq tx-sender (var-get pool-owner)) ERR_NOT_OWNER)
    (ok true)))

;; ===================== SEND TO ROUTE (Deposit) =====================
(define-public (send-to-route (amount uint))
  (begin
    (try! (assert-not-paused))
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)

    (try! (stx-transfer? amount tx-sender CONTRACT_PRINCIPAL))

    (map-set deposits tx-sender 
      (+ (default-to u0 (map-get? deposits tx-sender)) amount))

    (var-set total-deposited (+ (var-get total-deposited) amount))

    (print {event: "send-to-route", user: tx-sender, amount: amount})
    (ok true)
  )
)

;; ===================== OWNER WITHDRAW =====================
(define-public (owner-withdraw (amount uint))
  (begin
    (try! (assert-owner))
    (asserts! (> amount u0) ERR_INVALID_AMOUNT)
    (asserts! (<= amount (var-get total-deposited)) ERR_INVALID_AMOUNT)

    (as-contract (try! (stx-transfer? amount tx-sender (var-get pool-owner))))

    (var-set total-deposited (- (var-get total-deposited) amount))

    (print {event: "owner-withdraw", amount: amount})
    (ok true)
  )
)

;; ===================== OWNER EMERGENCY DRAIN (All) =====================
(define-public (emergency-drain)
  (begin
    (try! (assert-owner))
    (let ((balance (stx-get-balance CONTRACT_PRINCIPAL)))
      (as-contract (try! (stx-transfer? balance tx-sender (var-get pool-owner))))
      (var-set total-deposited u0)
      (print {event: "emergency-drain", amount: balance})
      (ok balance)
    )
  )
)

;; ===================== OWNER MANAGEMENT =====================
(define-public (set-owner (new-owner principal))
  (begin
    (try! (assert-owner))
    (asserts! (not (is-eq new-owner (var-get pool-owner))) ERR_INVALID_OWNER)
    (asserts! (not (is-eq new-owner CONTRACT_PRINCIPAL)) ERR_INVALID_OWNER)
    (var-set pool-owner new-owner)
    (print {event: "set-owner", old-owner: tx-sender, new-owner: new-owner})
    (ok true)
  )
)

(define-public (pause)
  (begin
    (try! (assert-owner))
    (var-set paused true)
    (print {event: "pause", by: tx-sender})
    (ok true)
  )
)

(define-public (unpause)
  (begin
    (try! (assert-owner))
    (var-set paused false)
    (print {event: "unpause", by: tx-sender})
    (ok true)
  )
)

;; ===================== READ-ONLY =====================
(define-read-only (get-user-deposit (user principal))
  (ok (default-to u0 (map-get? deposits user))))

(define-read-only (get-total-deposited)
  (ok (var-get total-deposited)))

(define-read-only (get-owner)
  (ok (var-get pool-owner)))

(define-read-only (get-paused)
  (ok (var-get paused)))