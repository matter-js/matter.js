/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServerNode } from "#node/ServerNode.js";
import { asError, Crypto, MatterError, MockCrypto, Seconds } from "@matter/general";
import { ControllerCommissioningFlow, NodeSession, SessionManager } from "@matter/protocol";
import { MockSite } from "./mock-site.js";

class FlowConstructionFailed extends MatterError {}

class UnconstructableFlow extends ControllerCommissioningFlow {
    constructor(...args: ConstructorParameters<typeof ControllerCommissioningFlow>) {
        super(...args);
        throw new FlowConstructionFailed();
    }
}

describe("Commissioning PASE session lifetime", () => {
    before(() => {
        MockTime.init();
    });

    function enableEntropy(controller: ServerNode, device: ServerNode) {
        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const deviceCrypto = device.env.get(Crypto) as MockCrypto;
        controllerCrypto.entropic = deviceCrypto.entropic = true;
    }

    it("closes the PASE session when the commissioning flow cannot be created", async () => {
        const site = new MockSite();
        try {
            const controller = await site.addController();
            const device = await site.addDevice();
            if (!controller.lifecycle.isOnline) {
                await controller.start();
            }
            enableEntropy(controller, device);
            const { passcode, discriminator } = device.state.commissioning;

            let caught: Error | undefined;
            await MockTime.resolve(
                controller.peers
                    .commission({
                        passcode,
                        discriminator,
                        commissioningFlowImpl: UnconstructableFlow,
                        timeout: Seconds(90),
                    })
                    .catch(error => {
                        caught = asError(error);
                    }),
                { macrotasks: true },
            );
            const paseSessionLeft: NodeSession | undefined = controller.env.get(SessionManager).getPaseSession();

            expect(caught).instanceOf(FlowConstructionFailed);
            expect(paseSessionLeft).undefined;
        } finally {
            await site.close();
        }
    });
});
