/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdManagementServer } from "#behaviors/icd-management";
import { ServerNode } from "#node/index.js";
import { MockServerNode } from "../../node/mock-server-node.js";
import { MockSite } from "../../node/mock-site.js";

const RootWithIcd = ServerNode.RootEndpoint.with(IcdManagementServer);

describe("IcdManagementServer", () => {
    before(() => {
        MockTime.init();
    });

    describe("attribute defaults and CIP feature", () => {
        it("installs with CIP and exposes correct attribute values when configured", async () => {
            await using site = new MockSite();
            const { device } = await site.addCommissionedPair({
                device: {
                    type: RootWithIcd,
                    icdManagement: {
                        idleModeDuration: 3600,
                        activeModeDuration: 1000,
                        activeModeThreshold: 500,
                        clientsSupportedPerFabric: 2,
                        maximumCheckInBackoff: 3600,
                    },
                },
            });

            const state = device.stateOf(IcdManagementServer);
            expect(state.idleModeDuration).equals(3600);
            expect(state.activeModeDuration).equals(1000);
            expect(state.activeModeThreshold).equals(500);
            expect(state.clientsSupportedPerFabric).equals(2);
            expect(state.maximumCheckInBackoff).equals(3600);
            expect(state.registeredClients).deep.equals([]);
            expect(state.icdCounter).greaterThanOrEqual(0);
        });

        it("accepts spec default attribute values without config override", async () => {
            await using site = new MockSite();
            const { device } = await site.addCommissionedPair({
                device: {
                    type: RootWithIcd,
                },
            });

            const state = device.stateOf(IcdManagementServer);
            // Spec defaults: idleModeDuration=1s, activeModeDuration=300ms — constraint satisfied (1000ms >= 300ms).
            expect(state.idleModeDuration).equals(1);
            expect(state.activeModeDuration).equals(300);
            expect(state.maximumCheckInBackoff).equals(1);
        });
    });

    describe("constraint validation", () => {
        // Both tests verify that an ImplementationError thrown from initialize() surfaces as an initialization
        // failure. The distinct invalid configurations ensure each constraint code path is independently exercised.

        it("rejects when idleModeDuration * 1000 < activeModeDuration", async () => {
            // idleModeDuration=1s → 1000ms, activeModeDuration=5000ms: 1000 < 5000 → invalid
            await expect(
                MockServerNode.create(RootWithIcd, {
                    icdManagement: { idleModeDuration: 1, activeModeDuration: 5000 },
                }),
            ).rejectedWith("Behaviors have errors");
        });

        it("rejects when maximumCheckInBackoff < idleModeDuration", async () => {
            // idleModeDuration=3600s, maximumCheckInBackoff=1800s: 1800 < 3600 → invalid
            await expect(
                MockServerNode.create(RootWithIcd, {
                    icdManagement: { idleModeDuration: 3600, activeModeDuration: 300, maximumCheckInBackoff: 1800 },
                }),
            ).rejectedWith("Behaviors have errors");
        });
    });

    describe("ICD counter", () => {
        // MockSite has no restart primitive, so boot-bump and increment linkage is tested against a live device node.

        it("applies boot bump to icdCounter attribute on node online", async () => {
            await using site = new MockSite();
            const { device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            // Fresh node seeds from the default 0; the constructor boot bump advances it past 0.
            expect(device.stateOf(IcdManagementServer).icdCounter).greaterThan(0);
        });

        it("persists icdCounter attribute when the internal counter is incremented", async () => {
            await using site = new MockSite();
            const { device } = await site.addCommissionedPair({
                device: { type: RootWithIcd },
            });

            const before = device.stateOf(IcdManagementServer).icdCounter;

            // Increment via device.act so the call runs inside the node's actor context.  The reactTo subscriber
            // (#persistCounter) fires in an independent LocalActorContext; we wait for all pending microtasks and
            // macrotasks to drain before reading the attribute back.
            await device.act(agent => {
                const { icdCounter } = agent.get(IcdManagementServer).internal;
                if (icdCounter === undefined) throw new Error("icdCounter not initialized");
                icdCounter.increment();
            });
            await MockTime.resolve(Promise.resolve());

            const after = device.stateOf(IcdManagementServer).icdCounter;
            expect(after).equals(before + 1);
        });
    });
});
