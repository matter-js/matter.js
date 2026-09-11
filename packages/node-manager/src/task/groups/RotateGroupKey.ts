/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, Time } from "@matter/general";
import { ClientNode } from "@matter/node";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";
import type { GroupKeyGrant } from "../../reconcile/GroupKeyItemKind.js";
import { GroupKey } from "../../reconcile/kinds.js";
import { RotationPreconditionError } from "../errors.js";
import { TaskDefinition } from "../Task.js";
import { TaskContext } from "../types.js";
import { Require } from "../validation.js";

export const ROTATE_GROUP_KEY_TYPE = "rotateGroupKey";

export interface RotateGroupKeyParams {
    groupKeySetId: number;
    newEpochKey: Uint8Array;
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
 * Forward-only once activate begins: the new key starts going live per-member, so an early rollback would restore
 * some members to old-key-only while others already TX the new key, opening an RX gap. A rotation may still be
 * cancelled/rolled-back during distribute — there the new key is dormant/future-dated and nobody TXes it, so
 * dropping it is clean. Recover a bad realized rotation by rotating to a NEW key, not by rolling back;
 * {@link rollbackable} declines cancel and auto-rollback past that point.
 */
export const RotateGroupKey: TaskDefinition<RotateGroupKeyParams> = {
    type: ROTATE_GROUP_KEY_TYPE,
    validate(params) {
        Require.params(ROTATE_GROUP_KEY_TYPE, params);
        Require.uint("groupKeySetId", params.groupKeySetId, 0xffff);
        Require.bytes("newEpochKey", params.newEpochKey, 16);
    },

    // Keyed on the key set alone, so one-live-run-per-slot is what makes rotations of a key set mutually
    // exclusive: two concurrent rotations would race the single shared groupKey slot, each observing the
    // other's committed state and advancing on the wrong struct.
    slotKeyFor(params) {
        return `${ROTATE_GROUP_KEY_TYPE}:${params.groupKeySetId}`;
    },

    rollbackable(run) {
        return run.phaseIndex < ACTIVATE_INDEX;
    },

    notRollbackableReason:
        "a realized group-key rotation is forward-only — rotate to a new key instead of rolling back",

    phases(params) {
        return [
            {
                name: "distribute",
                requires: ctx => requireSingleKeySteadyState(ctx, params),
                run: ctx => runPhase(ctx, params, "distribute"),
            },
            {
                name: "activate",
                requires: ctx => requireEveryMemberHoldsNewKey(ctx, params),
                run: ctx => runPhase(ctx, params, "activate"),
            },
            { name: "cleanup", run: ctx => runPhase(ctx, params, "cleanup") },
        ];
    },
};

/** Rotation starts from a single-key steady state; a multi-epoch key set is unsupported. */
function requireSingleKeySteadyState(ctx: TaskContext, p: RotateGroupKeyParams): void {
    const key = String(p.groupKeySetId);
    for (const peer of ctx.peersWithIntent(GroupKey, key)) {
        const current = currentIntent(ctx, peer, p);
        if (current !== undefined && !isRotatable(current, p)) {
            throw new RotationPreconditionError(
                `Cannot rotate group key set ${p.groupKeySetId} on peer ${peer.id}: ` +
                    `member holds a multi-epoch keyset (slot 1/2 populated). Rotation requires a ` +
                    `single-key steady state; multi-epoch keysets are unsupported.`,
            );
        }
    }
}

/**
 * Every current member must hold this rotation's new key before any member starts transmitting with it.
 *
 * Asked before activate writes and again after, because provisioning a group takes no lock on its key set: a
 * member that joins in between would not be able to decrypt traffic from members that already flipped.
 */
function requireEveryMemberHoldsNewKey(ctx: TaskContext, p: RotateGroupKeyParams): void {
    const late = memberWithoutNewKey(ctx, p, String(p.groupKeySetId));
    if (late !== undefined) {
        throw new RotationPreconditionError(
            `Cannot activate group key set ${p.groupKeySetId}: peer ${late.id} does not hold this ` +
                `rotation's new key, so it joined the key set while the rotation was running. The distributed ` +
                `keys remain dormant; rotate again with this same new key, which covers every current member.`,
        );
    }
}

async function runPhase(ctx: TaskContext, p: RotateGroupKeyParams, phase: RotationPhase): Promise<void> {
    const key = String(p.groupKeySetId);
    const members = ctx.peersWithIntent(GroupKey, key);
    if (members.length === 0) {
        return;
    }
    for (const peer of members) {
        await ctx.setIntent(peer, GroupKey, key, struct(ctx, peer, p, phase), "converge");
    }
    await ctx.awaitCommitted(members.map(peer => ({ peer, kind: GroupKey, key })));
}

/** A member holding an intent for this key set that does not carry this rotation's new key, if there is one. */
function memberWithoutNewKey(ctx: TaskContext, p: RotateGroupKeyParams, key: string): ClientNode | undefined {
    for (const peer of ctx.peersWithIntent(GroupKey, key)) {
        const current = currentIntent(ctx, peer, p);
        if (current === undefined || !holdsNewKey(current, p)) {
            return peer;
        }
    }
    return undefined;
}

function currentIntent(ctx: TaskContext, peer: ClientNode, p: RotateGroupKeyParams): GroupKeyGrant | undefined {
    return ctx.intentOf(peer, GroupKey, String(p.groupKeySetId));
}

// A single-key steady state is the required starting point; a member already carrying THIS rotation's new key in
// slot 1 is our own distribute output on a park/resume re-drive, not a foreign multi-epoch keyset, so accept it.
function isRotatable(current: GroupKeyGrant, p: RotateGroupKeyParams): boolean {
    return isSingleKeySteadyState(current) || holdsNewKey(current, p);
}

/** Whether the member carries this rotation's new key in slot 1 — the output of distribute or of activate. */
function holdsNewKey(current: GroupKeyGrant, p: RotateGroupKeyParams): boolean {
    const slot1 = current.epochKey1;
    return slot1 !== null && slot1 !== undefined && Bytes.areEqual(slot1, p.newEpochKey);
}

function struct(ctx: TaskContext, peer: ClientNode, p: RotateGroupKeyParams, phase: RotationPhase): GroupKeyGrant {
    const id = p.groupKeySetId;
    const current = currentIntent(ctx, peer, p);
    const policy =
        p.groupKeySecurityPolicy ??
        current?.groupKeySecurityPolicy ??
        GroupKeyManagement.GroupKeySecurityPolicy.TrustFirst;

    // epochStartTime is unix-µs in this codebase (see FabricGroups.addGroupEpoch: Time.nowMs * 1000).
    const nowUs = BigInt(Time.nowMs) * 1000n;
    const opKey = current?.epochKey0 ?? p.newEpochKey;
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
                epochKey1: p.newEpochKey,
                epochStartTime1: futureStart,
                epochKey2: null,
                epochStartTime2: null,
            };
        case "activate":
            return {
                ...base,
                epochKey0: opKey,
                epochStartTime0: opStart,
                epochKey1: p.newEpochKey,
                epochStartTime1: newStart,
                epochKey2: peer.env.get(Crypto).randomBytes(16),
                epochStartTime2: futureStart,
            };
        case "cleanup":
            // The sole surviving key must be selectable on ANY device clock; a device whose clock lags
            // newStart would have no non-future key and fail group TX. opStart is firmly past for all.
            return {
                ...base,
                epochKey0: p.newEpochKey,
                epochStartTime0: opStart,
                epochKey1: null,
                epochStartTime1: null,
                epochKey2: null,
                epochStartTime2: null,
            };
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
