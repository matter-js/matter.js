/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningServer } from "#behavior/system/commissioning/CommissioningServer.js";
import { OnOffLightDevice } from "#devices/on-off-light";
import type { ServerNode } from "#node/ServerNode.js";
import { Crypto, CRYPTO_PBKDF_ITERATIONS_MIN, InternalError, LogLevel, Seconds } from "@matter/general";
import { captureLog, MockSite } from "@matter/node/testing";
import {
    ControllerCommissioningFlow,
    DeviceCommissioner,
    PaseClient,
    PaseServer,
    SessionManager,
} from "@matter/protocol";
import { AdministratorCommissioning } from "@matter/types/clusters/administrator-commissioning";

const { WindowNotOpen, BasicWindowOpen, EnhancedWindowOpen } = AdministratorCommissioning.CommissioningWindowStatus;

/** Fails commissioning after the fail-safe is armed, so the controller expires the fail-safe with ArmFailSafe 0. */
class AbandoningFlow extends ControllerCommissioningFlow {
    override async executeCommissioning() {
        const index = this.commissioningSteps.findIndex(({ name }) => name === "AccessControl");
        this.commissioningSteps.splice(index, this.commissioningSteps.length - index, {
            ...this.commissioningSteps[index],
            name: "Abandon",
            stepLogic: async () => {
                throw new InternalError("Commissioning abandoned by the test");
            },
        });
        await super.executeCommissioning();
    }
}

function setEntropic(entropic: boolean, ...nodes: ServerNode[]) {
    for (const node of nodes) {
        const crypto = node.env.get(Crypto);
        if ("entropic" in crypto) {
            crypto.entropic = entropic;
        }
    }
}

function windowStatusOf(device: ServerNode) {
    return device.env.get(DeviceCommissioner).windowStatus;
}

describe("Commissioning attempt limit", () => {
    before(() => {
        MockTime.init();
    });

    async function setup() {
        const site = new MockSite();
        const controller = await site.addController();
        const device = await site.addDevice({ device: OnOffLightDevice });
        return { site, controller, device };
    }

    async function commission(
        { controller, device }: Awaited<ReturnType<typeof setup>>,
        options: { passcode?: number; commissioningFlowImpl?: typeof ControllerCommissioningFlow },
    ) {
        setEntropic(true, controller, device);
        try {
            const { passcode, discriminator } = device.state.commissioning;
            await MockTime.resolve(
                controller.peers
                    .commission({ passcode, discriminator, timeout: Seconds(90), ...options })
                    .catch(() => undefined),
                { macrotasks: true },
            );
        } finally {
            setEntropic(false, controller, device);
        }
    }

    it("closes the commissioning window after 20 abandoned commissioning attempts", async () => {
        const context = await setup();
        await using _site = context.site;

        for (let attempt = 1; attempt < 20; attempt++) {
            await commission(context, { commissioningFlowImpl: AbandoningFlow });
        }
        expect(windowStatusOf(context.device)).equals(BasicWindowOpen);

        await commission(context, { commissioningFlowImpl: AbandoningFlow });
        expect(windowStatusOf(context.device)).equals(WindowNotOpen);
    });

    it("starts counting again in a window the node opens anew", async () => {
        const context = await setup();
        await using _site = context.site;

        for (let attempt = 1; attempt < 20; attempt++) {
            await commission(context, { commissioningFlowImpl: AbandoningFlow });
        }
        await MockTime.resolve(context.device.act(agent => agent.get(CommissioningServer).enterCommissionableMode()));

        await commission(context, { commissioningFlowImpl: AbandoningFlow });
        expect(windowStatusOf(context.device)).equals(BasicWindowOpen);
    });

    it("counts a failed PASE pairing as a failed commissioning attempt", async () => {
        const context = await setup();
        await using _site = context.site;
        using log = captureLog(LogLevel.INFO);

        await commission(context, { passcode: 11223344 });

        expect(log.messages.some(message => message.includes("(1/20): PASE pairing failed"))).true;
        expect(windowStatusOf(context.device)).equals(BasicWindowOpen);
    });

    it("does not count a successful commissioning as a failed attempt", async () => {
        const context = await setup();
        await using _site = context.site;
        using log = captureLog(LogLevel.INFO);

        await commission(context, {});

        expect(context.device.lifecycle.isCommissioned).true;
        expect(log.messages.filter(message => message.includes("Commissioning attempt failed"))).deep.equals([]);
    });

    it("closes an enhanced commissioning window after 20 failed PASE pairings", async () => {
        const context = await setup();
        await using _site = context.site;
        const { device } = context;

        const crypto = device.env.get(Crypto);
        const salt = crypto.randomBytes(32);
        const iterations = CRYPTO_PBKDF_ITERATIONS_MIN;
        const verifier = await PaseClient.generatePakePasscodeVerifier(crypto, 20202021, { iterations, salt });
        const paseServer = PaseServer.fromVerificationValue(device.env.get(SessionManager), verifier, {
            iterations,
            salt,
        });
        await MockTime.resolve(
            device.env.get(DeviceCommissioner).allowEnhancedCommissioning(1234, paseServer, { byAdministrator: true }),
        );

        for (let attempt = 1; attempt < 20; attempt++) {
            paseServer.pairingFailed.emit(new InternalError("Pairing failed"));
        }
        expect(windowStatusOf(device)).equals(EnhancedWindowOpen);

        paseServer.pairingFailed.emit(new InternalError("Pairing failed"));
        await MockTime.macrotasks;
        expect(windowStatusOf(device)).equals(WindowNotOpen);
    });
});
