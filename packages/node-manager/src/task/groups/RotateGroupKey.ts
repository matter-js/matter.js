/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, Time } from "@matter/general";
import { ClientNode, DesiredStateBehavior, itemMapKey } from "@matter/node";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";
import type { GroupKeyGrant } from "../../reconcile/GroupKeyItemKind.js";
import { RotationPreconditionError } from "../errors.js";
import { Task } from "../Task.js";
import { TaskContext, TaskPhase } from "../types.js";

export const ROTATE_GROUP_KEY_TYPE = "rotateGroupKey";

export interface RotateGroupKeyParams {
    groupKeySetId: number;
    newEpochKey: Uint8Array;
    /**
     * Unique per rotation operation: a new `rotationId` starts a new rotation. Re-issuing a live one is refused
     * unless the request carries the `externalId` that rotation was started under; once it is terminal, the same
     * `rotationId` may be run again.
     */
    rotationId: string;
    groupKeySecurityPolicy?: GroupKeyManagement.GroupKeySecurityPolicy;
}

type RotationPhase = "distribute" | "activate" | "cleanup";

const FAR_FUTURE_US = 100n * 365n * 24n * 3600n * 1_000_000n;

// Index of "activate" in `phases`; reaching it is the rotation's point of no return (see class doc).
const ACTIVATE_INDEX = 1;

/**
 * Rotates a group operational key across every member of the key set, gap-free and without relying on device
 * clock sync. Three gated phases: distribute the new key far-future-dormant → activate it now-dated while the old
 * key stays present (so a synced device flips to new while a lagging device stays on the still-valid old key) →
 * drop the old key, back-dating new so it is selectable on any clock. The sentinel top key in activate makes the
 * flip hold under the spec's second-newest TX rule too, not only matter.js's clock-based selection. Each phase
 * blocks until ALL members commit; an offline member parks the task.
 *
 * Forward-only once activate begins: the new key starts going live per-member, so an early revert would restore
 * some members to old-key-only while others already TX the new key, opening an RX gap. A rotation may still be
 * cancelled/rolled-back during distribute — there the new key is dormant/future-dated and nobody TXes it, so
 * dropping it is clean. Recover a bad realized rotation by rotating to a NEW key, not by reverting;
 * {@link revertible} declines cancel and auto-rollback past that point.
 */
export class RotateGroupKey extends Task<RotateGroupKeyParams> {
    readonly type = ROTATE_GROUP_KEY_TYPE;

    static override idFor(params: RotateGroupKeyParams): string {
        return `${ROTATE_GROUP_KEY_TYPE}:${params.groupKeySetId}:${params.rotationId}`;
    }

    // Independent of rotationId: different rotationIds on the same key set must be mutually exclusive.
    override resourceKey(): string {
        return `groupKey:${this.params.groupKeySetId}`;
    }

    override get revertible(): boolean {
        return this.progress.phaseIndex < ACTIVATE_INDEX;
    }

    override get notRevertibleReason(): string {
        return "a realized group-key rotation is forward-only — rotate to a new key instead of reverting";
    }

    get phases(): TaskPhase[] {
        return [
            { name: "distribute", run: ctx => this.#phase(ctx, "distribute") },
            { name: "activate", run: ctx => this.#phase(ctx, "activate") },
            { name: "cleanup", run: ctx => this.#phase(ctx, "cleanup") },
        ];
    }

    async #phase(ctx: TaskContext, phase: RotationPhase): Promise<void> {
        const key = String(this.params.groupKeySetId);
        const members = ctx.peersWithIntent("groupKey", key);
        if (members.length === 0) {
            return;
        }
        // distribute is the first phase, so validating here refuses the whole rotation before any intent is mutated.
        if (phase === "distribute") {
            for (const peer of members) {
                const current = this.#currentIntent(peer);
                if (current !== undefined && !this.#isRotatable(current)) {
                    throw new RotationPreconditionError(
                        `Cannot rotate group key set ${this.params.groupKeySetId} on peer ${peer.id}: ` +
                            `member holds a multi-epoch keyset (slot 1/2 populated). Rotation requires a ` +
                            `single-key steady state; multi-epoch keysets are unsupported.`,
                    );
                }
            }
        }
        // A member is re-derived per phase, so one whose intent appeared after distribute would activate without
        // holding the new key and could not decrypt traffic from members that already flipped to it.
        if (phase === "activate") {
            const late = this.#memberWithoutNewKey(ctx, key);
            if (late !== undefined) {
                throw new RotationPreconditionError(
                    `Cannot activate group key set ${this.params.groupKeySetId}: peer ${late.id} does not hold ` +
                        `this rotation's new key, so it joined the key set after the distribute phase. The ` +
                        `distributed keys remain dormant; rotate again with this same new key so every member ` +
                        `receives it before activation.`,
                );
            }
        }
        for (const peer of members) {
            await ctx.setIntent(peer, "groupKey", key, this.#struct(peer, phase), "converge");
        }
        await ctx.awaitCommitted(members.map(peer => ({ peer, kind: "groupKey", key })));
        // The writes and the barrier above both yield, and provisioning a group takes no lock on its key set, so
        // the member set can grow after the check at phase entry.
        if (phase === "activate") {
            const late = this.#memberWithoutNewKey(ctx, key);
            if (late !== undefined) {
                throw new RotationPreconditionError(
                    `Cannot complete activation of group key set ${this.params.groupKeySetId}: peer ${late.id} ` +
                        `joined the key set during the activate phase and does not hold this rotation's new key, ` +
                        `so it cannot decrypt traffic from the members that already transmit with it. The old key ` +
                        `is still present on those members; rotate again with this same new key, which covers ` +
                        `every current member.`,
                );
            }
        }
    }

    /** A member holding an intent for this key set that does not carry this rotation's new key, if there is one. */
    #memberWithoutNewKey(ctx: TaskContext, key: string): ClientNode | undefined {
        for (const peer of ctx.peersWithIntent("groupKey", key)) {
            const current = this.#currentIntent(peer);
            if (current === undefined || !this.#holdsNewKey(current)) {
                return peer;
            }
        }
        return undefined;
    }

    #currentIntent(peer: ClientNode): GroupKeyGrant | undefined {
        const key = itemMapKey("groupKey", String(this.params.groupKeySetId));
        return peer.stateOf(DesiredStateBehavior).items[key]?.intent as GroupKeyGrant | undefined;
    }

    // A single-key steady state is the required starting point; a member already carrying THIS rotation's new key in
    // slot 1 is our own distribute output on a park/resume re-drive, not a foreign multi-epoch keyset, so accept it.
    #isRotatable(current: GroupKeyGrant): boolean {
        return isSingleKeySteadyState(current) || this.#holdsNewKey(current);
    }

    /** Whether the member carries this rotation's new key in slot 1 — the output of distribute or of activate. */
    #holdsNewKey(current: GroupKeyGrant): boolean {
        const slot1 = current.epochKey1;
        return slot1 !== null && slot1 !== undefined && Bytes.areEqual(slot1, this.params.newEpochKey);
    }

    #struct(peer: ClientNode, phase: RotationPhase): GroupKeyGrant {
        const id = this.params.groupKeySetId;
        const current = this.#currentIntent(peer);
        const policy =
            this.params.groupKeySecurityPolicy ??
            current?.groupKeySecurityPolicy ??
            GroupKeyManagement.GroupKeySecurityPolicy.TrustFirst;

        // epochStartTime is unix-µs in this codebase (see FabricGroups.addGroupEpoch: Time.nowMs * 1000).
        const nowUs = BigInt(Time.nowMs) * 1000n;
        const opKey = current?.epochKey0 ?? this.params.newEpochKey;
        const opStart = toBigInt(current?.epochStartTime0) ?? nowUs - 1n;
        // A non-monotonic device clock could tie or invert op/new ordering; keep new strictly above op.
        const newStart = opStart < nowUs ? nowUs : opStart + 1n;
        const futureStart = nowUs + FAR_FUTURE_US;

        const base = { groupKeySetId: id, groupKeySecurityPolicy: policy };

        switch (phase) {
            case "distribute":
                return {
                    ...base,
                    epochKey0: opKey,
                    epochStartTime0: opStart,
                    epochKey1: this.params.newEpochKey,
                    epochStartTime1: futureStart,
                    epochKey2: null,
                    epochStartTime2: null,
                };
            case "activate":
                return {
                    ...base,
                    epochKey0: opKey,
                    epochStartTime0: opStart,
                    epochKey1: this.params.newEpochKey,
                    epochStartTime1: newStart,
                    epochKey2: peer.env.get(Crypto).randomBytes(16),
                    epochStartTime2: futureStart,
                };
            case "cleanup":
                // The sole surviving key must be selectable on ANY device clock; a device whose clock lags
                // newStart would have no non-future key and fail group TX. opStart is firmly past for all.
                return {
                    ...base,
                    epochKey0: this.params.newEpochKey,
                    epochStartTime0: opStart,
                    epochKey1: null,
                    epochStartTime1: null,
                    epochKey2: null,
                    epochStartTime2: null,
                };
        }
    }
}

function toBigInt(v: number | bigint | null | undefined): bigint | undefined {
    return v === null || v === undefined ? undefined : BigInt(v);
}

/** True when only epoch slot 0 is populated — the precondition RotateGroupKey requires of every member. */
function isSingleKeySteadyState(g: GroupKeyGrant): boolean {
    const empty = (v: unknown) => v === null || v === undefined;
    return (
        !empty(g.epochKey0) &&
        empty(g.epochKey1) &&
        empty(g.epochStartTime1) &&
        empty(g.epochKey2) &&
        empty(g.epochStartTime2)
    );
}
