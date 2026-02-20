/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SoftwareUpdateManager } from "#behavior/system/software-update/SoftwareUpdateManager.js";
import { BasicInformationServer } from "#behaviors/basic-information";
import {
    OtaSoftwareUpdateRequestorClient,
    OtaSoftwareUpdateRequestorServer,
} from "#behaviors/ota-software-update-requestor";
import { OtaSoftwareUpdateRequestor } from "#clusters/ota-software-update-requestor";
import { Bytes, createPromise, MockFetch } from "#general";
import { FabricAuthority, PeerAddress } from "#protocol";
import { FabricIndex, VendorId } from "#types";
import {
    addTestOtaImage,
    initOtaSite,
    InstrumentedOtaProviderServer,
    InstrumentedOtaRequestorServer,
} from "./ota-utils.js";

describe("Ota", () => {
    let fetchMock: MockFetch;

    before(() => {
        MockTime.init();
    });

    beforeEach(() => {
        // Mock DCL network requests to return 404 so tests don't hit real DCL servers
        // This ensures the test uses locally stored OTA images only
        fetchMock = new MockFetch();

        // Mock both production and test DCL software version endpoints with 404 responses
        // Production DCL: on.dcl.csa-iot.org
        fetchMock.addResponse(
            /on\.dcl\.csa-iot\.org\/dcl\/model\/versions\//,
            { code: 404, message: "Not found", details: [] },
            { status: 404 },
        );
        // Test DCL: on.test-net.dcl.csa-iot.org
        fetchMock.addResponse(
            /on\.test-net\.dcl\.csa-iot\.org\/dcl\/model\/versions\//,
            { code: 404, message: "Not found", details: [] },
            { status: 404 },
        );

        fetchMock.install();
    });

    afterEach(() => {
        fetchMock.uninstall();
    });

    it("Successfully processes a software update", async () => {
        // *** COMMISSIONING ***

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

        const { site, device, controller, otaProvider, otaRequestor } = await initOtaSite(
            TestOtaProviderServer,
            TestOtaRequestorServer,
        );
        await using _localSite = site;

        const fabric = await otaProvider.act(agent => agent.env.get(FabricAuthority).fabrics[0]);

        expect(device.state.commissioning.commissioned).equals(true);
        expect(controller.peers.size).equals(1);

        // Wait until defaults got announced
        await MockTime.resolve(otaRequestor.eventsOf(OtaSoftwareUpdateRequestorServer).defaultOtaProviders$Changed);

        // Verify that the Provider was correctly identified and written to the device
        expect(otaRequestor.stateOf(OtaSoftwareUpdateRequestorServer).defaultOtaProviders).deep.equals([
            {
                endpoint: otaProvider.number,
                fabricIndex: fabric.fabricIndex,
                providerNodeId: fabric.rootNodeId,
            },
        ]);

        // *** GENERATE AND STORE OTA IMAGE ***

        const { otaImage, vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);

        // Store expected OTA image for verification in applyUpdate
        data.expectedOtaImage = Bytes.of(otaImage.image);

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
            return agent
                .get(SoftwareUpdateManager)
                .forceUpdate(peerAddress!, VendorId(vendorId), productId, targetSoftwareVersion);
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

        await site[Symbol.asyncDispose]();
    }).timeout(10_000); // locally needs 1s, but CI might be slower

    it("Cancel a software update before download by removing consent", async () => {
        // *** COMMISSIONING ***

        const { TestOtaRequestorServer } = InstrumentedOtaRequestorServer({
            requestUserConsent: false,
        });

        const { queryImagePromise, TestOtaProviderServer } = InstrumentedOtaProviderServer({
            requestUserConsentForUpdate: false, // not relevant
        });

        const { site, device, controller, otaProvider, otaRequestor } = await initOtaSite(
            TestOtaProviderServer,
            TestOtaRequestorServer,
        );
        await using _localSite = site;

        // *** GENERATE AND STORE OTA IMAGE ***

        const { vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);

        // *** TRIGGER OTA UPDATE ***

        // Get the client view of the device (peer)
        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        // Get the peer address for force update
        const peerAddress = peer1.state.commissioning.peerAddress;
        expect(peerAddress).not.undefined;

        const { promise: idlePromise, resolver: idleResolver } = createPromise<void>();
        const updateStateEvents = new Array<OtaSoftwareUpdateRequestor.StateTransitionEvent>();
        peer1.endpoints
            .for(otaRequestor.number)
            .eventsOf(OtaSoftwareUpdateRequestorClient)
            .stateTransition.on((event: OtaSoftwareUpdateRequestor.StateTransitionEvent) => {
                updateStateEvents.push(event);
                if (event.newState === OtaSoftwareUpdateRequestor.UpdateState.Idle) {
                    idleResolver();
                }
            });

        // Force the OTA update via SoftwareUpdateManager
        await otaProvider.act(agent => {
            return agent
                .get(SoftwareUpdateManager)
                .forceUpdate(peerAddress!, VendorId(vendorId), productId, targetSoftwareVersion);
        });

        await otaProvider.act(agent => {
            return agent.get(SoftwareUpdateManager).removeConsent(
                PeerAddress({
                    nodeId: peerAddress!.nodeId,
                    fabricIndex: FabricIndex(peerAddress!.fabricIndex),
                }),
            );
        });

        await MockTime.resolve(queryImagePromise);

        await MockTime.resolve(idlePromise);

        expect(updateStateEvents).deep.equals([
            {
                previousState: OtaSoftwareUpdateRequestor.UpdateState.Idle,
                newState: OtaSoftwareUpdateRequestor.UpdateState.Querying,
                reason: OtaSoftwareUpdateRequestor.ChangeReason.Success,
                targetSoftwareVersion: null,
            },
            {
                previousState: OtaSoftwareUpdateRequestor.UpdateState.Querying,
                newState: OtaSoftwareUpdateRequestor.UpdateState.Idle,
                reason: OtaSoftwareUpdateRequestor.ChangeReason.Success,
                targetSoftwareVersion: null,
            },
        ]);
    }).timeout(10_000); // locally needs 1s, but CI might be slower

    it("Queue processes a single update via addUpdateConsent", async () => {
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
            requestUserConsentForUpdate: false,
        });

        const { site, device, controller, otaProvider, otaRequestor } = await initOtaSite(
            TestOtaProviderServer,
            TestOtaRequestorServer,
        );
        await using _localSite = site;

        // Wait until defaults got announced
        await MockTime.resolve(otaRequestor.eventsOf(OtaSoftwareUpdateRequestorServer).defaultOtaProviders$Changed);

        // Add OTA image
        const { otaImage, vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
        data.expectedOtaImage = Bytes.of(otaImage.image);

        // Get peer info
        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;
        const peerAddress = peer1.state.commissioning.peerAddress!;

        // Use addUpdateConsent (queued path, not forceUpdate)
        const added = await otaProvider.act(agent => {
            return agent
                .get(SoftwareUpdateManager)
                .addUpdateConsent(peerAddress, VendorId(vendorId), productId, targetSoftwareVersion);
        });
        expect(added).equals(true);

        // Verify queue shows 1 entry
        const queue1 = await otaProvider.act(agent => agent.get(SoftwareUpdateManager).queuedUpdates);
        expect(queue1).length(1);
        expect(queue1[0].targetSoftwareVersion).equals(targetSoftwareVersion);

        await MockTime.resolve(announceOtaProviderPromise);

        // Messages may still be in flight; ensure they find a home before continuing
        await MockTime.macrotasks;

        // After announcement, verify queue shows in-progress
        const queue2 = await otaProvider.act(agent => agent.get(SoftwareUpdateManager).queuedUpdates);

        expect(queue2).length(1);
        expect(queue2[0].status).equals("in-progress");

        await MockTime.resolve(queryImagePromise);
        await MockTime.resolve(checkUpdateAvailablePromise);
        await MockTime.resolve(applyUpdateRequestPromise);
        await MockTime.resolve(applyUpdatePromise);

        // Simulate device restart with new version
        await MockTime.resolve(device.cancel());
        await device.setStateOf(BasicInformationServer, { softwareVersion: targetSoftwareVersion });
        await MockTime.resolve(device.start());

        await MockTime.resolve(notifyUpdateAppliedPromise);

        // Queue should be empty after completion
        const queue3 = await otaProvider.act(agent => agent.get(SoftwareUpdateManager).queuedUpdates);
        expect(queue3).length(0);

        await site[Symbol.asyncDispose]();
    }).timeout(10_000);

    // TODO Add more test cases for edge cases and error cases, also split out setup into helpers
});
