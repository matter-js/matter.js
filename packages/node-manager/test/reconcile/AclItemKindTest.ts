/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AclGrant } from "#reconcile/acl-coverage.js";
import { AclItemKind } from "#reconcile/AclItemKind.js";
import { ClientNode, ManagedItem } from "@matter/node";
import { FabricIndex, SubjectId } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";

const { Administer, Operate } = AccessControl.AccessControlEntryPrivilege;
const { Case } = AccessControl.AccessControlEntryAuthMode;

type Entry = AccessControl.AccessControlEntry;

// Fake peer: an in-memory fabric-scoped ACL list reachable via getStateOf/setStateOf(AccessControlClient).
function fakePeer(initial: Entry[], limit: number | undefined = 4) {
    const store = { acl: [...initial], accessControlEntriesPerFabric: limit };
    const node = {
        async getStateOf(_behavior: unknown, fields?: string[]) {
            if (fields === undefined) {
                return { ...store };
            }
            const out: Record<string, unknown> = {};
            for (const f of fields) {
                out[f] = store[f as keyof typeof store];
            }
            return out;
        },
        async setStateOf(_behavior: unknown, values: { acl: Entry[] }) {
            store.acl = values.acl.map(e => ({ ...e, fabricIndex: FabricIndex(1) }));
        },
        stateOf() {
            return { ...store };
        },
    } as unknown as ClientNode;
    return { node, store };
}

function adminEntry(): Entry {
    return {
        privilege: Administer,
        authMode: Case,
        subjects: [SubjectId(0x1n)],
        targets: null,
        fabricIndex: FabricIndex(1),
    };
}

function item(grant: AclGrant): ManagedItem<AclGrant> {
    return {
        kind: "acl",
        key: "k1",
        intent: grant,
        mode: "converge",
        status: { state: "pending", updateTimestamp: 0 },
    };
}

const desired: AclGrant = { privilege: Operate, authMode: Case, subjects: [SubjectId(0x55n)], targets: null };

describe("AclItemKind", () => {
    it("apply appends the entry and preserves the admin entry", async () => {
        const kind = new AclItemKind();
        const { node, store } = fakePeer([adminEntry()]);
        await kind.apply(node, item(desired));
        expect(store.acl.length).equals(2);
        expect(store.acl.some(e => e.privilege === Administer)).equals(true);
        expect(store.acl.some(e => e.subjects?.[0] === SubjectId(0x55n))).equals(true);
    });

    it("apply is a no-op when a broader foreign entry already covers the grant", async () => {
        const kind = new AclItemKind();
        const broad: Entry = {
            privilege: Administer,
            authMode: Case,
            subjects: null,
            targets: null,
            fabricIndex: FabricIndex(1),
        };
        const { node, store } = fakePeer([broad]);
        await kind.apply(node, item(desired));
        expect(store.acl.length).equals(1);
    });

    it("verify is true when present, false when removed behind us", async () => {
        const kind = new AclItemKind();
        const { node, store } = fakePeer([adminEntry()]);
        await kind.apply(node, item(desired));
        expect(await kind.verify(node, item(desired))).equals(true);
        store.acl = store.acl.filter(e => e.subjects?.[0] !== SubjectId(0x55n));
        expect(await kind.verify(node, item(desired))).equals(false);
    });

    it("remove drops our exact entry, leaves admin", async () => {
        const kind = new AclItemKind();
        const { node, store } = fakePeer([adminEntry()]);
        await kind.apply(node, item(desired));
        await kind.remove(node, item(desired));
        expect(store.acl.length).equals(1);
        expect(store.acl[0].privilege).equals(Administer);
    });

    it("capacity reports limit and used", async () => {
        const kind = new AclItemKind();
        const { node } = fakePeer([adminEntry()]);
        expect(await kind.capacity(node)).deep.equals({ limit: 4, used: 1 });
    });

    it("capacity falls back to the spec minimum when the device limit is unread", async () => {
        const kind = new AclItemKind();
        const { node } = fakePeer([adminEntry()], undefined);
        expect(await kind.capacity(node)).deep.equals({ limit: 4, used: 1 });
    });
});
