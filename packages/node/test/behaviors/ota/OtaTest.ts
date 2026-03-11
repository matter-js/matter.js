/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OtaUpdateStatus, SoftwareUpdateManager } from "#behavior/system/software-update/SoftwareUpdateManager.js";
import { BasicInformationServer } from "#behaviors/basic-information";
import {
    OtaSoftwareUpdateRequestorClient,
    OtaSoftwareUpdateRequestorServer,
} from "#behaviors/ota-software-update-requestor";
import { OtaProviderEndpoint } from "#endpoints/ota-provider";
import { ServerNode } from "#node/ServerNode.js";
import { Bytes, createPromise, MockFetch } from "@matter/general";
import { BdxProtocol, FabricAuthority, PeerAddress } from "@matter/protocol";
import { FabricIndex, NodeId, VendorId } from "@matter/types";
import { OtaSoftwareUpdateRequestor } from "@matter/types/clusters/ota-software-update-requestor";
import { MockSite } from "../../node/mock-site.js";
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
        await MockTime.resolve(device.stop());
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
        await MockTime.resolve(device.stop());
        await device.setStateOf(BasicInformationServer, { softwareVersion: targetSoftwareVersion });
        await MockTime.resolve(device.start());

        await MockTime.resolve(notifyUpdateAppliedPromise);

        // Queue should be empty after completion
        const queue3 = await otaProvider.act(agent => agent.get(SoftwareUpdateManager).queuedUpdates);
        expect(queue3).length(0);

        await site[Symbol.asyncDispose]();
    }).timeout(10_000);

    it("Does not report updates for nodes without OTA requestor", async () => {
        const { TestOtaProviderServer } = InstrumentedOtaProviderServer({
            requestUserConsentForUpdate: false,
        });

        const site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            controller: {
                type: ServerNode.RootEndpoint,
                parts: [{ id: "ota-provider", type: OtaProviderEndpoint.with(TestOtaProviderServer) }],
            },
        });
        await using _localSite = site;

        const otaProvider = controller.parts.get("ota-provider")!;
        await otaProvider.act(agent => {
            const su = agent.get(SoftwareUpdateManager);
            su.state.allowTestOtaImages = true;
        });

        const { otaImage } = await addTestOtaImage(device, controller);
        let checkForUpdateCalls = 0;
        let downloadUpdateCalls = 0;

        const updatesAvailable = await otaProvider.act(async agent => {
            const su = agent.get(SoftwareUpdateManager);
            const otaService = su.internal.otaService;

            const originalCheckForUpdate = otaService.checkForUpdate.bind(otaService);
            const originalDownloadUpdate = otaService.downloadUpdate.bind(otaService);

            otaService.checkForUpdate = async () => {
                checkForUpdateCalls++;
                // Simulate DCL returning an available update.
                return {
                    ...otaImage.updateInfo,
                    source: "dcl-test",
                };
            };
            otaService.downloadUpdate = async () => {
                downloadUpdateCalls++;
                return { text: "mocked-ota-file" } as any;
            };

            try {
                return await su.queryUpdates({ includeStoredUpdates: false });
            } finally {
                otaService.checkForUpdate = originalCheckForUpdate;
                otaService.downloadUpdate = originalDownloadUpdate;
            }
        });
        expect(updatesAvailable).deep.equals([]);
        expect(checkForUpdateCalls).equals(0);
        expect(downloadUpdateCalls).equals(0);
    }).timeout(10_000);

    it("Cancelled status resets queue entry for retry (Fix 1)", async () => {
        const { TestOtaProviderServer } = InstrumentedOtaProviderServer({
            requestUserConsentForUpdate: false,
        });
        const { TestOtaRequestorServer } = InstrumentedOtaRequestorServer({ requestUserConsent: false });

        const { site, device, controller, otaProvider } = await initOtaSite(TestOtaProviderServer, TestOtaRequestorServer);
        await using _localSite = site;

        const { vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);

        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.state.commissioning.peerAddress!;

        // Add a consent and queue an entry
        await otaProvider.act(agent => {
            return agent.get(SoftwareUpdateManager).addUpdateConsent(peerAddress, VendorId(vendorId), productId, targetSoftwareVersion);
        });

        // Manually set the entry to in-progress with Downloading status
        await otaProvider.act(agent => {
            const su = agent.get(SoftwareUpdateManager);
            const entry = su.internal.updateQueue[0];
            entry.lastProgressUpdateTime = 1000 as any;
            entry.lastProgressStatus = OtaUpdateStatus.Downloading;
        });

        const updateFailedEvents: PeerAddress[] = [];
        await otaProvider.act(agent => {
            agent.get(SoftwareUpdateManager).events.updateFailed.on(peer => { updateFailedEvents.push(peer); });
        });

        // Simulate BDX transport cancellation via Cancelled status
        await otaProvider.act(agent => {
            agent.get(SoftwareUpdateManager).onOtaStatusChange(peerAddress, OtaUpdateStatus.Cancelled);
        });

        // Queue entry should still exist (reset, not removed)
        const queue = await otaProvider.act(agent => agent.get(SoftwareUpdateManager).queuedUpdates);
        expect(queue).length(1);
        expect(queue[0].status).equals("queued");
        expect(queue[0].lastProgressStatus).equals(OtaUpdateStatus.Unknown);

        // updateFailed must NOT have been emitted (that's only for intentional cancel via #cancelUpdate)
        expect(updateFailedEvents).length(0);
    }).timeout(10_000);

    it("Apply failure detected when startUp fires after Applying state (Fix 2)", async () => {
        // This test verifies the status ordering fix: previousProgressStatus is saved BEFORE the
        // clearing block in #onSoftwareVersionChanged, so the Applying check on startUp works correctly.

        const { TestOtaProviderServer } = InstrumentedOtaProviderServer({ requestUserConsentForUpdate: false });
        const { TestOtaRequestorServer } = InstrumentedOtaRequestorServer({ requestUserConsent: false });

        const { site, device, controller, otaProvider } = await initOtaSite(TestOtaProviderServer, TestOtaRequestorServer);
        await using _localSite = site;

        const { vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);

        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.state.commissioning.peerAddress!;

        const updateFailedEvents: PeerAddress[] = [];
        await otaProvider.act(agent => {
            agent.get(SoftwareUpdateManager).events.updateFailed.on(peer => { updateFailedEvents.push(peer); });
        });

        // Queue the update (this also registers the startUp observer via #preparePeerForUpdate)
        await otaProvider.act(agent => {
            return agent.get(SoftwareUpdateManager).addUpdateConsent(peerAddress, VendorId(vendorId), productId, targetSoftwareVersion);
        });

        // Directly set the entry to Applying state with a progress time (simulates mid-apply state)
        await otaProvider.act(agent => {
            const su = agent.get(SoftwareUpdateManager);
            const entry = su.internal.updateQueue[0];
            entry.lastProgressStatus = OtaUpdateStatus.Applying;
            entry.lastProgressUpdateTime = 1000 as any;
        });

        // Simulate device rebooting with the ORIGINAL (old) version — apply failed
        // The startUp event will fire with the old softwareVersion via the registered observer
        await MockTime.resolve(device.stop());
        // Keep the original softwareVersion (do NOT set it to targetSoftwareVersion)
        await MockTime.resolve(device.start());

        await MockTime.macrotasks;

        // With Fix 2: previousProgressStatus is captured before the clearing block,
        // so the isStartUp + Applying check should detect the failure and emit updateFailed.
        expect(updateFailedEvents).length(1);

        // Queue entry should have been removed since update failed
        const queue = await otaProvider.act(agent => agent.get(SoftwareUpdateManager).queuedUpdates);
        expect(queue).length(0);
    }).timeout(10_000);

    it("triggerUpdateOnNode skips announcement when BDX session is active (Fix 3)", async () => {
        const { TestOtaProviderServer } = InstrumentedOtaProviderServer({
            requestUserConsentForUpdate: false,
            queryImage: false, // Should NOT be called — BDX active, announcement should be skipped
        });
        const { announceOtaProviderPromise, TestOtaRequestorServer } = InstrumentedOtaRequestorServer({
            requestUserConsent: false,
            announceOtaProvider: false, // Should NOT be called
        });

        const { site, device, controller, otaProvider } = await initOtaSite(TestOtaProviderServer, TestOtaRequestorServer);
        await using _localSite = site;

        const { vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.state.commissioning.peerAddress!;

        // Queue the entry (it should be picked up by #triggerQueuedUpdate → #triggerUpdateOnNode)
        await otaProvider.act(agent => {
            return agent.get(SoftwareUpdateManager).addUpdateConsent(peerAddress, VendorId(vendorId), productId, targetSoftwareVersion);
        });

        // Mock BdxProtocol.sessionFor to return a fake active session
        await otaProvider.act(agent => {
            const su = agent.get(SoftwareUpdateManager);
            const bdxProtocol = su.env.get(BdxProtocol);
            const originalSessionFor = bdxProtocol.sessionFor.bind(bdxProtocol);
            bdxProtocol.sessionFor = (peer, scope) => {
                if (PeerAddress.is(peer, peerAddress)) {
                    return { peerAddress } as any; // fake active session
                }
                return originalSessionFor(peer, scope);
            };
        });

        // Trigger the queued update manually — it should skip due to active BDX session
        await otaProvider.act(agent => {
            // Access the entry and trigger #triggerQueuedUpdate indirectly via onOtaStatusChange
            // which calls #triggerQueuedUpdate. First reset the entry to "not started":
            const su = agent.get(SoftwareUpdateManager);
            const entry = su.internal.updateQueue[0];
            if (entry !== undefined) {
                entry.lastProgressUpdateTime = undefined;
                entry.lastProgressStatus = OtaUpdateStatus.Unknown;
            }
            // Directly trigger the queued update processing
            su.onOtaStatusChange(
                PeerAddress({ nodeId: NodeId(0n), fabricIndex: FabricIndex(99) }), // unknown node, just to trigger #triggerQueuedUpdate
                OtaUpdateStatus.Done,
            );
        });

        await MockTime.macrotasks;

        // announceOtaProvider should NOT have been called — the promise should NOT have resolved
        let announceWasCalled = false;
        const timeout = new Promise<void>(resolve => setTimeout(resolve, 50));
        await Promise.race([
            announceOtaProviderPromise.then(() => { announceWasCalled = true; }),
            timeout,
        ]);
        expect(announceWasCalled).equals(false);

        // The queue entry should still be present (not started since announcement was skipped)
        const queue = await otaProvider.act(agent => agent.get(SoftwareUpdateManager).queuedUpdates);
        expect(queue).length(1);
        expect(queue[0].status).equals("queued");
    }).timeout(10_000);

    // TODO Add more test cases for edge cases and error cases, also split out setup into helpers
});
