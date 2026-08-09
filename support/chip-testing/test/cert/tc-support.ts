/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/main";
import type { CertNodeRef, CertStepContext } from "@matter/testing";

/**
 * Tracks commissioned node refs by role for one cert-test run and decommissions whatever's still
 * active on step failure. Each controller's own `decommission()` only removes *that controller's*
 * fabric via its own CASE session, so cleanup has to visit every role independently. Shared by
 * `TC-IDM-2.1.test.ts`/`TC-ACT-3.2.test.ts` (single "dut" role) and `TC-CADMIN-1.17.test.ts`
 * (multiple controller roles).
 */
export class CommissionedRefs<Role extends string = "dut"> {
    #refs = new Map<Role, CertNodeRef>();

    get(role: Role): CertNodeRef | undefined {
        return this.#refs.get(role);
    }

    set(role: Role, ref: CertNodeRef): void {
        this.#refs.set(role, ref);
    }

    clear(role: Role): void {
        this.#refs.delete(role);
    }

    /** Throws if `role` has no active ref — a step ran out of order relative to its commissioning step. */
    require(role: Role, what: string = role): CertNodeRef {
        const ref = this.#refs.get(role);
        if (ref === undefined) {
            throw new InternalError(`${what} has no active commissioned node ref`);
        }
        return ref;
    }

    async decommissionAll(cx: CertStepContext): Promise<void> {
        for (const [role, ref] of [...this.#refs]) {
            this.#refs.delete(role);
            try {
                await cx.controllers[role].node(ref).decommission();
            } catch (e) {
                console.warn(`Failed to decommission ${role} while cleaning up:`, e);
            }
        }
    }

    /**
     * Wraps a step so a thrown assertion still decommissions every active role before propagating —
     * the step engine (`cert-test.ts`'s `invoke`) aborts every later step without running it, so only
     * the step that actually threw gets a chance to clean up.
     */
    guarded(run: (cx: CertStepContext) => Promise<void>): (cx: CertStepContext) => Promise<void> {
        return async cx => {
            try {
                await run(cx);
            } catch (e) {
                await this.decommissionAll(cx);
                throw e;
            }
        };
    }

    /**
     * {@link guarded} for the common single-role case: also requires `role`'s ref up front and
     * threads it into `run`, matching the `(cx, ref)` shape most single-DUT steps want.
     */
    guardedWithRef(
        role: Role,
        run: (cx: CertStepContext, ref: CertNodeRef) => Promise<void>,
    ): (cx: CertStepContext) => Promise<void> {
        return this.guarded(async cx => {
            const ref = this.require(role, `Step ran before the ${role.toUpperCase()} was commissioned`);
            await run(cx, ref);
        });
    }
}

/**
 * A one-shot pairing code slot: {@link require} clears it on read so a commissioning attempt that
 * throws can't leave a stale code behind for a later run to pair against an expired window instead
 * of failing "the window-opening step must run first".
 */
export class PendingPairingCode {
    #code: string | undefined;

    set(code: string): void {
        this.#code = code;
    }

    require(): string {
        if (this.#code === undefined) {
            throw new InternalError("No pending manual pairing code; a commissioning-window step must run first");
        }
        const code = this.#code;
        this.#code = undefined;
        return code;
    }
}
