/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regression test for regulatory-config commissioning of radio (Wi-Fi/Thread) devices.
 *
 * Devices with a Wi-Fi or Thread NetworkCommissioning interface require the commissioner to send
 * SetRegulatoryConfig, whose `countryCode` field is mandatory.  ControllerCommissioner supplies the defaults
 * ("XX" / Outdoor); the bug was that CommissioningClient always forwards a `regulatoryCountryCode` key (even when
 * the caller omits it), and the previous `{ default, ...options }` merge let that explicit `undefined` clobber the
 * default, producing "Missing mandatory field countryCode".
 */

import { NetworkCommissioningServer } from "#behaviors/network-commissioning";
import { OnOffLightDevice } from "#devices/on-off-light";
import { ServerNode } from "#node/ServerNode.js";
import { Crypto, MockCrypto, Seconds } from "@matter/general";
import { ControllerCommissioningFlow } from "@matter/protocol";
import { NetworkCommissioning } from "@matter/types/clusters/network-commissioning";
import { MockSite } from "./mock-site.js";

class WifiCommissioningServer extends NetworkCommissioningServer.with("WiFiNetworkInterface") {
    override initialize() {
        this.state.maxNetworks = 4;
        this.state.scanMaxTimeSeconds = 20;
        this.state.connectMaxTimeSeconds = 40;
        this.state.supportedWiFiBands = [NetworkCommissioning.WiFiBand["2G4"]];
    }
}

const WifiLightDevice = OnOffLightDevice.with(WifiCommissioningServer);

/**
 * Truncates the standard flow after SetRegulatoryConfig, then throws a sentinel.
 *
 * If the regulatory step itself rejects (the bug) commission() rejects with that error.  If it succeeds (the fix)
 * commission() rejects with the sentinel — proving the flow got past regulatory config.
 */
const REGULATORY_PASSED = "regulatory-step-passed";

class StopAfterRegulatoryFlow extends ControllerCommissioningFlow {
    override async executeCommissioning() {
        const keep = new Set([
            "GetInitialData",
            "GeneralCommissioning.ArmFailsafe",
            "GeneralCommissioning.ConfigureRegulatoryInformation",
        ]);
        for (let i = this.commissioningSteps.length - 1; i >= 0; i--) {
            if (!keep.has(this.commissioningSteps[i].name)) {
                this.commissioningSteps.splice(i, 1);
            }
        }
        await super.executeCommissioning();
        throw new Error(REGULATORY_PASSED);
    }
}

describe("Regulatory config commissioning", () => {
    before(() => {
        MockTime.init();
    });

    function enableEntropy(controller: ServerNode, device: ServerNode) {
        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const deviceCrypto = device.env.get(Crypto) as MockCrypto;
        controllerCrypto.entropic = deviceCrypto.entropic = true;
    }

    async function commissionAndCaptureError(regulatoryCountryCode?: string) {
        const site = new MockSite();
        try {
            const controller = await site.addController();
            const device = await site.addNode(undefined, { device: WifiLightDevice });
            if (!controller.lifecycle.isOnline) {
                await controller.start();
            }
            enableEntropy(controller, device);

            const { passcode, discriminator } = device.state.commissioning;

            let caught: unknown;
            await MockTime.resolve(
                controller.peers
                    .commission({
                        passcode,
                        discriminator,
                        commissioningFlowImpl: StopAfterRegulatoryFlow,
                        timeout: Seconds(90),
                        ...(regulatoryCountryCode === undefined ? {} : { regulatoryCountryCode }),
                    })
                    .catch(error => {
                        caught = error;
                    }),
                { macrotasks: true },
            );

            return caught;
        } finally {
            await site.close();
        }
    }

    it("sends the default country code when the caller omits regulatoryCountryCode", async () => {
        const error = await commissionAndCaptureError();

        // The fix: regulatory config succeeds with the "XX" default, so we reach the sentinel.
        // The bug: regulatory config rejects with "Missing mandatory field countryCode" before the sentinel.
        expect(`${(error as Error)?.message}`).to.contain(REGULATORY_PASSED);
        expect(`${(error as Error)?.message}`).to.not.contain("countryCode");
    });

    it("sends an explicit country code when provided", async () => {
        const error = await commissionAndCaptureError("NL");

        expect(`${(error as Error)?.message}`).to.contain(REGULATORY_PASSED);
        expect(`${(error as Error)?.message}`).to.not.contain("countryCode");
    });
});
