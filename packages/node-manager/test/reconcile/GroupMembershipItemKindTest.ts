/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupMembershipGrant, GroupMembershipItemKind } from "#reconcile/GroupMembershipItemKind.js";
import { ImplementationError } from "@matter/general";
import { ClientNode, ManagedItem } from "@matter/node";
import { GroupId, Status, StatusResponseError } from "@matter/types";

const LOCAL_EP = 1;
const GROUP = GroupId(0x101);

// Fake peer: per-endpoint Groups commands over an in-memory membership set, plus a
// GroupKeyManagement cache for capacity. addStatus lets a test force a non-SUCCESS AddGroup.
function fakePeer(opts?: {
    localEp?: number;
    members?: GroupId[];
    addStatus?: Status;
    removeStatus?: Status;
    groupTableLen?: number;
    maxGroupsPerFabric?: number;
}) {
    const localEp = opts?.localEp ?? LOCAL_EP;
    const members = new Set<number>((opts?.members ?? []).map(Number));
    const calls = { added: new Array<{ groupId: number; groupName: string }>(), removed: new Array<number>() };

    const commands = {
        async addGroup(req: { groupId: GroupId; groupName: string }) {
            const status = opts?.addStatus ?? Status.Success;
            if (status === Status.Success) {
                members.add(Number(req.groupId));
                calls.added.push({ groupId: Number(req.groupId), groupName: req.groupName });
            }
            return { status, groupId: req.groupId };
        },
        async removeGroup(req: { groupId: GroupId }) {
            const status = opts?.removeStatus ?? Status.Success;
            if (status === Status.Success) {
                members.delete(Number(req.groupId));
                calls.removed.push(Number(req.groupId));
            }
            return { status, groupId: req.groupId };
        },
        async getGroupMembership(req: { groupList: GroupId[] }) {
            const all = [...members].map(n => GroupId(n));
            const groupList = req.groupList.length === 0 ? all : all.filter(g => req.groupList.includes(g));
            return { capacity: null, groupList };
        },
    };

    const endpoint = { commandsOf: () => commands };
    const node = {
        endpoints: {
            has: (n: number) => n === localEp,
            for: (n: number) => {
                if (n !== localEp) {
                    throw new Error(`no endpoint ${n}`);
                }
                return endpoint;
            },
        },
        stateOf: () => ({
            groupTable: new Array(opts?.groupTableLen ?? 0).fill({}),
            maxGroupsPerFabric: opts?.maxGroupsPerFabric ?? 8,
        }),
    } as unknown as ClientNode;

    return { node, members, calls };
}

const grant: GroupMembershipGrant = { localEndpoint: LOCAL_EP, groupId: GROUP, groupName: "kitchen" };

function item(g: GroupMembershipGrant): ManagedItem<GroupMembershipGrant> {
    return {
        kind: "endpointGroupMembership",
        key: String(g.groupId),
        intent: g,
        mode: "converge",
        status: { state: "pending", updateTimestamp: 0 },
    };
}

describe("GroupMembershipItemKind", () => {
    it("apply adds the endpoint to the group with its name", async () => {
        const kind = new GroupMembershipItemKind();
        const { node, calls, members } = fakePeer();
        await kind.apply(node, item(grant));
        expect(calls.added).deep.equals([{ groupId: 0x101, groupName: "kitchen" }]);
        expect(members.has(0x101)).equals(true);
    });

    it("apply sends an empty name when none is given", async () => {
        const kind = new GroupMembershipItemKind();
        const { node, calls } = fakePeer();
        await kind.apply(node, item({ localEndpoint: LOCAL_EP, groupId: GROUP }));
        expect(calls.added[0].groupName).equals("");
    });

    it("apply throws StatusResponseError on a non-success status", async () => {
        const kind = new GroupMembershipItemKind();
        const { node } = fakePeer({ addStatus: Status.ResourceExhausted });
        let err: unknown;
        try {
            await kind.apply(node, item(grant));
        } catch (e) {
            err = e;
        }
        expect(err).instanceOf(StatusResponseError);
        expect((err as StatusResponseError).code).equals(Status.ResourceExhausted);
    });

    it("apply throws ImplementationError when the endpoint is absent", async () => {
        const kind = new GroupMembershipItemKind();
        const { node } = fakePeer();
        let err: unknown;
        try {
            await kind.apply(node, item({ ...grant, localEndpoint: 99 }));
        } catch (e) {
            err = e;
        }
        expect(err).instanceOf(ImplementationError);
    });

    it("verify is true when a member, false when not", async () => {
        const kind = new GroupMembershipItemKind();
        expect(await new GroupMembershipItemKind().verify(fakePeer({ members: [GROUP] }).node, item(grant))).equals(
            true,
        );
        expect(await kind.verify(fakePeer().node, item(grant))).equals(false);
    });

    it("verify returns false when the endpoint is absent", async () => {
        const kind = new GroupMembershipItemKind();
        const { node } = fakePeer({ members: [GROUP] });
        expect(await kind.verify(node, item({ ...grant, localEndpoint: 99 }))).equals(false);
    });

    it("remove drops the endpoint from the group", async () => {
        const kind = new GroupMembershipItemKind();
        const { node, calls, members } = fakePeer({ members: [GROUP] });
        await kind.remove(node, item(grant));
        expect(calls.removed).deep.equals([0x101]);
        expect(members.has(0x101)).equals(false);
    });

    it("remove treats NOT_FOUND as success", async () => {
        const kind = new GroupMembershipItemKind();
        const { node } = fakePeer({ removeStatus: Status.NotFound });
        await kind.remove(node, item(grant)); // must not throw
    });

    it("remove throws StatusResponseError on other failures", async () => {
        const kind = new GroupMembershipItemKind();
        const { node } = fakePeer({ removeStatus: Status.Busy });
        let err: unknown;
        try {
            await kind.remove(node, item(grant));
        } catch (e) {
            err = e;
        }
        expect(err).instanceOf(StatusResponseError);
    });

    it("remove is a no-op when the endpoint is absent", async () => {
        const kind = new GroupMembershipItemKind();
        const { node, calls } = fakePeer();
        await kind.remove(node, item({ ...grant, localEndpoint: 99 }));
        expect(calls.removed.length).equals(0);
    });

    it("capacity reads limit and used from the cached group table", async () => {
        const kind = new GroupMembershipItemKind();
        const { node } = fakePeer({ groupTableLen: 2, maxGroupsPerFabric: 5 });
        expect(await kind.capacity(node)).deep.equals({ limit: 5, used: 2 });
    });

    it("recoverable is true only for Timeout and Busy", () => {
        const kind = new GroupMembershipItemKind();
        expect(kind.recoverable(Status.Timeout)).equals(true);
        expect(kind.recoverable(Status.Busy)).equals(true);
        expect(kind.recoverable(Status.ResourceExhausted)).equals(false);
    });
});
