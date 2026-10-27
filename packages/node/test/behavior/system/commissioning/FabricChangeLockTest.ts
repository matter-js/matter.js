/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningServer } from "#behavior/system/commissioning/CommissioningServer.js";
import { ControllerBehavior } from "#behavior/system/controller/ControllerBehavior.js";
import { createPromise, LogLevel } from "@matter/general";
import { captureLog, CommissioningHelper, MockServerNode, MockSite } from "@matter/node/testing";
import { FabricAuthority, FabricManager } from "@matter/protocol";
import { FabricId, FabricIndex, NodeId } from "@matter/types";

describe("A fabric added while the node is online", () => {
    before(() => {
        MockTime.init();
    });

    it("updates the commissioned state once another transaction releases it", async () => {
        await using site = new MockSite();
        const controller = await site.addNode(MockServerNode.RootEndpoint.with(ControllerBehavior), {
            id: "controller",
            commissioning: { enabled: false },
            controller: { adminFabricId: FabricId(1) },
        });
        expect(controller.stateOf(CommissioningServer).commissioned).false;

        using log = captureLog(LogLevel.ERROR);
        const errors = log.messages;
        const changes = new Array<string>();
        const changed = createPromise<void>();
        controller.events.commissioning.fabricsChanged.on((index, action) => {
            changes.push(`${index} ${action}`);
            changed.resolver();
        });

        const authority = await controller.env.load(FabricAuthority);
        await controller.act("holder", async agent => {
            await agent.context.transaction.lock(agent.get(CommissioningServer));
            await authority.defaultFabric({
                adminFabricLabel: controller.stateOf(ControllerBehavior).adminFabricLabel,
            });

            // Give the fabric reactor time to reach the commissioning state while this transaction holds it
            await MockTime.macrotask;
            await MockTime.macrotask;
        });

        await MockTime.resolve(Promise.race([changed.promise, MockTime.sleep("reaction", 1000)]));

        expect(errors).deep.equals([]);
        expect(changes).deep.equals(["1 added"]);
        expect(controller.stateOf(CommissioningServer).commissioned).true;
    });

    it("counts a fabric the fail-safe committed once another transaction releases the commissioning state", async () => {
        const { node } = await CommissioningHelper().almostCommission();
        const deviceFabric = node.env.get(FabricManager).fabrics[0];

        using log = captureLog(LogLevel.ERROR);
        const errors = log.messages;
        const changes = new Array<string>();
        const changed = createPromise<void>();
        node.events.commissioning.fabricsChanged.on((index, action) => {
            changes.push(`${index} ${action}`);
            changed.resolver();
        });

        const locked = createPromise<void>();
        const release = createPromise<void>();
        const holder = node.act("holder", async agent => {
            await agent.context.transaction.lock(agent.get(CommissioningServer));
            locked.resolver();
            await release.promise;
        });
        await MockTime.resolve(locked.promise);

        const exchange = await node.createExchange({ fabric: deviceFabric, peerNodeId: NodeId(1) });
        await node.online({ exchange, command: true }, agent =>
            MockTime.resolve(agent.generalCommissioning.commissioningComplete()),
        );
        await MockTime.macrotask;
        expect(changes).deep.equals([]);

        release.resolver();
        await MockTime.resolve(holder);
        await MockTime.resolve(Promise.race([changed.promise, MockTime.sleep("reaction", 1000)]));

        expect(errors).deep.equals([]);
        expect(changes).deep.equals([`${FabricIndex(1)} added`]);
        expect(node.state.commissioning.commissioned).true;

        await node.close();
    });
});
