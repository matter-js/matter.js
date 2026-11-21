/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupKeyGrant } from "#reconcile/GroupKeyItemKind.js";
import { BUILT_IN_KINDS, GroupKey } from "#reconcile/kinds.js";
import { AddNodeToGroup } from "#task/groups/AddNodeToGroup.js";
import { RemoveNodeFromGroup } from "#task/groups/RemoveNodeFromGroup.js";
import { RotateGroupKey } from "#task/groups/RotateGroupKey.js";
import { Rollback } from "#task/Rollback.js";
import { TaskDefinition } from "#task/Task.js";
import { RunId } from "#task/types.js";
import { ImplementationError } from "@matter/general";
import { ItemKind } from "@matter/node";
import { FabricIndex, NodeId } from "@matter/types";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";
import { testAddress } from "./helpers.js";

const ADD = {
    peer: testAddress("peer1"),
    endpoint: 1,
    groupId: 42,
    groupKeySetId: 7,
    groupKeySecurityPolicy: 0,
    epochKey0: new Uint8Array(16),
    epochStartTime0: 946684800000001n,
};
const REMOVE = { peer: testAddress("peer1"), endpoint: 1, groupId: 42 };
const ROTATE = { groupKeySetId: 7, newEpochKey: new Uint8Array(16) };
const ROLLBACK = { originalRunId: RunId(1), entries: [{ peer: testAddress("p"), kind: "groupKey", key: "7" }] };

/** Asserts a definition accepts its good params and refuses each mutation of them. */
function refuses<P>(definition: TaskDefinition<P>, good: P, bad: Record<string, unknown>) {
    expect(() => definition.validate?.(good)).not.throws();
    for (const [field, value] of Object.entries(bad)) {
        expect(() => definition.validate?.({ ...good, [field]: value } as P), `${field}`).throws(ImplementationError);
    }
}

describe("typed item kinds", () => {
    it("gives each built-in kind one registered instance, so a reference is an identity", () => {
        // A task names a kind by reference. Two instances of one name would let a task pass a kind the
        // reconciler does not drive, which no type could catch.
        expect(new Set(BUILT_IN_KINDS.map(k => k.kind)).size).equals(BUILT_IN_KINDS.length);
        expect(BUILT_IN_KINDS).contains(GroupKey);
    });

    it("types the intent from the kind", () => {
        // Compile-time, not runtime: `GroupKey` is an ItemKind<GroupKeyGrant>, so `setIntent` with it accepts
        // only that shape and `intentOf` returns it. A misspelled kind is no longer expressible at all —
        // there is no string to misspell.
        const typed: ItemKind<GroupKeyGrant> = GroupKey;
        expect(typed.kind).equals("groupKey");
    });
});

describe("built-in task parameter validation", () => {
    // Every built-in declares `validate`, so a record read back from storage is checked before it is driven.
    // Until this existed, `interpret` refused an unregistered type and nothing else, so a corrupt record was
    // bound and driven against a device.
    it("every built-in declares validate", () => {
        for (const definition of [AddNodeToGroup, RemoveNodeFromGroup, RotateGroupKey, Rollback]) {
            expect(definition.validate, definition.type).not.equals(undefined);
        }
    });

    it("refuses malformed AddNodeToGroup parameters", () => {
        refuses(AddNodeToGroup, ADD, {
            peer: { fabricIndex: 0, nodeId: 1n },
            endpoint: -1,
            groupId: 0x1_0000,
            groupKeySetId: 1.5,
            epochKey0: new Uint8Array(15),
            epochStartTime0: 0,
        });
        // A time below the Matter epoch is a bigint of the right type that the wire format cannot carry:
        // `TlvEpochUs` subtracts the epoch and refuses the negative result while encoding, far from the caller.
        expect(() => AddNodeToGroup.validate?.({ ...ADD, epochStartTime0: 946684799999999n })).throws(
            ImplementationError,
        );
    });

    it("refuses a group id the device path would reject", () => {
        // GroupKeyMap carries application group ids only; the universal groups at the top of the range are
        // addressed, not administered. Admitting one here would fail at the first device write instead.
        for (const groupId of [0xff00, 0xfffe, 0xffff]) {
            refuses(AddNodeToGroup, ADD, { groupId });
            refuses(RemoveNodeFromGroup, REMOVE, { groupId });
        }
        expect(() => AddNodeToGroup.validate?.({ ...ADD, groupId: 0xfeff })).not.throws();
    });

    it("refuses malformed RemoveNodeFromGroup parameters", () => {
        refuses(RemoveNodeFromGroup, REMOVE, { peer: undefined, endpoint: "1", groupId: null });
    });

    it("refuses malformed RotateGroupKey parameters", () => {
        refuses(RotateGroupKey, ROTATE, { groupKeySetId: undefined, newEpochKey: new Uint8Array(32) });
    });

    it("refuses a change entry whose prior is not a restorable value", () => {
        // A prior read back from storage is driven straight into desired state, so a malformed one refused
        // here is the difference between a coded refusal and a throw from inside the rollback's replay.
        for (const prior of [null, 42, { intent: {}, mode: "sometimes" }, { mode: "maintain" }]) {
            expect(
                () => Rollback.validate?.({ ...ROLLBACK, entries: [{ ...ROLLBACK.entries[0], prior }] } as never),
                String(prior),
            ).throws(ImplementationError);
        }
        expect(() =>
            Rollback.validate?.({
                ...ROLLBACK,
                entries: [{ ...ROLLBACK.entries[0], prior: { intent: {}, mode: "maintain" } }],
            } as never),
        ).not.throws();
    });

    it("refuses a group key security policy the key set struct cannot carry", () => {
        expect(() => AddNodeToGroup.validate?.({ ...ADD, groupKeySecurityPolicy: 7 as never })).throws(
            ImplementationError,
        );
        expect(() => RotateGroupKey.validate?.({ ...ROTATE, groupKeySecurityPolicy: 7 as never })).throws(
            ImplementationError,
        );
        // Optional on a rotation, which otherwise keeps the policy the key set already has.
        expect(() => RotateGroupKey.validate?.({ ...ROTATE, groupKeySecurityPolicy: undefined })).not.throws();
        expect(() =>
            RotateGroupKey.validate?.({
                ...ROTATE,
                groupKeySecurityPolicy: GroupKeyManagement.GroupKeySecurityPolicy.CacheAndSync,
            }),
        ).not.throws();
    });

    it("refuses a group name the cluster cannot carry", () => {
        // Groups constrains AddGroup's GroupName to 16 characters; beyond that the device path refuses while
        // encoding, with no code a caller can act on.
        expect(() => AddNodeToGroup.validate?.({ ...ADD, groupName: "x".repeat(17) })).throws(ImplementationError);
        expect(() => AddNodeToGroup.validate?.({ ...ADD, groupName: "x".repeat(16) })).not.throws();
        expect(() => AddNodeToGroup.validate?.({ ...ADD, groupName: undefined })).not.throws();
        // Groups requires the empty string as the name of a group that has none, so a caller must be able to
        // say so explicitly rather than only by omission.
        expect(() => AddNodeToGroup.validate?.({ ...ADD, groupName: "" })).not.throws();
        expect(() => AddNodeToGroup.validate?.({ ...ADD, groupName: 7 as never })).throws(ImplementationError);
    });

    it("refuses a group or key set identity of zero", () => {
        // Group 0 is "no group" (Groups constrains AddGroup/RemoveGroup to min 1) and key set 0 is the IPK,
        // which commissioning owns.
        expect(() => AddNodeToGroup.validate?.({ ...ADD, groupId: 0 })).throws(ImplementationError);
        expect(() => AddNodeToGroup.validate?.({ ...ADD, groupKeySetId: 0 })).throws(ImplementationError);
        expect(() => RemoveNodeFromGroup.validate?.({ ...REMOVE, groupId: 0 })).throws(ImplementationError);
        expect(() => RotateGroupKey.validate?.({ ...ROTATE, groupKeySetId: 0 })).throws(ImplementationError);
    });

    it("refuses malformed Rollback parameters", () => {
        refuses(Rollback, ROLLBACK, { originalRunId: 0, entries: undefined });
        expect(() => Rollback.validate?.({ ...ROLLBACK, entries: [{ peer: testAddress("p") }] as never })).throws(
            ImplementationError,
        );
    });

    it("refuses params that are not an object at all", () => {
        for (const definition of [AddNodeToGroup, RemoveNodeFromGroup, RotateGroupKey, Rollback]) {
            expect(() => definition.validate?.(undefined as never), definition.type).throws(ImplementationError);
            expect(() => definition.validate?.(null as never), definition.type).throws(ImplementationError);
            // An array is an object to `typeof` and has none of the fields a definition reads, so it is
            // refused where the parameters are named rather than where the first field turns up missing.
            let message = "";
            try {
                definition.validate?.([] as never);
            } catch (e) {
                message = (e as Error).message;
            }
            expect(message, definition.type).contains(`Parameters for task "${definition.type}" must be an object`);
        }
    });

    it("names the rejected field without reproducing its value", () => {
        // Params carry raw group keys, so a message that echoed the value would put key material in a log.
        let message = "";
        try {
            RotateGroupKey.validate?.({ ...ROTATE, newEpochKey: new Uint8Array([1, 2, 3]) });
        } catch (e) {
            message = (e as Error).message;
        }
        expect(message).contains("newEpochKey");
        expect(message).not.contains("1,2,3");
    });
});

describe("what a parameter check refuses", () => {
    // Each of these reaches a built-in through its own `validate`, which is the only door a caller or a
    // stored record has to them.
    it("refuses key material that is not bytes, and says what arrived instead", () => {
        expect(() => AddNodeToGroup.validate?.({ ...ADD, epochKey0: "sixteen chars!!!" } as never)).throws(
            ImplementationError,
            /"epochKey0" must be a Uint8Array, not string/,
        );
        expect(() => AddNodeToGroup.validate?.({ ...ADD, epochKey0: new Uint8Array(8) })).throws(
            ImplementationError,
            /"epochKey0" must be 16 bytes, not 8/,
        );
        // The description of a rejected value never carries the value: params hold raw group keys.
        expect(() => RotateGroupKey.validate?.({ ...ROTATE, newEpochKey: new Uint8Array(20) })).throws(
            ImplementationError,
            /must be 16 bytes, not 20/,
        );
    });

    it("refuses the wildcard endpoint, which names no endpoint at all", () => {
        for (const definition of [AddNodeToGroup, RemoveNodeFromGroup] as const) {
            expect(() => definition.validate?.({ ...ADD, ...REMOVE, endpoint: 0xffff } as never)).throws(
                ImplementationError,
                /"endpoint" must be an integer in 0\.\.65534/,
            );
            expect(() => definition.validate?.({ ...ADD, ...REMOVE, endpoint: 0xfffe } as never)).not.throws();
        }
    });

    it("refuses a group name carrying an information separator", () => {
        // A conformant encoder refuses it far from the caller that supplied it, so this one refuses it here.
        expect(() => AddNodeToGroup.validate?.({ ...ADD, groupName: "kitchen\u001flights" })).throws(
            ImplementationError,
            /must not contain an information separator/,
        );
    });

    it("refuses an address that could never be resolved again", () => {
        expect(() => AddNodeToGroup.validate?.({ ...ADD, peer: { fabricIndex: 1, nodeId: 7 } as never })).throws(
            ImplementationError,
            /"peer.nodeId" must be a node id/,
        );
        expect(() => AddNodeToGroup.validate?.({ ...ADD, peer: { fabricIndex: 1, nodeId: 0n } as never })).throws(
            ImplementationError,
            /must be an operational node id/,
        );
        // A uint64 in a reserved range is not an address either: no commissioned peer answers to a
        // CASE-authenticated tag or a PAKE subject, so a run naming one would hold a target forever.
        for (const reserved of [0xfffffffd00000001n, 0xfffffffe00000001n, 0xfffffffb00000001n]) {
            expect(() =>
                AddNodeToGroup.validate?.({ ...ADD, peer: { fabricIndex: 1, nodeId: reserved } as never }),
            ).throws(ImplementationError, /must be an operational node id/);
        }
    });

    it("refuses a group address for work that drives one peer", () => {
        // Group addresses are a different thing entirely: nothing answers for them individually.
        expect(() =>
            RemoveNodeFromGroup.validate?.({
                ...REMOVE,
                peer: { fabricIndex: FabricIndex(1), nodeId: NodeId(0xffffffffffff0001n) },
            }),
        ).throws(ImplementationError, /is a group address/);
    });
});
