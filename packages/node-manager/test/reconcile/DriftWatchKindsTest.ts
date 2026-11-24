/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AclGrant } from "#reconcile/acl-coverage.js";
import { AclItemKind } from "#reconcile/AclItemKind.js";
import { BindingGrant, BindingItemKind } from "#reconcile/BindingItemKind.js";
import { GroupMembershipGrant, GroupMembershipItemKind } from "#reconcile/GroupMembershipItemKind.js";
import { ImplementationError } from "@matter/general";
import { ClientNode, ManagedItem } from "@matter/node";
import { AccessControlClient } from "@matter/node/behaviors/access-control";
import { BindingClient } from "@matter/node/behaviors/binding";
import { GroupKeyManagementClient } from "@matter/node/behaviors/group-key-management";
import { ClusterId, EndpointNumber, FabricIndex, GroupId, NodeId, SubjectId } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { Binding } from "@matter/types/clusters/binding";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";

// Our fabric is index 5 on the device. The controller numbers it 1, so an entry of another fabric that carries
// the controller's number (1) must not count either.
const OWN = FabricIndex(5);
const CONTROLLER_INDEX = FabricIndex(1);
const OTHER = FabricIndex(2);

function item<I>(kind: string, intent: I): ManagedItem<I> {
    return {
        kind,
        key: "k",
        intent,
        mode: "converge",
        status: { state: "pending", updateTimestamp: 0 },
        outstanding: "apply",
        generation: 1,
    };
}

/**
 * Fake with the pieces `watches`, `satisfiedBy` and `verify` touch. `state` and `endpointState` are the subscription
 * cache; `live` and `endpointLive` answer a live read, which the device filters to our fabric, and `commands` answers
 * the endpoint's commands.
 */
function fakeNode(opts: {
    fabricIndexOnPeer?: FabricIndex;
    present?: Set<unknown>;
    endpoints?: number[];
    state?: Map<unknown, Record<string, unknown>>;
    live?: Record<string, unknown>;
    endpointState?: Record<string, unknown>;
    endpointLive?: Record<string, unknown>;
    commands?: Record<string, unknown>;
}) {
    const has = (behavior: unknown) => opts.present?.has(behavior) ?? true;
    const endpointNode = {
        behaviors: { has },
        maybeStateOf: () => opts.endpointState,
        getStateOf: async () => opts.endpointLive,
        commandsOf: () => opts.commands,
    };
    return {
        fabricIndexOnPeer: opts.fabricIndexOnPeer,
        peerAddress: { fabricIndex: CONTROLLER_INDEX },
        behaviors: { has },
        maybeStateOf: (behavior: unknown) => opts.state?.get(behavior),
        getStateOf: async () => opts.live,
        endpoints: {
            has: (n: number) => (opts.endpoints ?? [1]).includes(n),
            for: (n: number) => {
                if (!(opts.endpoints ?? [1]).includes(n)) {
                    throw new ImplementationError(`The fake node has no endpoint ${n}`);
                }
                return endpointNode;
            },
        },
    } as unknown as ClientNode;
}

/** The device answers a live read with its entries of our fabric only. */
function ownOnly<T extends { fabricIndex: FabricIndex }>(entries: T[]) {
    return entries.filter(e => e.fabricIndex === OWN);
}

describe("ACL watches and satisfiedBy", () => {
    const { Operate } = AccessControl.AccessControlEntryPrivilege;
    const { Case } = AccessControl.AccessControlEntryAuthMode;
    const intent: AclGrant = { privilege: Operate, authMode: Case, subjects: [SubjectId(0x55n)], targets: null };
    const entry = (fabricIndex: FabricIndex, privilege = Operate): AccessControl.AccessControlEntry => ({
        privilege,
        authMode: Case,
        subjects: [SubjectId(0x55n)],
        targets: null,
        fabricIndex,
    });
    const nodeWith = (acl: AccessControl.AccessControlEntry[]) =>
        fakeNode({
            fabricIndexOnPeer: OWN,
            state: new Map([[AccessControlClient, { acl }]]),
            live: { acl: ownOnly(acl) },
        });

    const table: [string, AccessControl.AccessControlEntry[], boolean][] = [
        ["own identical entry", [entry(OWN)], true],
        ["own broader entry", [entry(OWN, AccessControl.AccessControlEntryPrivilege.Administer)], true],
        ["own weaker entry", [entry(OWN, AccessControl.AccessControlEntryPrivilege.View)], false],
        ["identical entry of another fabric", [entry(OTHER)], false],
        ["identical entry numbered like the controller's index", [entry(CONTROLLER_INDEX)], false],
        ["empty", [], false],
    ];

    for (const [name, acl, expected] of table) {
        it(`${name}: verify and satisfiedBy answer ${expected}`, async () => {
            const kind = new AclItemKind();
            const node = nodeWith(acl);
            expect(await kind.verify(node, item("acl", intent))).equals(expected);
            expect(kind.satisfiedBy(node, item("acl", intent))).equals(expected);
        });
    }

    it("satisfiedBy is false while our fabric index on the peer is unknown", () => {
        const node = fakeNode({ state: new Map([[AccessControlClient, { acl: [entry(OWN)] }]]) });
        expect(new AclItemKind().satisfiedBy(node, item("acl", intent))).equals(false);
    });

    it("watches the root acl", () => {
        const node = nodeWith([]);
        const [watch, ...rest] = new AclItemKind().watches(node);
        expect(rest.length).equals(0);
        expect(watch.endpoint).equals(node);
        expect(watch.behavior).equals(AccessControlClient);
        expect(watch.attribute).equals("acl");
    });

    it("watches nothing when the cluster is absent", () => {
        const node = fakeNode({ present: new Set() });
        expect(new AclItemKind().watches(node)).deep.equals([]);
    });
});

describe("Binding watches and satisfiedBy", () => {
    const intent: BindingGrant = {
        localEndpoint: 1,
        target: { node: NodeId(0x99n), endpoint: EndpointNumber(1), cluster: ClusterId(6) },
    };
    const entry = (fabricIndex: FabricIndex, node = NodeId(0x99n)): Binding.Target => ({
        node,
        endpoint: EndpointNumber(1),
        cluster: ClusterId(6),
        fabricIndex,
    });
    const nodeWith = (binding: Binding.Target[]) =>
        fakeNode({ fabricIndexOnPeer: OWN, endpointState: { binding }, endpointLive: { binding: ownOnly(binding) } });

    const table: [string, Binding.Target[], boolean][] = [
        ["own identical entry", [entry(OWN)], true],
        ["own entry for another node", [entry(OWN, NodeId(0x11n))], false],
        ["identical entry of another fabric", [entry(OTHER)], false],
        ["identical entry numbered like the controller's index", [entry(CONTROLLER_INDEX)], false],
        ["empty", [], false],
    ];

    for (const [name, binding, expected] of table) {
        it(`${name}: verify and satisfiedBy answer ${expected}`, async () => {
            const kind = new BindingItemKind();
            const node = nodeWith(binding);
            expect(await kind.verify(node, item("binding", intent))).equals(expected);
            expect(kind.satisfiedBy(node, item("binding", intent))).equals(expected);
        });
    }

    it("satisfiedBy is false while our fabric index on the peer is unknown or the endpoint is absent", () => {
        const kind = new BindingItemKind();
        const unknown = fakeNode({ endpointState: { binding: [entry(OWN)] } });
        expect(kind.satisfiedBy(unknown, item("binding", intent))).equals(false);
        const node = nodeWith([entry(OWN)]);
        expect(kind.satisfiedBy(node, item("binding", { ...intent, localEndpoint: 99 }))).equals(false);
    });

    it("watches the item's endpoint binding", () => {
        const node = nodeWith([]);
        const [watch, ...rest] = new BindingItemKind().watches(node, item("binding", intent));
        expect(rest.length).equals(0);
        expect(watch.endpoint).equals(node.endpoints.for(1));
        expect(watch.behavior).equals(BindingClient);
        expect(watch.attribute).equals("binding");
    });

    it("watches nothing when the endpoint is absent", () => {
        const node = nodeWith([]);
        expect(new BindingItemKind().watches(node, item("binding", { ...intent, localEndpoint: 99 }))).deep.equals([]);
    });

    it("watches nothing when the endpoint has no Binding cluster", () => {
        const node = fakeNode({ present: new Set(), endpoints: [1] });
        expect(new BindingItemKind().watches(node, item("binding", intent))).deep.equals([]);
    });
});

describe("Group membership watches and satisfiedBy", () => {
    const GROUP = GroupId(0x101);
    const intent: GroupMembershipGrant = { localEndpoint: 1, groupId: GROUP };
    const entry = (
        fabricIndex: FabricIndex,
        endpoints: number[] = [1],
        groupId = GROUP,
    ): GroupKeyManagement.GroupInfoMap => ({
        groupId,
        endpoints: endpoints.map(n => EndpointNumber(n)),
        groupName: "g",
        fabricIndex,
    });
    const nodeWith = (groupTable: GroupKeyManagement.GroupInfoMap[], maxGroupsPerFabric = 8) =>
        fakeNode({
            fabricIndexOnPeer: OWN,
            state: new Map([[GroupKeyManagementClient, { groupTable, maxGroupsPerFabric }]]),
            // GetGroupMembership answers with the groups of our fabric on that endpoint
            commands: {
                getGroupMembership: async () => ({
                    capacity: null,
                    groupList: ownOnly(groupTable)
                        .filter(e => e.endpoints.includes(EndpointNumber(1)))
                        .map(e => e.groupId),
                }),
            },
        });

    const table: [string, GroupKeyManagement.GroupInfoMap[], boolean][] = [
        ["own entry on the endpoint", [entry(OWN)], true],
        ["own entry on another endpoint", [entry(OWN, [2])], false],
        ["own entry for another group", [entry(OWN, [1], GroupId(0x102))], false],
        ["identical entry of another fabric", [entry(OTHER)], false],
        ["identical entry numbered like the controller's index", [entry(CONTROLLER_INDEX)], false],
        ["empty", [], false],
    ];

    for (const [name, groupTable, expected] of table) {
        it(`${name}: verify and satisfiedBy answer ${expected}`, async () => {
            const kind = new GroupMembershipItemKind();
            const node = nodeWith(groupTable);
            expect(await kind.verify(node, item("endpointGroupMembership", intent))).equals(expected);
            expect(kind.satisfiedBy(node, item("endpointGroupMembership", intent))).equals(expected);
        });
    }

    it("satisfiedBy is false while our fabric index on the peer is unknown", () => {
        const node = fakeNode({
            state: new Map([[GroupKeyManagementClient, { groupTable: [entry(OWN)], maxGroupsPerFabric: 8 }]]),
        });
        expect(new GroupMembershipItemKind().satisfiedBy(node, item("endpointGroupMembership", intent))).equals(false);
    });

    it("watches the root groupTable", () => {
        const node = nodeWith([]);
        const [watch, ...rest] = new GroupMembershipItemKind().watches(node);
        expect(rest.length).equals(0);
        expect(watch.endpoint).equals(node);
        expect(watch.behavior).equals(GroupKeyManagementClient);
        expect(watch.attribute).equals("groupTable");
    });

    it("watches nothing when maxGroupsPerFabric is 0", () => {
        expect(new GroupMembershipItemKind().watches(nodeWith([], 0))).deep.equals([]);
    });

    it("watches nothing when the cluster is absent", () => {
        expect(new GroupMembershipItemKind().watches(fakeNode({}))).deep.equals([]);
    });
});
