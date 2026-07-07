/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import { OtaUpdateStatus, SoftwareUpdateManager } from "#behavior/system/software-update/SoftwareUpdateManager.js";
import { BasicInformationServer } from "#behaviors/basic-information";
import { OtaSoftwareUpdateProviderServer } from "#behaviors/ota-software-update-provider";
import {
    OtaSoftwareUpdateRequestorClient,
    OtaSoftwareUpdateRequestorServer,
} from "#behaviors/ota-software-update-requestor";
import { OtaProviderEndpoint } from "#endpoints/ota-provider";
import { ServerNode } from "#node/ServerNode.js";
import { Bytes, createPromise, Hours, MockFetch, Timestamp } from "@matter/general";
import {
    BdxProtocol,
    BdxSession,
    FabricAuthority,
    PeerAddress,
    SessionManager,
    SustainedSubscription,
} from "@matter/protocol";
import { FabricIndex, NodeId, VendorId } from "@matter/types";
import { OtaSoftwareUpdateProvider } from "@matter/types/clusters/ota-software-update-provider";
import { OtaSoftwareUpdateRequestor } from "@matter/types/clusters/ota-software-update-requestor";
import { MockSite } from "../../node/mock-site.js";
import {
    addTestOtaImage,
    initOtaSite,
    InstrumentedOtaProviderServer,
    InstrumentedOtaRequestorServer,
    streamFromBytes,
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

    it("Cancelled status resets queue entry for retry", async () => {
        const { TestOtaProviderServer } = InstrumentedOtaProviderServer({
            requestUserConsentForUpdate: false,
        });
        const { TestOtaRequestorServer } = InstrumentedOtaRequestorServer({ requestUserConsent: false });

        const { site, device, controller, otaProvider } = await initOtaSite(
            TestOtaProviderServer,
            TestOtaRequestorServer,
        );
        await using _localSite = site;

        const { vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);

        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.state.commissioning.peerAddress!;

        // Add a consent and queue an entry
        await otaProvider.act(agent => {
            return agent
                .get(SoftwareUpdateManager)
                .addUpdateConsent(peerAddress, VendorId(vendorId), productId, targetSoftwareVersion);
        });

        // Manually set the entry to in-progress with Downloading status
        await otaProvider.act(agent => {
            const su = agent.get(SoftwareUpdateManager);
            const entry = su.internal.updateQueue[0];
            entry.lastProgressUpdateTime = Timestamp(1000);
            entry.lastProgressStatus = OtaUpdateStatus.Downloading;
        });

        const updateFailedEvents: PeerAddress[] = [];
        await otaProvider.act(agent => {
            agent.get(SoftwareUpdateManager).events.updateFailed.on(peer => {
                updateFailedEvents.push(peer);
            });
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

    it("Apply failure detected when startUp fires after Applying state", async () => {
        // This test verifies the status ordering fix: previousProgressStatus is saved BEFORE the
        // clearing block in #onSoftwareVersionChanged, so the Applying check on startUp works correctly.

        const { TestOtaProviderServer } = InstrumentedOtaProviderServer({ requestUserConsentForUpdate: false });
        const { TestOtaRequestorServer } = InstrumentedOtaRequestorServer({ requestUserConsent: false });

        const { site, device, controller, otaProvider } = await initOtaSite(
            TestOtaProviderServer,
            TestOtaRequestorServer,
        );
        await using _localSite = site;

        const { vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);

        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.state.commissioning.peerAddress!;

        const updateFailedEvents: PeerAddress[] = [];
        await otaProvider.act(agent => {
            agent.get(SoftwareUpdateManager).events.updateFailed.on(peer => {
                updateFailedEvents.push(peer);
            });
        });

        // Queue the update (this also registers the startUp observer via #preparePeerForUpdate)
        await otaProvider.act(agent => {
            return agent
                .get(SoftwareUpdateManager)
                .addUpdateConsent(peerAddress, VendorId(vendorId), productId, targetSoftwareVersion);
        });

        // Directly set the entry to Applying state with a progress time (simulates mid-apply state)
        await otaProvider.act(agent => {
            const su = agent.get(SoftwareUpdateManager);
            const entry = su.internal.updateQueue[0];
            entry.lastProgressStatus = OtaUpdateStatus.Applying;
            entry.lastProgressUpdateTime = Timestamp(1000);
        });

        // Await teardown and re-prime on the sustained subscription — the startUp handler only runs
        // once the priming report delivers the buffered event.
        const subscription = peer1.behaviors.internalsOf(NetworkClient).activeSubscription!;
        expect(subscription).not.undefined;
        SustainedSubscription.assert(subscription);

        // Simulate device rebooting with the ORIGINAL (old) version — apply failed
        // The startUp event will fire with the old softwareVersion via the registered observer
        await MockTime.resolve(device.stop());
        await MockTime.resolve(subscription.inactive);
        // Keep the original softwareVersion (do NOT set it to targetSoftwareVersion)
        await MockTime.resolve(device.start());
        await MockTime.resolve(subscription.active);

        await MockTime.macrotasks;

        // previousProgressStatus is captured before the clearing block,
        // so the isStartUp + Applying check should detect the failure and emit updateFailed.
        expect(updateFailedEvents).length(1);

        // Queue entry should have been removed since update failed
        const queue = await otaProvider.act(agent => agent.get(SoftwareUpdateManager).queuedUpdates);
        expect(queue).length(0);
    }).timeout(10_000);

    it("triggerUpdateOnNode skips announcement when BDX session is active", async () => {
        const { TestOtaProviderServer } = InstrumentedOtaProviderServer({
            requestUserConsentForUpdate: false,
            queryImage: false, // Should NOT be called — BDX active, announcement should be skipped
        });
        const { announceOtaProviderPromise, TestOtaRequestorServer } = InstrumentedOtaRequestorServer({
            requestUserConsent: false,
            announceOtaProvider: false, // Should NOT be called
        });

        const { site, device, controller, otaProvider } = await initOtaSite(
            TestOtaProviderServer,
            TestOtaRequestorServer,
        );
        await using _localSite = site;

        const { vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.state.commissioning.peerAddress!;

        // Queue the entry (it should be picked up by #triggerQueuedUpdate → #triggerUpdateOnNode)
        await otaProvider.act(agent => {
            return agent
                .get(SoftwareUpdateManager)
                .addUpdateConsent(peerAddress, VendorId(vendorId), productId, targetSoftwareVersion);
        });

        // Patch BdxProtocol.sessionFor to simulate an active BDX session for this peer.
        // No restore is needed: each MockSite test creates its own Environment (new Environment(id)
        // in mock-site.ts), so the BdxProtocol instance is isolated to this test and discarded when
        // the site is torn down via `await using _localSite = site`.
        await otaProvider.act(agent => {
            const su = agent.get(SoftwareUpdateManager);
            const bdxProtocol = su.env.get(BdxProtocol);
            const originalSessionFor = bdxProtocol.sessionFor.bind(bdxProtocol);
            bdxProtocol.sessionFor = (peer, scope) => {
                if (PeerAddress.is(peer, peerAddress)) {
                    return { peerAddress } as BdxSession | undefined; // fake active session
                }
                return originalSessionFor(peer, scope);
            };
        });

        // addUpdateConsent above fired #triggerQueuedUpdate → #triggerUpdateOnNode as a fire-and-forget
        // promise (not yet awaited). Reset the entry to "not-started" so that when the async
        // #triggerUpdateOnNode body runs during MockTime.macrotasks below it sees no in-progress state,
        // and the BDX guard (now active via the patch above) is the first thing that stops it.
        // We also deliver a Done event for a nonexistent peer purely as a synchronous no-op placeholder
        // that makes the intent of "reset + re-check" explicit; the actual queue re-processing is
        // driven by the already-scheduled fire-and-forget task running in MacroTasks below.
        await otaProvider.act(agent => {
            const su = agent.get(SoftwareUpdateManager);
            const entry = su.internal.updateQueue[0];
            if (entry !== undefined) {
                entry.lastProgressUpdateTime = undefined;
                entry.lastProgressStatus = OtaUpdateStatus.Unknown;
            }
            su.onOtaStatusChange(
                PeerAddress({ nodeId: NodeId(0n), fabricIndex: FabricIndex(99) }), // unknown peer — returns early
                OtaUpdateStatus.Done,
            );
        });

        await MockTime.macrotasks;

        // announceOtaProvider should NOT have been called — check after MockTime drains any pending tasks
        let announceWasCalled = false;
        void announceOtaProviderPromise.then(() => {
            announceWasCalled = true;
        });
        expect(announceWasCalled).equals(false);

        // The queue entry should still be present (not started since announcement was skipped)
        const queue = await otaProvider.act(agent => agent.get(SoftwareUpdateManager).queuedUpdates);
        expect(queue).length(1);
        expect(queue[0].status).equals("queued");
    }).timeout(10_000);

    it("queryImage Case A: stale in-progress entry with no BDX session → cleared, fresh queryImage proceeds", async () => {
        // Case A: there is an in-progress entry in inProgressDetails but no active BDX session.
        // When queryImage is called, the stale entry should be cleared and processing proceeds fresh.
        // We verify by checking that the stale "aa" token entry is gone and a fresh entry exists.
        //
        // To avoid initiating a real BDX download (which would complicate teardown), the test
        // provider server intercepts queryImage: it runs super.queryImage() for side effects (Case A
        // logic clears the stale entry and creates a fresh one), then returns NotAvailable to the
        // device. The device sees NotAvailable → goes to Idle immediately, no BDX is started.

        const { promise: queryImagePromise, resolver: queryImageResolver } = createPromise<void>();

        // Custom provider server: runs super.queryImage() for side effects (Case A clears the stale
        // entry), resolves the test promise when done, then returns NotAvailable to suppress BDX.
        class CaseATestProviderServer extends OtaSoftwareUpdateProviderServer {
            override async queryImage(
                request: OtaSoftwareUpdateProvider.QueryImageRequest,
            ): Promise<OtaSoftwareUpdateProvider.QueryImageResponse> {
                // Run super.queryImage to trigger Case A logic (clear stale entry, create fresh entry)
                await super.queryImage(request);
                // Signal test that queryImage processing is complete
                queryImageResolver();
                // Return NotAvailable so the device does not initiate a BDX download
                return { status: OtaSoftwareUpdateProvider.Status.NotAvailable };
            }
        }

        const { TestOtaRequestorServer } = InstrumentedOtaRequestorServer({ requestUserConsent: false });

        const { site, device, controller, otaProvider, otaRequestor } = await initOtaSite(
            CaseATestProviderServer,
            TestOtaRequestorServer,
        );
        await using _localSite = site;

        const { vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.state.commissioning.peerAddress!;

        // Pre-populate inProgressDetails with a "stale" entry (no active BDX, but recent timestamp so
        // it won't be auto-removed by #removeIfStale before queryImage runs) using a known "aa" token.
        // "Stale" in Case A terms means: entry exists but no matching BDX session.
        await otaProvider.act(agent => {
            const server = agent.get(OtaSoftwareUpdateProviderServer);
            const { fabricIndex, nodeId } = peerAddress;
            const key = `${nodeId}-${fabricIndex}-${"aa".repeat(32)}`;
            server.internal.inProgressDetails.set(key, {
                requestorNodeId: nodeId,
                fabricIndex,
                lastState: OtaUpdateStatus.Downloading,
                timestamp: (MockTime.nowMs + 3_600_000) as Timestamp, // 1h future offset so entry stays fresh when queryImage fires (~30-40 min later in mock time)
            });
        });

        // Verify the stale entry is there
        const entryCountBefore = await otaProvider.act(agent => {
            return agent.get(OtaSoftwareUpdateProviderServer).internal.inProgressDetails.size;
        });
        expect(entryCountBefore).equals(1);

        // No need to patch BdxProtocol.sessionFor — since there's no active OTA running, the real
        // BdxProtocol.sessionFor will naturally return undefined for this peer, triggering Case A:
        // stale in-progress entry with no active BDX session → cleared and proceed fresh.

        // Set up idlePromise BEFORE forceUpdate: resolves when device returns to Idle.
        // The device will call queryImage, get NotAvailable, and go to Idle immediately.
        // We wait for Idle before site teardown to ensure the updateQueryTimer is started before
        // node.close() stops it in [Symbol.asyncDispose].
        const { promise: idlePromise, resolver: idleResolver } = createPromise<void>();
        peer1.endpoints
            .for(otaRequestor.number)
            .eventsOf(OtaSoftwareUpdateRequestorClient)
            .stateTransition.on((event: OtaSoftwareUpdateRequestor.StateTransitionEvent) => {
                if (event.newState === OtaSoftwareUpdateRequestor.UpdateState.Idle) {
                    idleResolver();
                }
            });

        // Trigger the OTA flow via forceUpdate → announcement → device calls queryImage
        await otaProvider.act(agent => {
            return agent
                .get(SoftwareUpdateManager)
                .forceUpdate(peerAddress, VendorId(vendorId), productId, targetSoftwareVersion);
        });

        // Wait for queryImage to complete (provider ran Case A logic, returned NotAvailable)
        await MockTime.resolve(queryImagePromise);

        // The stale "aa" token entry should NOT be there — it was cleared by Case A logic
        const hasStaleEntry = await otaProvider.act(agent => {
            const server = agent.get(OtaSoftwareUpdateProviderServer);
            return [...server.internal.inProgressDetails.keys()].some(k => k.includes("aa".repeat(32)));
        });
        expect(hasStaleEntry).equals(false);

        // A fresh entry with a new (non-"aa") token should exist, confirming queryImage proceeded
        // past the Case A check and created a new inProgressDetails entry.
        const totalEntries = await otaProvider.act(agent => {
            return agent.get(OtaSoftwareUpdateProviderServer).internal.inProgressDetails.size;
        });
        expect(totalEntries).greaterThan(0);

        // Wait for the device to return to Idle (fast: queryImage returned NotAvailable).
        // This ensures the updateQueryTimer is running before node.close() stops it cleanly.
        await MockTime.resolve(idlePromise);
    }).timeout(10_000);

    it("queryImage Case B: reboot detected (different session, older BDX timestamp) → BDX cancelled, entry cleared, startUp suppressed, UpdateAvailable", async () => {
        // Case B: there is an in-progress entry AND an active BDX session, but the incoming queryImage
        // session is from a different (newer) session — indicating the device has rebooted mid-transfer.
        // Expected behaviour:
        //   - The old BDX session is cancelled (disablePeerForScope called)
        //   - The in-progress entry is removed
        //   - suppressNextStartUp is registered for the peer (pendingStartUpSuppress has the entry)
        //   - queryImage proceeds fresh → returns UpdateAvailable (not Busy)
        //
        // Implementation note: super.queryImage() handles Case B internally. The custom subclass
        // captures the return value to assert UpdateAvailable, then returns NotAvailable to the
        // device so no real BDX download is initiated (keeps teardown simple).

        const { promise: queryImageResultPromise, resolver: queryImageResultResolver } =
            createPromise<OtaSoftwareUpdateProvider.QueryImageResponse>();

        class CaseBTestProviderServer extends OtaSoftwareUpdateProviderServer {
            override async queryImage(
                request: OtaSoftwareUpdateProvider.QueryImageRequest,
            ): Promise<OtaSoftwareUpdateProvider.QueryImageResponse> {
                // Run super.queryImage to trigger Case B logic
                const result = await super.queryImage(request);
                // Signal test with the actual result (should be UpdateAvailable, not Busy)
                queryImageResultResolver(result);
                // Return NotAvailable so the device does not initiate a BDX download
                return { status: OtaSoftwareUpdateProvider.Status.NotAvailable };
            }
        }

        const { TestOtaRequestorServer } = InstrumentedOtaRequestorServer({ requestUserConsent: false });

        const { site, device, controller, otaProvider, otaRequestor } = await initOtaSite(
            CaseBTestProviderServer,
            TestOtaRequestorServer,
        );
        await using _localSite = site;

        const { vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.state.commissioning.peerAddress!;

        // Pre-populate inProgressDetails with a "cc" token entry (simulates a prior download that
        // was interrupted by a device reboot).
        await otaProvider.act(agent => {
            const server = agent.get(OtaSoftwareUpdateProviderServer);
            const { fabricIndex, nodeId } = peerAddress;
            const key = `${nodeId}-${fabricIndex}-${"cc".repeat(32)}`;
            server.internal.inProgressDetails.set(key, {
                requestorNodeId: nodeId,
                fabricIndex,
                lastState: OtaUpdateStatus.Downloading,
                timestamp: (MockTime.nowMs + 3_600_000) as Timestamp, // 1h future offset so entry stays fresh when queryImage fires (~30-40 min later in mock time)
            });
        });

        // Verify the in-progress entry is there before queryImage
        const entryCountBefore = await otaProvider.act(agent => {
            return agent.get(OtaSoftwareUpdateProviderServer).internal.inProgressDetails.size;
        });
        expect(entryCountBefore).equals(1);

        // Patch BdxProtocol.sessionFor to return a fake BDX session that appears to be from an
        // OLDER session. The real queryImage session will have a newer activeTimestamp, and a
        // different sessionId → triggers Case B.
        //
        // IMPORTANT: Use MockTime.nowMs (not Date.now()) for the fake BDX session's
        // sessionActiveTimestamp so that it is older than session.activeTimestamp, which also uses
        // MockTime-based timestamps. A timestamp of 0 is always older than any live session.
        //
        // BDX_FAKE_SESSION_ID uses a high value (0xDEAD) to avoid colliding with real session IDs
        // assigned by the protocol stack in these tests.
        const BDX_FAKE_SESSION_ID = 0xdead;
        await otaProvider.act(agent => {
            const su = agent.get(SoftwareUpdateManager);
            const bdxProtocol = su.env.get(BdxProtocol);
            const originalSessionFor = bdxProtocol.sessionFor.bind(bdxProtocol);
            bdxProtocol.sessionFor = (peer: any, scope: any) => {
                if (PeerAddress.is(peer, peerAddress)) {
                    return {
                        peerAddress,
                        session: {
                            id: BDX_FAKE_SESSION_ID,
                            activeTimestamp: 0 as Timestamp, // epoch zero → always older than any live session
                        },
                    } as any;
                }
                return originalSessionFor(peer, scope);
            };
        });

        // Set up idlePromise BEFORE forceUpdate: resolves when device returns to Idle.
        // The device will call queryImage, Case B fires, then we return NotAvailable → Idle immediately.
        const { promise: idlePromise, resolver: idleResolver } = createPromise<void>();
        peer1.endpoints
            .for(otaRequestor.number)
            .eventsOf(OtaSoftwareUpdateRequestorClient)
            .stateTransition.on((event: OtaSoftwareUpdateRequestor.StateTransitionEvent) => {
                if (event.newState === OtaSoftwareUpdateRequestor.UpdateState.Idle) {
                    idleResolver();
                }
            });

        // Trigger the OTA flow via forceUpdate → announcement → device calls queryImage
        await otaProvider.act(agent => {
            return agent
                .get(SoftwareUpdateManager)
                .forceUpdate(peerAddress, VendorId(vendorId), productId, targetSoftwareVersion);
        });

        // Wait for queryImage to complete (provider ran Case B logic, returned NotAvailable to device)
        const queryImageResult = await MockTime.resolve(queryImageResultPromise);

        // Case B should NOT return Busy — it falls through to normal processing → UpdateAvailable
        expect(queryImageResult.status).equals(OtaSoftwareUpdateProvider.Status.UpdateAvailable);

        // The "cc" token entry should have been removed by Case B logic
        const hasCcEntry = await otaProvider.act(agent => {
            return [...agent.get(OtaSoftwareUpdateProviderServer).internal.inProgressDetails.keys()].some(k =>
                k.includes("cc".repeat(32)),
            );
        });
        expect(hasCcEntry).equals(false);

        // suppressNextStartUp should have been registered: pendingStartUpSuppress must contain the peer
        const hasSuppressEntry = await otaProvider.act(agent => {
            return agent.get(SoftwareUpdateManager).internal.pendingStartUpSuppress.has(peerAddress);
        });
        expect(hasSuppressEntry).equals(true);

        // Wait for the device to return to Idle (fast: queryImage returned NotAvailable)
        await MockTime.resolve(idlePromise);
    }).timeout(10_000);

    it("queryImage Case C: in-progress with active BDX session → in-progress state preserved when BDX active", async () => {
        // Case C: there is an in-progress entry AND an active BDX session that is newer than any
        // incoming queryImage session. The entry should NOT be cleared (it's a genuine in-progress).
        // We verify state directly since we cannot invoke queryImage without a full protocol session.
        const { TestOtaProviderServer } = InstrumentedOtaProviderServer({
            requestUserConsentForUpdate: false,
        });
        const { TestOtaRequestorServer } = InstrumentedOtaRequestorServer({ requestUserConsent: false });

        const { site, controller, otaProvider } = await initOtaSite(TestOtaProviderServer, TestOtaRequestorServer);
        await using _localSite = site;

        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.state.commissioning.peerAddress!;

        // Add a fresh in-progress entry (simulating an ongoing download with a known "bb" token)
        await otaProvider.act(agent => {
            const server = agent.get(OtaSoftwareUpdateProviderServer);
            const { fabricIndex, nodeId } = peerAddress;
            const key = `${nodeId}-${fabricIndex}-${"bb".repeat(32)}`;
            server.internal.inProgressDetails.set(key, {
                requestorNodeId: nodeId,
                fabricIndex,
                lastState: OtaUpdateStatus.Downloading,
                timestamp: MockTime.nowMs as Timestamp,
            });
        });

        // Patch BdxProtocol.sessionFor to return an active fake session that is "newer" than any
        // incoming queryImage invocation (Case C: BDX is more recent → Busy)
        await otaProvider.act(agent => {
            const su = agent.get(SoftwareUpdateManager);
            const bdxProtocol = su.env.get(BdxProtocol);
            const originalSessionFor = bdxProtocol.sessionFor.bind(bdxProtocol);
            bdxProtocol.sessionFor = (peer: any, scope: any) => {
                if (PeerAddress.is(peer, peerAddress)) {
                    return {
                        peerAddress,
                        session: {
                            id: 42,
                            activeTimestamp: (MockTime.nowMs + 10000) as Timestamp, // newer than any live session → Case C
                        },
                    } as any;
                }
                return originalSessionFor(peer, scope);
            };
        });

        // The in-progress entry should still be present (not cleared, since no queryImage was called)
        const entryCount = await otaProvider.act(agent => {
            return agent.get(OtaSoftwareUpdateProviderServer).internal.inProgressDetails.size;
        });
        expect(entryCount).equals(1);
        expect(
            await otaProvider.act(agent => {
                return [...agent.get(OtaSoftwareUpdateProviderServer).internal.inProgressDetails.values()][0]
                    ?.lastState;
            }),
        ).equals(OtaUpdateStatus.Downloading);

        // The "bb" key entry must still be there (Case C preserves it)
        const hasBbEntry = await otaProvider.act(agent => {
            return [...agent.get(OtaSoftwareUpdateProviderServer).internal.inProgressDetails.keys()].some(k =>
                k.includes("bb".repeat(32)),
            );
        });
        expect(hasBbEntry).equals(true);
    }).timeout(10_000);

    it("suppressNextStartUp: suppresses startUp on matching session ID", async () => {
        // When suppressNextStartUp is called with a fake session ID, and SessionManager is patched
        // to return that same fake session ID for the peer, the next startUp event should be suppressed.
        // This simulates the real-world flow where queryImage fires before startUp on the same session.
        const { TestOtaProviderServer } = InstrumentedOtaProviderServer({
            requestUserConsentForUpdate: false,
        });
        const { TestOtaRequestorServer } = InstrumentedOtaRequestorServer({ requestUserConsent: false });

        const { site, device, controller, otaProvider } = await initOtaSite(
            TestOtaProviderServer,
            TestOtaRequestorServer,
        );
        await using _localSite = site;

        const { vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.state.commissioning.peerAddress!;

        // Queue an update so #onSoftwareVersionChanged has a queue entry to process
        await otaProvider.act(agent => {
            return agent
                .get(SoftwareUpdateManager)
                .addUpdateConsent(peerAddress, VendorId(vendorId), productId, targetSoftwareVersion);
        });

        // Set entry to Applying state (so startUp would normally trigger updateFailed if NOT suppressed)
        await otaProvider.act(agent => {
            const su = agent.get(SoftwareUpdateManager);
            const entry = su.internal.updateQueue[0];
            entry.lastProgressStatus = OtaUpdateStatus.Applying;
            entry.lastProgressUpdateTime = 1000 as Timestamp;
        });

        const updateFailedEvents: PeerAddress[] = [];
        await otaProvider.act(agent => {
            agent.get(SoftwareUpdateManager).events.updateFailed.on(peer => {
                updateFailedEvents.push(peer);
            });
        });

        // Patch SessionManager.maybeSessionFor to return a fake session with id=42 for peerAddress.
        // This patch must be in place BEFORE device.start() so that when startUp fires (during start),
        // the session check in #onSoftwareVersionChanged sees id=42.
        const FAKE_SESSION_ID = 42;
        await otaProvider.act(agent => {
            const su = agent.get(SoftwareUpdateManager);
            const sessionManager = su.env.get(SessionManager);
            const originalMaybeSessionFor = sessionManager.maybeSessionFor.bind(sessionManager);
            sessionManager.maybeSessionFor = (addr: any) => {
                if (PeerAddress.is(addr, peerAddress)) {
                    return { id: FAKE_SESSION_ID } as any;
                }
                return originalMaybeSessionFor(addr);
            };
        });

        // Flush any deferred startUp deliveries that addUpdateConsent's announceOtaProvider flow may
        // have queued — they would otherwise consume the suppression entry before the real restart.
        await MockTime.macrotasks;

        // Register the suppression with the fake ID — BEFORE device restarts.
        // The startUp fires during device.start(), and at that point the patched maybeSessionFor
        // returns id=42, which matches the suppressed id=42 → suppress!
        await otaProvider.act(agent => {
            agent.get(SoftwareUpdateManager).suppressNextStartUp(peerAddress, FAKE_SESSION_ID);
        });

        // Await teardown and re-prime on the sustained subscription — the startUp handler only runs
        // once the priming report delivers the buffered event.
        const subscription = peer1.behaviors.internalsOf(NetworkClient).activeSubscription!;
        expect(subscription).not.undefined;
        SustainedSubscription.assert(subscription);

        // Restart the device with the same (old) version — this fires startUp
        await MockTime.resolve(device.stop());
        await MockTime.resolve(subscription.inactive);
        await MockTime.resolve(device.start());
        await MockTime.resolve(subscription.active);
        await MockTime.macrotasks;

        // startUp should have been suppressed — no updateFailed event
        expect(updateFailedEvents).length(0);

        // The suppression entry should be consumed (deleted by the startUp handler)
        const hasSuppressedAfter = await otaProvider.act(agent => {
            return agent.get(SoftwareUpdateManager).internal.pendingStartUpSuppress.has(peerAddress);
        });
        expect(hasSuppressedAfter).equals(false);
    }).timeout(10_000);

    it("suppressNextStartUp: different session ID does NOT suppress startUp", async () => {
        // When suppressNextStartUp is called with a WRONG session ID (one that doesn't match what
        // maybeSessionFor returns), the startUp event should NOT be suppressed.
        const { TestOtaProviderServer } = InstrumentedOtaProviderServer({
            requestUserConsentForUpdate: false,
        });
        const { TestOtaRequestorServer } = InstrumentedOtaRequestorServer({ requestUserConsent: false });

        const { site, device, controller, otaProvider } = await initOtaSite(
            TestOtaProviderServer,
            TestOtaRequestorServer,
        );
        await using _localSite = site;

        const { vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.state.commissioning.peerAddress!;

        // Queue an update
        await otaProvider.act(agent => {
            return agent
                .get(SoftwareUpdateManager)
                .addUpdateConsent(peerAddress, VendorId(vendorId), productId, targetSoftwareVersion);
        });

        // Set to Applying state
        await otaProvider.act(agent => {
            const su = agent.get(SoftwareUpdateManager);
            const entry = su.internal.updateQueue[0];
            entry.lastProgressStatus = OtaUpdateStatus.Applying;
            entry.lastProgressUpdateTime = 1000 as Timestamp;
        });

        const updateFailedEvents: PeerAddress[] = [];
        await otaProvider.act(agent => {
            agent.get(SoftwareUpdateManager).events.updateFailed.on(peer => {
                updateFailedEvents.push(peer);
            });
        });

        // Patch SessionManager.maybeSessionFor to return a session with id=77
        const REAL_SESSION_ID = 77;
        await otaProvider.act(agent => {
            const su = agent.get(SoftwareUpdateManager);
            const sessionManager = su.env.get(SessionManager);
            const originalMaybeSessionFor = sessionManager.maybeSessionFor.bind(sessionManager);
            sessionManager.maybeSessionFor = (addr: any) => {
                if (PeerAddress.is(addr, peerAddress)) {
                    return { id: REAL_SESSION_ID } as any;
                }
                return originalMaybeSessionFor(addr);
            };
        });

        // Flush any deferred startUp deliveries that addUpdateConsent's announceOtaProvider flow may
        // have queued — they would otherwise consume the suppression entry and emit a spurious
        // updateFailed before the real restart.
        await MockTime.macrotasks;

        // Suppress with a WRONG ID — 999 ≠ 77
        const WRONG_SESSION_ID = 999;
        await otaProvider.act(agent => {
            agent.get(SoftwareUpdateManager).suppressNextStartUp(peerAddress, WRONG_SESSION_ID);
        });

        // Await teardown and re-prime on the sustained subscription — the startUp handler only runs
        // once the priming report delivers the buffered event.
        const subscription = peer1.behaviors.internalsOf(NetworkClient).activeSubscription!;
        expect(subscription).not.undefined;
        SustainedSubscription.assert(subscription);

        // Restart the device (same old version = apply failed scenario)
        await MockTime.resolve(device.stop());
        await MockTime.resolve(subscription.inactive);
        await MockTime.resolve(device.start());
        await MockTime.resolve(subscription.active);
        await MockTime.macrotasks;

        // The session IDs don't match (77 ≠ 999) → suppression NOT applied → updateFailed should fire
        expect(updateFailedEvents).length(1);

        // The suppression entry should be consumed (even though it didn't suppress)
        const hasSuppressedAfter = await otaProvider.act(agent => {
            return agent.get(SoftwareUpdateManager).internal.pendingStartUpSuppress.has(peerAddress);
        });
        expect(hasSuppressedAfter).equals(false);
    }).timeout(10_000);

    it("Cleanup purges stored test-mode OTA when allowTestOtaImages is disabled, preserves prod/local", async () => {
        const { TestOtaProviderServer } = InstrumentedOtaProviderServer({
            requestUserConsentForUpdate: false,
        });
        const { TestOtaRequestorServer } = InstrumentedOtaRequestorServer({ requestUserConsent: false });

        const { site, device, controller, otaProvider } = await initOtaSite(
            TestOtaProviderServer,
            TestOtaRequestorServer,
        );
        await using _localSite = site;

        // Store a test-mode OTA image via the helper (matches device vid/pid, version = peer + 1).
        const { otaImage } = await addTestOtaImage(device, controller);

        // Store prod-mode and local-mode copies of the same image so we can assert they survive cleanup.
        await otaProvider.act(async agent => {
            const svc = agent.get(SoftwareUpdateManager).internal.otaService;
            await svc.store(streamFromBytes(Bytes.of(otaImage.image)), otaImage.updateInfo, true /* prod */);
            await svc.store(streamFromBytes(Bytes.of(otaImage.image)), otaImage.updateInfo, "local");
        });

        const before = await otaProvider.act(agent => agent.get(SoftwareUpdateManager).internal.otaService.find({}));
        expect(before.filter(u => u.mode === "test")).length(1);
        expect(before.filter(u => u.mode === "prod")).length(1);
        expect(before.filter(u => u.mode === "local")).length(1);

        // Disable test OTA usage → next periodic check must purge the stored test-mode file.
        await otaProvider.act(agent => {
            agent.get(SoftwareUpdateManager).state.allowTestOtaImages = false;
        });

        // Advance past the 24h update-check interval so the periodic timer fires
        // #checkAvailableUpdates → #cleanupObsoleteUpdates.
        await MockTime.advance(Hours(24) + 1000);
        await MockTime.macrotasks;

        const after = await otaProvider.act(agent => agent.get(SoftwareUpdateManager).internal.otaService.find({}));
        expect(after.filter(u => u.mode === "test")).length(0);
        expect(after.filter(u => u.mode === "prod")).length(1);
        expect(after.filter(u => u.mode === "local")).length(1);
    }).timeout(15_000);

    // TODO Add more test cases for edge cases and error cases, also split out setup into helpers
});
