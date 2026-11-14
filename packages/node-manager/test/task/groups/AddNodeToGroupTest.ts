/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RotationPreconditionError } from "#task/errors.js";
import { AddNodeToGroup, AddNodeToGroupParams } from "#task/groups/AddNodeToGroup.js";
import { RunningTaskContext } from "#task/RunningTaskContext.js";
import { RunRecord } from "#task/Task.js";
import { RunId } from "#task/types.js";
import { PeerAddress } from "@matter/protocol";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";
import { FakePeer } from "../helpers.js";

const GROUP_KEY_SET_ID = 42;
const OP_KEY = new Uint8Array(16).fill(0xab);
const NEW_KEY = new Uint8Array(16).fill(0xcd);
const OP_START = 946684800000001n;

function keySet(epochKey0: Uint8Array) {
    return {
        groupKeySetId: GROUP_KEY_SET_ID,
        groupKeySecurityPolicy: GroupKeyManagement.GroupKeySecurityPolicy.TrustFirst,
        epochKey0,
        epochStartTime0: OP_START,
        epochKey1: null,
        epochStartTime1: null,
        epochKey2: null,
        epochStartTime2: null,
    };
}

function paramsFor(peer: FakePeer): AddNodeToGroupParams {
    return {
        peer: peer.address,
        endpoint: 1,
        groupId: 0x101,
        groupKeySetId: GROUP_KEY_SET_ID,
        groupKeySecurityPolicy: GroupKeyManagement.GroupKeySecurityPolicy.TrustFirst,
        epochKey0: OP_KEY,
        epochStartTime0: OP_START,
    };
}

describe("AddNodeToGroup preconditions", () => {
    it("refuses a stale key however the members are ordered", () => {
        // The joining peer holds its own intent by the time the precondition is asked again after the write,
        // and nothing orders it last. A check that answers from the first member it finds would read the
        // joiner's own stale key and admit a join that splits the group.
        const joining = new FakePeer("joining");
        const rotated = new FakePeer("rotated");
        joining.setIntent("groupKey", String(GROUP_KEY_SET_ID), keySet(OP_KEY));
        rotated.setIntent("groupKey", String(GROUP_KEY_SET_ID), keySet(NEW_KEY));

        const params = paramsFor(joining);
        const record = new RunRecord(RunId(1), "addNodeToGroup:1", AddNodeToGroup.type, params);
        const all = [joining, rotated];
        const ctx = new RunningTaskContext(
            record,
            address => all.find(p => PeerAddress.is(p.address, address))?.asNode(),
            joining,
            () => {},
            undefined,
            // The joiner first, which is the order that hides a stale key from a check that stops at one.
            () => all.map(p => p.asNode()),
        );

        expect(() => AddNodeToGroup.phases(params)[0].requires?.(ctx)).throws(
            RotationPreconditionError,
            /holds group key set 42 with a different key/,
        );
    });

    it("admits a join carrying the key every member holds", () => {
        const joining = new FakePeer("joining");
        const member = new FakePeer("member");
        joining.setIntent("groupKey", String(GROUP_KEY_SET_ID), keySet(OP_KEY));
        member.setIntent("groupKey", String(GROUP_KEY_SET_ID), keySet(OP_KEY));

        const params = paramsFor(joining);
        const record = new RunRecord(RunId(1), "addNodeToGroup:1", AddNodeToGroup.type, params);
        const all = [joining, member];
        const ctx = new RunningTaskContext(
            record,
            address => all.find(p => PeerAddress.is(p.address, address))?.asNode(),
            joining,
            () => {},
            undefined,
            () => all.map(p => p.asNode()),
        );

        expect(() => AddNodeToGroup.phases(params)[0].requires?.(ctx)).not.throws();
    });
});
