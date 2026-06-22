/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CapacityInfo, ClientNode, ItemKind, ManagedItem } from "@matter/node";
import { AccessControlClient } from "@matter/node/behaviors/access-control";
import { FabricIndex, Status } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { AclGrant, coversGrant, grantsEqual } from "./acl-coverage.js";
import { PRIORITY_BANDS } from "./priority.js";

type Entry = AccessControl.AccessControlEntry;

// AccessControl §9.10: AccessControlEntriesPerFabric SHALL be ≥ 4. Assume this floor if the device
// limit is momentarily unread, so pre-flight admission stays meaningful instead of failing open.
const ACL_ENTRIES_PER_FABRIC_MIN = 4;

function toGrant(entry: Entry): AclGrant {
    return { privilege: entry.privilege, authMode: entry.authMode, subjects: entry.subjects, targets: entry.targets };
}

function toEntry(grant: AclGrant): Entry {
    return {
        privilege: grant.privilege,
        authMode: grant.authMode,
        subjects: grant.subjects,
        targets: grant.targets,
        fabricIndex: FabricIndex.OMIT_FABRIC,
    };
}

/**
 * The `acl` ItemKind: additive, subsumption-aware. Reads are fabric-scoped so they only ever return
 * our own fabric's entries. We add/remove only our exact entry and never touch foreign entries.
 * Compression is deferred to the Phase 4 optimizer.
 */
export class AclItemKind implements ItemKind<AclGrant> {
    readonly kind = "acl";
    readonly priority = PRIORITY_BANDS.acl;

    async #readAcl(node: ClientNode): Promise<Entry[]> {
        const { acl } = await node.getStateOf(AccessControlClient, ["acl"] as const);
        return acl ?? [];
    }

    async apply(node: ClientNode, item: ManagedItem<AclGrant>): Promise<void> {
        const current = await this.#readAcl(node);
        if (coversGrant(current.map(toGrant), item.intent)) {
            return;
        }
        await node.setStateOf(AccessControlClient, {
            acl: [...current.map(e => ({ ...e, fabricIndex: FabricIndex.OMIT_FABRIC })), toEntry(item.intent)],
        });
    }

    async verify(node: ClientNode, item: ManagedItem<AclGrant>): Promise<boolean> {
        const current = await this.#readAcl(node);
        return coversGrant(current.map(toGrant), item.intent);
    }

    async remove(node: ClientNode, item: ManagedItem<AclGrant>): Promise<void> {
        const current = await this.#readAcl(node);
        const kept = current.filter(e => !grantsEqual(toGrant(e), item.intent));
        if (kept.length === current.length) {
            return;
        }
        await node.setStateOf(AccessControlClient, {
            acl: kept.map(e => ({ ...e, fabricIndex: FabricIndex.OMIT_FABRIC })),
        });
    }

    async capacity(node: ClientNode): Promise<CapacityInfo> {
        const { acl, accessControlEntriesPerFabric } = await node.getStateOf(AccessControlClient, [
            "acl",
            "accessControlEntriesPerFabric",
        ] as const);
        return { limit: accessControlEntriesPerFabric ?? ACL_ENTRIES_PER_FABRIC_MIN, used: (acl ?? []).length };
    }

    recoverable(code: number): boolean {
        return code === Status.Timeout || code === Status.Busy;
    }
}
