/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, ImplementationError } from "@matter/general";
import type { CertControllerGroup, GroupKeySetSpec } from "@matter/testing";

/** The fabric's IPK key set, which a group declaration must never replace (Matter Core § 11.2.2). */
const IPK_KEY_SET_ID = 0;

/** The application group ids (Matter Core § 2.5.4). */
const FIRST_APPLICATION_GROUP_ID = 0x0001;
const LAST_APPLICATION_GROUP_ID = 0xfeff;

/** `GroupKeySecurityPolicyEnum`: TrustFirst and CacheAndSync. */
const SECURITY_POLICIES = new Set([0, 1]);

/**
 * The first Unix-epoch microsecond of 2000-01-01. Every controller reads a key's start time as Unix-epoch
 * microseconds; matterjs-server reads a smaller value as counting from the Matter epoch instead and shifts it.
 */
export const FIRST_UNIX_START_TIME_US = 946_684_800_000_000n;

/**
 * Checks a case's group declaration the same way on every controller, so a declaration one controller would refuse
 * fails on all of them.
 *
 * @throws ImplementationError for an id outside the application group range, the IPK key set, a group declared twice,
 * one key set id with two different key sets, a security policy outside the enum, or a start time that is not
 * Unix-epoch microseconds within a safe JSON number
 */
export function validateControllerGroups(adapterId: string, groups: readonly CertControllerGroup[] | undefined) {
    if (groups === undefined) {
        return;
    }
    const refuse = (problem: string) =>
        new ImplementationError(`Controller adapter "${adapterId}": controllerGroups ${problem}`);

    const keySets = new Map<number, GroupKeySetSpec>();
    const groupIds = new Set<number>();
    for (const { groupId, keySet } of groups) {
        if (groupId < FIRST_APPLICATION_GROUP_ID || groupId > LAST_APPLICATION_GROUP_ID) {
            throw refuse(`declares group ${groupId}, which is not an application group id`);
        }
        if (groupIds.has(groupId)) {
            throw refuse(`declares group ${groupId} twice`);
        }
        groupIds.add(groupId);

        const { groupKeySetId, groupKeySecurityPolicy, epochStartTime0 } = keySet;
        if (groupKeySetId === IPK_KEY_SET_ID) {
            throw refuse(`binds group ${groupId} to key set 0, which is the fabric's IPK`);
        }
        if (!SECURITY_POLICIES.has(groupKeySecurityPolicy)) {
            throw refuse(`gives key set ${groupKeySetId} security policy ${groupKeySecurityPolicy}`);
        }
        if (epochStartTime0 < FIRST_UNIX_START_TIME_US || epochStartTime0 > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw refuse(`starts key set ${groupKeySetId} at ${epochStartTime0}, which is not Unix-epoch microseconds`);
        }
        const known = keySets.get(groupKeySetId);
        if (known !== undefined && keySetMismatch(known, keySet) !== undefined) {
            throw refuse(`declares key set ${groupKeySetId} with two different keys`);
        }
        keySets.set(groupKeySetId, keySet);
    }
}

/**
 * The declaration of `groupId` among the groups a controller was built with.
 *
 * @throws ImplementationError where the case declared no such group
 */
export function declaredGroup(
    adapterId: string,
    groups: readonly CertControllerGroup[] | undefined,
    groupId: number,
): CertControllerGroup {
    const declared = groups?.find(group => group.groupId === groupId);
    if (declared === undefined) {
        throw new ImplementationError(
            `Controller adapter "${adapterId}" was not built for group ${groupId}: declare it in the case's ` +
                "controllerGroups",
        );
    }
    return declared;
}

/**
 * The declaration of `groupId`, after checking that `keySet` is the key set it declares.
 *
 * @throws ImplementationError where the group is not declared or its key set differs from `keySet`
 */
export function assertDeclaredKeySet(
    adapterId: string,
    groups: readonly CertControllerGroup[] | undefined,
    groupId: number,
    keySet: GroupKeySetSpec,
): CertControllerGroup {
    const declared = declaredGroup(adapterId, groups, groupId);
    const mismatch = keySetMismatch(declared.keySet, keySet);
    if (mismatch !== undefined) {
        throw new ImplementationError(
            `Controller adapter "${adapterId}": the key set for group ${groupId} differs from the one the case's ` +
                `controllerGroups declares in ${mismatch}`,
        );
    }
    return declared;
}

/** The first field in which two key sets differ, or `undefined` where they are the same key set. */
export function keySetMismatch(expected: GroupKeySetSpec, actual: GroupKeySetSpec): string | undefined {
    if (expected.groupKeySetId !== actual.groupKeySetId) {
        return `groupKeySetId (${expected.groupKeySetId} vs ${actual.groupKeySetId})`;
    }
    if (expected.groupKeySecurityPolicy !== actual.groupKeySecurityPolicy) {
        return `groupKeySecurityPolicy (${expected.groupKeySecurityPolicy} vs ${actual.groupKeySecurityPolicy})`;
    }
    if (Bytes.toHex(expected.epochKey0) !== Bytes.toHex(actual.epochKey0)) {
        return "epochKey0";
    }
    if (expected.epochStartTime0 !== actual.epochStartTime0) {
        return `epochStartTime0 (${expected.epochStartTime0} vs ${actual.epochStartTime0})`;
    }
    return undefined;
}

/**
 * Which groups a case has keyed on one controller through `defineKeySet`. A controller whose keys are in place before
 * it starts would otherwise send on a group the case never keyed, where the other controllers fail for want of the
 * key.
 */
export class KeyedGroups {
    readonly #keyed = new Set<number>();

    add(groupId: number) {
        this.#keyed.add(groupId);
    }

    /** @throws ImplementationError where the case did not call `defineKeySet` for `groupId` first */
    assertKeyed(adapterId: string, groupId: number) {
        if (!this.#keyed.has(groupId)) {
            throw new ImplementationError(
                `Controller adapter "${adapterId}": group ${groupId} is sent on before defineKeySet installed its key`,
            );
        }
    }
}
