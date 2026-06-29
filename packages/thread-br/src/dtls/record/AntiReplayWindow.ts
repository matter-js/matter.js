/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

const WINDOW_SIZE = 64n;
const WINDOW_MASK = (1n << WINDOW_SIZE) - 1n;
const MAX_SEQ = (1n << 48n) - 1n;

/**
 * DTLS 1.2 sliding-window anti-replay tracker (RFC 6347 §4.1.2.6).
 *
 * Maintains the rightmost (highest) accepted sequence number and a 64-bit
 * bitmap of which prior numbers within the window have been seen. `check`
 * combines the "is this in-window?" / "is this fresh?" / "mark as seen" steps
 * into a single atomic update so callers can use it as a guard:
 *
 * ```ts
 * if (!window.check(seqNum)) {
 *   // discard or alert
 * }
 * ```
 *
 * Per the RFC, the window is initialised empty (no sequence numbers seen yet)
 * and the first valid record sets the rightmost edge.
 */
export class AntiReplayWindow {
    /** Highest sequence number observed so far, or `-1n` if none. */
    #rightmost = -1n;
    /**
     * Bitmap of accepted sequence numbers in the closed range [rightmost-63, rightmost].
     * Bit 0 represents `rightmost`, bit 1 represents `rightmost-1`, etc.
     */
    #window = 0n;

    /** Window size as defined by RFC 6347 §4.1.2.6 (typically 32 or 64; we use 64). */
    static readonly WINDOW_SIZE = Number(WINDOW_SIZE);

    /** Highest sequence number recorded so far, or `-1n` before the first acceptance. */
    get rightmost(): bigint {
        return this.#rightmost;
    }

    /**
     * Test+mark a sequence number. Returns `true` and records it on first sight,
     * `false` if the number is a replay or older than the trailing edge.
     *
     * Throws on a negative or out-of-48-bit input — DTLS sequence numbers are
     * 48-bit unsigned by construction; anything else is a programming error.
     */
    check(seqNum: bigint): boolean {
        if (seqNum < 0n || seqNum > MAX_SEQ) {
            throw new Error(`AntiReplayWindow: seqNum ${seqNum} out of 48-bit range`);
        }

        if (seqNum > this.#rightmost) {
            // Slide the window forward by `shift` positions and record the new rightmost.
            if (this.#rightmost >= 0n) {
                const shift = seqNum - this.#rightmost;
                if (shift >= WINDOW_SIZE) {
                    this.#window = 1n;
                } else {
                    this.#window = ((this.#window << shift) | 1n) & WINDOW_MASK;
                }
            } else {
                this.#window = 1n;
            }
            this.#rightmost = seqNum;
            return true;
        }

        const offset = this.#rightmost - seqNum;
        if (offset >= WINDOW_SIZE) {
            // Older than the trailing edge — RFC 6347 mandates discard.
            return false;
        }
        const bit = 1n << offset;
        if ((this.#window & bit) !== 0n) {
            return false;
        }
        this.#window |= bit;
        return true;
    }
}
