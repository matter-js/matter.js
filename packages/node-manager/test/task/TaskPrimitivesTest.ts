/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupKey } from "#reconcile/kinds.js";
import { findingOf, TaskFailedError, TaskFindingCode, TaskNotFoundError, TaskSlotOccupiedError } from "#task/errors.js";
import { peerLabel } from "#task/peer.js";
import { RunningTaskContext } from "#task/RunningTaskContext.js";
import { BoundDefinition, RunRecord, TaskDefinition } from "#task/Task.js";
import { TaskRegistry } from "#task/TaskRegistry.js";
import { isRetireSeq, isRunId, RetireSeq, RunId, TaskPhase } from "#task/types.js";
import { ImplementationError } from "@matter/general";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";
import { FakePeer, testAddress } from "./helpers.js";

const Nothing: TaskDefinition = {
    type: "nothing",
    slotKeyFor: () => "nothing:1",
    phases: () => new Array<TaskPhase>(),
};

describe("run identities", () => {
    it("refuses a value no run could be stored under", () => {
        // The two counters sit side by side in this layer, and ordering by the wrong one is the defect the
        // brands exist to prevent — so each refuses what it cannot be.
        for (const bad of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
            expect(() => RunId(bad), `RunId(${bad})`).throws(ImplementationError, /Invalid run id/);
            expect(() => RetireSeq(bad), `RetireSeq(${bad})`).throws(ImplementationError, /Invalid retirement/);
        }
        expect(RunId(1)).equals(1);
        expect(RetireSeq(1)).equals(1);
    });

    it("recognises what storage may hand back", () => {
        expect(isRunId(1)).equals(true);
        expect(isRunId("1")).equals(false);
        expect(isRetireSeq(0)).equals(false);
        expect(isRetireSeq(2)).equals(true);
    });
});

describe("task registry", () => {
    it("refuses a type nothing registered, rather than binding parameters to nothing", () => {
        const registry = new TaskRegistry();
        expect(() => registry.interpret("nothing", {})).throws(ImplementationError, /No task registered/);
        registry.register(Nothing);
        expect(registry.interpret("nothing", {}).type).equals("nothing");
    });
});

describe("naming a peer", () => {
    it("falls back to the local id while a node has no address", () => {
        const peer = new FakePeer("p1");
        expect(peerLabel(peer.asNode())).equals(peer.address.toString());
        peer.forgetAddress();
        expect(peerLabel(peer.asNode())).equals("p1");
    });

    it("fails a run rather than recording a change it could not name", async () => {
        // A record outlives the node, so an entry naming nothing could never be replayed.
        const peer = new FakePeer("p1");
        peer.forgetAddress();
        const record = new RunRecord(RunId(1), "nothing:1", Nothing.type, {});
        const ctx = new RunningTaskContext(
            record,
            () => peer.asNode(),
            peer,
            () => {},
        );
        const grant = {
            groupKeySetId: 7,
            groupKeySecurityPolicy: GroupKeyManagement.GroupKeySecurityPolicy.TrustFirst,
            epochKey0: new Uint8Array(16),
            epochStartTime0: 946684800000001n,
            epochKey1: null,
            epochStartTime1: null,
            epochKey2: null,
            epochStartTime2: null,
        };
        await expect(ctx.setIntent(peer.asNode(), GroupKey, "7", grant)).rejectedWith(
            TaskFailedError,
            /has no address, so what it is asked to hold cannot be recorded/,
        );
        expect(record.changeSet).deep.equals([]);
        expect(record.wrote).equals(false);
    });
});

describe("a refusal as data", () => {
    it("names the run a contention refusal is about, and no run otherwise", () => {
        const conflict = new TaskSlotOccupiedError("busy", RunId(7));
        expect(findingOf(conflict)).deep.equals({
            code: TaskFindingCode.SlotOccupied,
            message: "busy",
            owner: RunId(7),
        });
        const plain = new TaskNotFoundError("gone");
        expect(findingOf(plain).owner).equals(undefined);
        expect(findingOf(plain).code).equals(TaskFindingCode.NotFound);
    });
});

describe("what a task says about a peer that left", () => {
    const address = testAddress("gone");

    it("assumes work does not survive a departure it never considered", () => {
        // Silence is not consent: a definition that has not thought about a peer leaving should not go on
        // driving a fleet that changed under it.
        expect(new BoundDefinition(Nothing, {}).survivesWithout(address)).equals(false);
    });

    it("takes the definition's word when it has one", () => {
        const Fleetwide: TaskDefinition = { ...Nothing, survivesWithout: () => true };
        expect(new BoundDefinition(Fleetwide, {}).survivesWithout(address)).equals(true);
    });

    it("counts a peer as named when the work plans to change it", () => {
        const Planned: TaskDefinition = {
            ...Nothing,
            plannedChanges: () => [{ peer: address, kind: GroupKey, key: "7", intent: {} }],
        };
        const bound = new BoundDefinition(Planned, {});
        expect(bound.plansToChange(address)).equals(true);
        expect(bound.plansToChange(testAddress("other"))).equals(false);
    });
});
