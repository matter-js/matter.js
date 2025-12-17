/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SoftwareUpdateManager } from "#behavior/system/software-update/SoftwareUpdateManager.js";
import { BasicInformationServer } from "#behaviors/basic-information";
import {
    OtaSoftwareUpdateRequestorClient,
    OtaSoftwareUpdateRequestorServer,
} from "#behaviors/ota-software-update-requestor";
import { OtaProviderEndpoint } from "#endpoints/ota-provider";
import { OtaRequestorEndpoint } from "#endpoints/ota-requestor";
import { Bytes, Crypto, Entropy, Environment, MockCrypto, StreamingStandardCrypto } from "#general";
import { ServerNode } from "#node/ServerNode.js";
import { FabricAuthority, PeerAddress } from "#protocol";
import { FabricIndex, VendorId } from "#types";
import { OtaSoftwareUpdateRequestor } from "@matter/types/clusters";
import { MockSite } from "../../node/mock-site.js";
import {
    createTestOtaImage,
    generateTestPayload,
    InstrumentedOtaProviderServer,
    InstrumentedOtaRequestorServer,
    storeOtaImage,
} from "./ota-utils.js";

describe("Ota", () => {
    before(() => {
        MockTime.init();

        // Required for crypto to succeed
        MockTime.macrotasks = true;
    });

    it("Successfully process a software update", async () => {
        // *** COMMISSIONING ***

        const controllerEnv = new Environment("1");
        const controllerCrypto = MockCrypto(1, StreamingStandardCrypto);
        controllerEnv.set(Entropy, controllerCrypto);
        controllerEnv.set(Crypto, controllerCrypto);
        const deviceEnv = new Environment("2");
        const deviceCrypto = MockCrypto(2, StreamingStandardCrypto);
        deviceEnv.set(Entropy, deviceCrypto);
        deviceEnv.set(Crypto, deviceCrypto);

        // Shared variable to hold expected OTA image for verification
        const data = { expectedOtaImage: Bytes.fromHex("") };

        const { applyUpdatePromise, announceOtaProviderPromise, TestOtaRequestorServer } =
            InstrumentedOtaRequestorServer({ requestUserConsent: false }, data);

        const {
            queryImagePromise,
            applyUpdateRequestPromise,
            checkUpdateAvailablePromise,
            notifyUpdateAppliedPromise,
            TestOtaProviderServer,
        } = InstrumentedOtaProviderServer({
            requestUserConsentForUpdate: false, // not relevant
        });

        await using site = new MockSite();
        // Device is automatically configured with vendorId 0xfff1 and productId 0x8000
        const { controller, device } = await site.addCommissionedPair({
            device: {
                environment: deviceEnv,
                type: ServerNode.RootEndpoint,
                parts: [{ id: "ota-requestor", type: OtaRequestorEndpoint.with(TestOtaRequestorServer) }],
            },
            controller: {
                environment: controllerEnv,
                type: ServerNode.RootEndpoint,
                parts: [{ id: "ota-provider", type: OtaProviderEndpoint.with(TestOtaProviderServer) }],
            },
        });

        const otaProvider = controller.parts.get("ota-provider")!;
        expect(otaProvider).not.undefined;
        const otaRequestor = device.parts.get("ota-requestor")!;
        expect(otaRequestor).not.undefined;

        // Enable test OTA images in the SoftwareUpdateManager via act()
        await otaProvider.act(agent => {
            agent.get(SoftwareUpdateManager).state.allowTestOtaImages = true;
        });

        const fabric = await otaProvider.act(agent => agent.env.get(FabricAuthority).fabrics[0]);

        expect(device.state.commissioning.commissioned).equals(true);
        expect(controller.peers.size).equals(1);

        // Verify that the Provider was correctly identified and written to the device
        expect(otaRequestor.stateOf(OtaSoftwareUpdateRequestorServer).defaultOtaProviders).deep.equals([
            {
                endpoint: otaProvider.number,
                fabricIndex: fabric.fabricIndex,
                providerNodeId: fabric.rootNodeId,
            },
        ]);

        // *** GENERATE AND STORE OTA IMAGE ***

        // Get device info from basicInformation
        const { vendorId, productId, softwareVersion } = device.state.basicInformation;
        const targetSoftwareVersion = softwareVersion + 1;

        // Generate 500KB of test payload data
        const payload = generateTestPayload(500 * 1024);

        // Create OTA image for next version, applicable to the current version range
        const otaImage = await createTestOtaImage(new StreamingStandardCrypto(), {
            vendorId,
            productId,
            softwareVersion: targetSoftwareVersion,
            softwareVersionString: `v${targetSoftwareVersion}.0.0`,
            minApplicableSoftwareVersion: 0,
            maxApplicableSoftwareVersion: softwareVersion,
            payload,
        });

        // Store expected OTA image for verification in applyUpdate
        data.expectedOtaImage = Bytes.of(otaImage.image);

        // Store OTA image to the controller's OTA service (test mode)
        await storeOtaImage(controller, otaImage, false /* isProduction = false for test */);

        // *** TRIGGER OTA UPDATE ***

        // Get the client view of the device (peer)
        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        // Get the peer address for force update
        const peerAddress = peer1.state.commissioning.peerAddress;
        expect(peerAddress).not.undefined;

        const updateStateEvents = new Array<OtaSoftwareUpdateRequestor.StateTransitionEvent>();
        peer1.endpoints
            .for(otaRequestor.number)
            .eventsOf(OtaSoftwareUpdateRequestorClient)
            .stateTransition.on((event: OtaSoftwareUpdateRequestor.StateTransitionEvent) => {
                updateStateEvents.push(event);
            });

        // Force the OTA update via SoftwareUpdateManager
        await otaProvider.act(agent => {
            return agent.get(SoftwareUpdateManager).forceUpdate(
                PeerAddress({
                    nodeId: peerAddress!.nodeId,
                    fabricIndex: FabricIndex(peerAddress!.fabricIndex),
                }),
                VendorId(vendorId),
                productId,
                targetSoftwareVersion,
            );
        });

        await MockTime.resolve(announceOtaProviderPromise);

        await MockTime.resolve(queryImagePromise);

        await MockTime.resolve(checkUpdateAvailablePromise);

        await MockTime.resolve(applyUpdateRequestPromise);

        // This should resolve when update is applied and data match
        await MockTime.resolve(applyUpdatePromise);

        // Shutdown node because our test node does not restart automatically and simulate update applied
        await MockTime.resolve(device.cancel());
        await device.setStateOf(BasicInformationServer, { softwareVersion: 1 });

        await MockTime.resolve(device.start());

        await MockTime.resolve(notifyUpdateAppliedPromise);

        expect(updateStateEvents).deep.equals([
            {
                previousState: OtaSoftwareUpdateRequestor.UpdateState.Idle,
                newState: OtaSoftwareUpdateRequestor.UpdateState.Querying,
                reason: OtaSoftwareUpdateRequestor.ChangeReason.Success,
                targetSoftwareVersion: null,
            },
            {
                previousState: OtaSoftwareUpdateRequestor.UpdateState.Querying,
                newState: OtaSoftwareUpdateRequestor.UpdateState.Downloading,
                reason: OtaSoftwareUpdateRequestor.ChangeReason.Success,
                targetSoftwareVersion: 1,
            },
            {
                previousState: OtaSoftwareUpdateRequestor.UpdateState.Downloading,
                newState: OtaSoftwareUpdateRequestor.UpdateState.Applying,
                reason: OtaSoftwareUpdateRequestor.ChangeReason.Success,
                targetSoftwareVersion: 1,
            },
            {
                previousState: OtaSoftwareUpdateRequestor.UpdateState.Applying,
                newState: OtaSoftwareUpdateRequestor.UpdateState.Idle,
                reason: 1,
                targetSoftwareVersion: null,
            },
        ]);
    }).timeout(10_000); // locally needs 1s, but CI might be slower

    // TODO Add more test cases for edge cases and error cases
});
