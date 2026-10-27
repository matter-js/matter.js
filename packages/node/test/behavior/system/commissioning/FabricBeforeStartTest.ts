/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningServer } from "#behavior/system/commissioning/CommissioningServer.js";
import { ControllerBehavior } from "#behavior/system/controller/ControllerBehavior.js";
import { createPromise, LogLevel, MemoryStorageDriver, SupportedStorageTypes, Transaction } from "@matter/general";
import { captureLog, MockServerNode, MockSite } from "@matter/node/testing";
import { FabricAuthority } from "@matter/protocol";
import { FabricId } from "@matter/types";

let operational = 0;
let exclusiveWhenOperational: boolean | undefined;
let onOperational: (() => void) | undefined;

class RecordingCommissioningServer extends CommissioningServer {
    protected override enterOperationalMode() {
        operational++;
        exclusiveWhenOperational = this.context.transaction.status === Transaction.Status.Exclusive;
        onOperational?.();
        super.enterOperationalMode();
    }
}

/**
 * Holds the first write of the fabric list until {@link release} resolves, as file storage does when the write
 * settles only after the node started going online.
 */
class GatedFabricStorage extends MemoryStorageDriver {
    readonly writing = createPromise<void>();
    readonly release = createPromise<void>();
    #gated = false;

    override set(
        contexts: string[],
        keyOrValues: string | Record<string, SupportedStorageTypes>,
        value?: SupportedStorageTypes,
    ) {
        if (!this.#gated && contexts.includes("fabrics") && typeof keyOrValues === "object") {
            this.#gated = true;
            this.writing.resolver();
            return this.release.promise.then(() => super.set(contexts, keyOrValues, value));
        }
        return super.set(contexts, keyOrValues, value);
    }
}

async function addController(site: MockSite) {
    return site.addNode(MockServerNode.RootEndpoint.with(ControllerBehavior, RecordingCommissioningServer), {
        id: "controller",
        online: false,
        commissioning: { enabled: false },
        controller: { adminFabricId: FabricId(1) },
    });
}

describe("A fabric created before the node starts", () => {
    before(() => {
        MockTime.init();
    });

    beforeEach(() => {
        operational = 0;
        exclusiveWhenOperational = undefined;
        onOperational = undefined;
    });

    it("counts the node as commissioned and advertises it operationally once online", async () => {
        await using site = new MockSite();
        const controller = await addController(site);

        // As a controller app does on its first run, under the label the controller itself uses
        const authority = await controller.env.load(FabricAuthority);
        await authority.defaultFabric({ adminFabricLabel: controller.stateOf(ControllerBehavior).adminFabricLabel });

        let commissioned = 0;
        controller.lifecycle.commissioned.on(() => {
            commissioned++;
        });

        await MockTime.resolve(controller.start());

        expect(commissioned).equals(1);
        expect(controller.lifecycle.isCommissioned).true;
        expect(controller.stateOf(CommissioningServer).commissioned).true;
        expect(operational).equals(1);
    });

    // Regression test: real callers no longer start the node while createFabric is still pending
    it("logs no error when the fabric write settles while the node goes online", async () => {
        const gate = new GatedFabricStorage();
        await using site = new MockSite({ createStorageDriver: () => gate });
        const controller = await addController(site);

        const authority = await controller.env.load(FabricAuthority);
        const created = authority.defaultFabric({
            adminFabricLabel: controller.stateOf(ControllerBehavior).adminFabricLabel,
        });
        await MockTime.resolve(gate.writing.promise);

        using log = captureLog(LogLevel.ERROR);
        const errors = log.messages;
        const changes = new Array<string>();
        controller.events.commissioning.fabricsChanged.on((index, action) => void changes.push(`${index} ${action}`));
        onOperational = () => gate.release.resolver();

        // Keeps the online transaction open past the commissioning server, as further online work of a real node does
        controller.lifecycle.online.on(async () => {
            for (let i = 0; i < 5; i++) {
                await MockTime.macrotask;
            }
        });

        await MockTime.resolve(controller.start());
        await MockTime.resolve(created);
        await MockTime.macrotask;
        await MockTime.macrotask;

        expect(errors).deep.equals([]);
        expect(changes).deep.equals([]);
        expect(controller.stateOf(CommissioningServer).commissioned).true;
    });

    it("commits the commissioned state before it advertises the node operationally", async () => {
        await using site = new MockSite();
        const controller = await addController(site);

        const authority = await controller.env.load(FabricAuthority);
        await authority.defaultFabric({ adminFabricLabel: controller.stateOf(ControllerBehavior).adminFabricLabel });

        await MockTime.resolve(controller.start());

        expect(operational).equals(1);
        expect(exclusiveWhenOperational).false;
    });

    it("waits for another transaction that holds the commissioning state", async () => {
        await using site = new MockSite();
        const controller = await addController(site);

        const authority = await controller.env.load(FabricAuthority);
        await authority.defaultFabric({ adminFabricLabel: controller.stateOf(ControllerBehavior).adminFabricLabel });

        using log = captureLog(LogLevel.ERROR);
        const errors = log.messages;
        const locked = createPromise<void>();
        const release = createPromise<void>();
        const holder = controller.act("holder", async agent => {
            await agent.context.transaction.lock(agent.get(CommissioningServer));
            locked.resolver();
            await release.promise;
        });
        await MockTime.resolve(locked.promise);

        await MockTime.resolve(
            Promise.all([
                controller.start(),
                (async () => {
                    await MockTime.macrotask;
                    release.resolver();
                    await holder;
                })(),
            ]),
        );

        expect(errors).deep.equals([]);
        expect(controller.stateOf(CommissioningServer).commissioned).true;
        expect(operational).equals(1);
    });
});
