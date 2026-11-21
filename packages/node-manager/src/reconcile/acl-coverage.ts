/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SubjectId } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";

export type AclTarget = AccessControl.AccessControlTarget;

/** A single desired ACL grant (an AccessControlEntry minus its fabric index). */
export interface AclGrant {
    privilege: number;
    authMode: number;
    subjects: SubjectId[] | null;
    targets: AclTarget[] | null;
}

interface Cell {
    privilege: number;
    authMode: number;
    subject: SubjectId | null;
    target: AclTarget | null;
}

/** An entry target covers a desired target when each specified field is wildcard or equal. */
function targetCovers(entryTarget: AclTarget, desired: AclTarget): boolean {
    return (
        (entryTarget.cluster === null || entryTarget.cluster === desired.cluster) &&
        (entryTarget.endpoint === null || entryTarget.endpoint === desired.endpoint) &&
        (entryTarget.deviceType === null || entryTarget.deviceType === desired.deviceType)
    );
}

function entryCoversCell(entry: AclGrant, cell: Cell): boolean {
    if (entry.authMode !== cell.authMode) {
        return false;
    }
    if (entry.privilege < cell.privilege) {
        return false;
    }
    if (entry.subjects !== null) {
        if (cell.subject === null || !entry.subjects.includes(cell.subject)) {
            return false;
        }
    }
    if (entry.targets !== null) {
        const target = cell.target;
        if (target === null || !entry.targets.some(t => targetCovers(t, target))) {
            return false;
        }
    }
    return true;
}

/** Decompose a grant into its (subject × target) cells; null stays a single wildcard cell. */
function cellsOf(grant: AclGrant): Cell[] {
    const subjects: (SubjectId | null)[] = grant.subjects === null ? [null] : grant.subjects;
    const targets: (AclTarget | null)[] = grant.targets === null ? [null] : grant.targets;
    const cells = new Array<Cell>();
    for (const subject of subjects) {
        for (const target of targets) {
            cells.push({ privilege: grant.privilege, authMode: grant.authMode, subject, target });
        }
    }
    return cells;
}

/** True when every cell of `desired` is covered by the union of `entries`. */
export function coversGrant(entries: readonly AclGrant[], desired: AclGrant): boolean {
    return cellsOf(desired).every(cell => entries.some(entry => entryCoversCell(entry, cell)));
}

function sameSet<T>(a: T[] | null, b: T[] | null): boolean {
    if (a === null || b === null) {
        return a === b;
    }
    if (a.length !== b.length) {
        return false;
    }
    return a.every(x => b.includes(x)) && b.every(x => a.includes(x));
}

/** Structural equality ignoring fabric index: privilege, authMode, set-equal subjects and targets. */
export function grantsEqual(a: AclGrant, b: AclGrant): boolean {
    return (
        a.privilege === b.privilege &&
        a.authMode === b.authMode &&
        sameSet(a.subjects, b.subjects) &&
        sameSet(
            a.targets?.map(t => JSON.stringify([t.cluster, t.endpoint, t.deviceType])) ?? null,
            b.targets?.map(t => JSON.stringify([t.cluster, t.endpoint, t.deviceType])) ?? null,
        )
    );
}
