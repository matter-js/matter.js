/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import { OtaUpdateStatus } from "#behavior/system/software-update/OtaProgress.js";
import type { OtaUpdateAttempt } from "#behavior/system/software-update/OtaUpdateAttempts.js";
import {
    OtaUpdateAvailableDetails,
    SoftwareUpdateManager,
} from "#behavior/system/software-update/SoftwareUpdateManager.js";
import { SubscriptionsServer } from "#behavior/system/subscriptions/SubscriptionsServer.js";
import { BasicInformationClient, BasicInformationServer } from "#behaviors/basic-information";
import { OperationalCredentialsClient } from "#behaviors/operational-credentials";
import {
    OtaSoftwareUpdateConsentState,
    OtaSoftwareUpdateProviderServer,
} from "#behaviors/ota-software-update-provider";
import {
    OtaSoftwareUpdateRequestorClient,
    OtaSoftwareUpdateRequestorServer,
} from "#behaviors/ota-software-update-requestor";
import type { Agent } from "#endpoint/Agent.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import { OtaProviderEndpoint } from "#endpoints/ota-provider";
import { OtaRequestorEndpoint } from "#endpoints/ota-requestor";
import { Node } from "#node/Node.js";
import { ServerNode } from "#node/ServerNode.js";
import {
    Bytes,
    createPromise,
    Duration,
    Hours,
    ImplementationError,
    InternalError,
    MaybePromise,
    Millis,
    Minutes,
    MockFetch,
    Observable,
    Seconds,
    StandardCrypto,
    Time,
    Timestamp,
} from "@matter/general";
import { MockSite, subscribedPeer } from "@matter/node/testing";
import {
    BdxProtocol,
    BdxSession,
    ClientSubscriptions,
    FabricAuthority,
    FileDesignator,
    NodeSession,
    OtaStorageMode,
    OtaUpdateError,
    OtaUpdateSource,
    PeerAddress,
    PersistedFileDesignator,
    RebootResubscribeArmer,
    SecureSession,
    SessionManager,
    SustainedSubscription,
} from "@matter/protocol";
import { FabricIndex, NodeId, VendorId } from "@matter/types";
import { OtaSoftwareUpdateProvider } from "@matter/types/clusters/ota-software-update-provider";
import { OtaSoftwareUpdateRequestor } from "@matter/types/clusters/ota-software-update-requestor";
import {
    addTestOtaImage,
    createTestOtaImage,
    generateTestPayload,
    initOtaSite,
    InstrumentedOtaProviderServer,
    InstrumentedOtaRequestorServer,
    restartDeviceFromStorage,
    storeOtaImage,
    streamFromBytes,
    TestOtaImageResult,
} from "./ota-utils.js";

type UpdatePhase = SoftwareUpdateManager.Internal["updateQueue"][number]["phase"];

let lastUpdateToken = 0;

/** Starts the attempt of a QueryImage, as the OTA provider does, and returns it for inspection. */
function beginAttempt(manager: SoftwareUpdateManager, peerAddress: PeerAddress) {
    return manager.beginQuery(peerAddress);
}

/**
 * Makes the calls the OTA provider makes for a QueryImage whose offer of `version` reached the node, and returns the
 * attempt for the statuses the provider reports next.
 */
function deliverOffer(manager: SoftwareUpdateManager, peerAddress: PeerAddress, version: number) {
    const attempt = beginAttempt(manager, peerAddress);
    const updateToken = Bytes.fromHex((++lastUpdateToken).toString(16).padStart(16, "0"));
    expect(manager.offerUpdate(attempt, updateToken, version)).true;
    manager.reportAttemptStatus(attempt, OtaUpdateStatus.Querying);
    manager.offerAnswered(attempt);
    manager.endQuery(attempt);
    expectNoQueuedEvents(manager);
    return attempt;
}

/** Each step a test drives emits the events it queued before it returns. */
function expectNoQueuedEvents(manager: SoftwareUpdateManager) {
    expect(manager.internal.outbox).length(0);
}

/** Delivers an offer of `version` as {@link deliverOffer} does and reports `status` for it. */
function reportStatus(
    manager: SoftwareUpdateManager,
    peerAddress: PeerAddress,
    version: number,
    status: OtaUpdateStatus,
    applyDelay?: Duration,
) {
    const attempt = deliverOffer(manager, peerAddress, version);
    manager.reportAttemptStatus(attempt, status, applyDelay);
    expectNoQueuedEvents(manager);
    return attempt;
}

/** Runs `run` with the wall clock `ahead`.  Timers run on the monotonic clock, so none fires meanwhile. */
async function withWallClockAhead<T>(ahead: Duration, run: () => MaybePromise<T>) {
    MockTime.stepWallClock(ahead);
    try {
        return await run();
    } finally {
        MockTime.stepWallClock(-Number(ahead));
    }
}

/** All consents the manager holds for the peers of the controller. */
function consentsOf(manager: SoftwareUpdateManager) {
    const node = Node.forEndpoint(manager.endpoint);
    if (!(node instanceof ServerNode)) {
        throw new InternalError("The OTA provider is not on a controller");
    }
    const { consents } = manager.internal;
    return node.peers.commissioned.flatMap(peer => {
        const consent = consents.get(peer.peerAddress!);
        return consent === undefined ? [] : [consent];
    });
}

/** Whether the peer has a consent for the version and the update to it failed since the consent was given. */
function consentFailed(
    manager: SoftwareUpdateManager,
    { peerAddress, targetSoftwareVersion }: { peerAddress: PeerAddress; targetSoftwareVersion: number },
) {
    const consent = manager.internal.consents.get(peerAddress);
    return consent?.targetSoftwareVersion === targetSoftwareVersion && consent.failedAt !== undefined;
}

type UpdateQueueEntry = SoftwareUpdateManager.Internal["updateQueue"][number];

/** The phase state of the entry; `failed` for a queued entry whose target failed since its consent was given. */
function phaseStateOf({ consents }: SoftwareUpdateManager.Internal, entry: UpdateQueueEntry) {
    const { peerAddress, phase } = entry;
    return phase.state === "queued" && consents.get(peerAddress)?.failedAt !== undefined ? "failed" : phase.state;
}

/** The phase states of the queued updates, see {@link phaseStateOf}. */
function phaseStatesOf(internal: SoftwareUpdateManager.Internal) {
    return internal.updateQueue.map(entry => phaseStateOf(internal, entry));
}

/** Whether the offer of the attempt allows its apply; false while the attempt made no offer. */
function isApplyAllowed(attempt: OtaUpdateAttempt) {
    return attempt.token !== undefined && attempt.applyAllowed;
}

/** The node's session, as the session a QueryImage of the node arrives on. */
function sessionOf(manager: SoftwareUpdateManager, peerAddress: PeerAddress) {
    return manager.env.get(SessionManager).sessionFor(peerAddress);
}

/**
 * A BDX session the provider's session listener takes as the node's, with events the test emits.  `session` is the
 * secure session the transfer runs on, as the manager compares it with the session of a new query.
 */
function standInBdxSession(peerAddress: PeerAddress, session?: { id: number; activeTimestamp: Timestamp }) {
    const events = {
        peerAddress,
        session,
        progressInfo: Observable<[bytesTransferred: number, totalBytesLength: number | undefined]>(),
        progressFinished: Observable<[totalBytesTransferred: number]>(),
        progressCancelled: Observable(),
        closed: Observable(),
    };
    return { events, session: events as unknown as BdxSession };
}

/**
 * Lets {@link SoftwareUpdateManager.admitQuery} take a query of the node on its current session for one the node sent
 * after a restart during the BDX transfer of an offer of `version`.  That ends the offer's attempt and suppresses the
 * next startUp of the node on the session.  Returns the ID of the session.
 */
async function admitQueryAfterRestart(manager: SoftwareUpdateManager, peerAddress: PeerAddress, version: number) {
    const session = sessionOf(manager, peerAddress);
    deliverOffer(manager, peerAddress, version);
    const bdx = manager.env.get(BdxProtocol);
    const { sessionFor, disablePeerForScope } = bdx;
    const transfer = standInBdxSession(peerAddress, {
        id: session.id + 1,
        activeTimestamp: Timestamp(session.activeTimestamp - 1),
    });
    bdx.sessionFor = () => transfer.session;
    bdx.disablePeerForScope = async () => {};
    try {
        expect(await manager.admitQuery(peerAddress, session, 0)).true;
    } finally {
        bdx.sessionFor = sessionFor;
        bdx.disablePeerForScope = disablePeerForScope;
    }
    return session.id;
}

/** The update token the provider handed out with the attempt's offer. */
function tokenOf(attempt: OtaUpdateAttempt) {
    if (attempt.token === undefined) {
        throw new InternalError(`${attempt.toString()} made no offer`);
    }
    return attempt.token;
}

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
                .forceUpdate(peerAddress!, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion });
        });

        await MockTime.resolve(announceOtaProviderPromise);

        await MockTime.resolve(queryImagePromise);

        await MockTime.resolve(checkUpdateAvailablePromise);

        await MockTime.resolve(applyUpdateRequestPromise);

        // This should resolve when update is applied and data match
        await MockTime.resolve(applyUpdatePromise);

        // Shutdown node because our test node does not restart automatically and simulate update applied.  The
        // harness reports Applying→Idle before this restart, so a subscription the device re-establishes would report
        // it twice
        await device.setStateOf(SubscriptionsServer, { persistenceEnabled: false });
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

    /**
     * Drives one update to the apply and returns what the restart tests need.  The requestor's in-memory state is
     * discarded by the restart that follows, so what it does next rests on storage alone.
     */
    async function applyUpdateThenRestart(restartVersion: (target: number, previous: number) => number) {
        // An application's applyUpdate typically restarts the node before returning, so storage is read from inside it
        let persisted = new Array<string>();
        const data = {
            expectedOtaImage: Bytes.fromHex(""),
            duringApply: () => {
                persisted = Object.keys(
                    site.storageFor(device)["root.parts.ota-requestor.otaSoftwareUpdateRequestor"] ?? {},
                );
            },
        };
        const { applyUpdatePromise, TestOtaRequestorServer } = InstrumentedOtaRequestorServer(
            { requestUserConsent: false },
            data,
        );
        const provider = InstrumentedOtaProviderServer({ requestUserConsentForUpdate: false });

        const { site, device, controller, otaProvider, otaRequestor, deviceEnvironment } = await initOtaSite(
            provider.TestOtaProviderServer,
            TestOtaRequestorServer,
        );

        // The requestor finishes the apply before the test restarts it, as a node that restarts afterwards would
        const { resolver: appliedResolver, promise: appliedPromise } = createPromise<void>();
        otaRequestor.eventsOf(TestOtaRequestorServer).stateTransition.on(({ previousState, newState }) => {
            if (
                previousState === OtaSoftwareUpdateRequestor.UpdateState.Applying &&
                newState === OtaSoftwareUpdateRequestor.UpdateState.Idle
            ) {
                appliedResolver();
            }
        });

        // The tests take ownership of the site and the restarted node only once this returns
        let restarted: ServerNode | undefined;
        try {
            const previousVersion = device.state.basicInformation.softwareVersion;
            const { otaImage, vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
            data.expectedOtaImage = Bytes.of(otaImage.image);

            const peerAddress = controller.peers.get("peer1")!.state.commissioning.peerAddress!;
            const outcomes = new Array<"done" | "failed">();
            await otaProvider.act(agent => {
                const { events } = agent.get(SoftwareUpdateManager);
                events.updateDone.on(() => void outcomes.push("done"));
                events.updateFailed.on(() => void outcomes.push("failed"));
            });
            await otaProvider.act(agent =>
                agent
                    .get(SoftwareUpdateManager)
                    .forceUpdate(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion }),
            );
            await MockTime.resolve(applyUpdatePromise);
            await MockTime.resolve(appliedPromise);

            restarted = await restartDeviceFromStorage(
                device,
                deviceEnvironment,
                TestOtaRequestorServer,
                restartVersion(targetSoftwareVersion, previousVersion),
            );

            const requestor = restarted.parts.require("ota-requestor");
            const transitions = new Array<OtaSoftwareUpdateRequestor.StateTransitionEvent>();
            requestor.eventsOf(TestOtaRequestorServer).stateTransition.on(event => void transitions.push(event));
            const versionsApplied = new Array<OtaSoftwareUpdateRequestor.VersionAppliedEvent>();
            requestor.eventsOf(TestOtaRequestorServer).versionApplied.on(event => void versionsApplied.push(event));

            return {
                site,
                provider,
                restarted,
                requestor,
                TestOtaRequestorServer,
                targetSoftwareVersion,
                transitions,
                versionsApplied,
                persisted,
                outcomes,
            };
        } catch (error) {
            if (restarted !== undefined) {
                await MockTime.resolve(restarted.close());
            }
            await site.close();
            throw error;
        }
    }

    it("reports the update applied once restarted from storage into the new version", async () => {
        const {
            site,
            provider,
            restarted,
            requestor,
            TestOtaRequestorServer,
            targetSoftwareVersion,
            transitions,
            versionsApplied,
            persisted,
            outcomes,
        } = await applyUpdateThenRestart(target => target);
        await using _localSite = site;

        try {
            // What the restart relies on has to have reached storage, not only the old node's memory
            expect(persisted).contains("updateInProgressDetails");

            await MockTime.resolve(restarted.start());
            await MockTime.resolve(provider.notifyUpdateAppliedPromise);

            const issued = provider.queryImageResponses.find(response => response.updateToken !== undefined);
            expect(issued).not.undefined;
            expect(provider.notifyUpdateAppliedRequests).length(1);
            const [notification] = provider.notifyUpdateAppliedRequests;
            expect(notification.softwareVersion).equals(targetSoftwareVersion);
            expect(Bytes.areEqual(notification.updateToken, issued!.updateToken!)).equals(true);

            expect(
                transitions.map(({ previousState, newState, reason }) => [previousState, newState, reason]),
            ).deep.equals([
                [
                    OtaSoftwareUpdateRequestor.UpdateState.Applying,
                    OtaSoftwareUpdateRequestor.UpdateState.Idle,
                    OtaSoftwareUpdateRequestor.ChangeReason.Success,
                ],
            ]);
            expect(versionsApplied.map(({ softwareVersion }) => softwareVersion)).deep.equals([targetSoftwareVersion]);
            expect(requestor.stateOf(TestOtaRequestorServer).updateInProgressDetails).equals(null);

            // Past the restart deadline the controller has resubscribed to the new version; it stays a success
            await MockTime.advance(Minutes(5));
            await MockTime.macrotasks;
            expect(outcomes).deep.equals(["done"]);
        } finally {
            await MockTime.resolve(restarted.close());
        }
    }).timeout(10_000);

    it("reports a failed update once restarted from storage into the previous version", async () => {
        const { site, provider, restarted, requestor, TestOtaRequestorServer, transitions, versionsApplied } =
            await applyUpdateThenRestart((_target, previous) => previous);
        await using _localSite = site;

        try {
            await MockTime.resolve(restarted.start());
            await MockTime.macrotasks;

            expect(provider.notifyUpdateAppliedRequests).length(0);
            expect(versionsApplied).length(0);
            expect(
                transitions.map(({ previousState, newState, reason }) => [previousState, newState, reason]),
            ).deep.equals([
                [
                    OtaSoftwareUpdateRequestor.UpdateState.Applying,
                    OtaSoftwareUpdateRequestor.UpdateState.Idle,
                    OtaSoftwareUpdateRequestor.ChangeReason.Failure,
                ],
            ]);
            expect(requestor.stateOf(TestOtaRequestorServer).updateInProgressDetails).equals(null);
        } finally {
            await MockTime.resolve(restarted.close());
        }
    }).timeout(10_000);

    it("returns to idle, forgets the update and asks the provider again on the next announcement when applying it fails", async () => {
        const data = { expectedOtaImage: Bytes.fromHex("") };
        const { applyUpdatePromise, TestOtaRequestorServer } = InstrumentedOtaRequestorServer(
            { requestUserConsent: false },
            data,
        );

        let storedDuringApply: unknown;
        class FailingOtaRequestorServer extends TestOtaRequestorServer {
            override async applyUpdate(newSoftwareVersion: number, fileDesignator: PersistedFileDesignator) {
                await super.applyUpdate(newSoftwareVersion, fileDesignator);
                storedDuringApply =
                    site.storageFor(device)["root.parts.ota-requestor.otaSoftwareUpdateRequestor"]
                        ?.updateInProgressDetails;
                await fileDesignator.delete();
                throw new ImplementationError("Simulated apply failure");
            }
        }

        const provider = InstrumentedOtaProviderServer({ requestUserConsentForUpdate: false });
        const { site, device, controller, otaProvider, otaRequestor } = await initOtaSite(
            provider.TestOtaProviderServer,
            FailingOtaRequestorServer,
        );
        await using _localSite = site;

        const transitions = new Array<OtaSoftwareUpdateRequestor.StateTransitionEvent>();
        const { resolver: idleResolver, promise: idlePromise } = createPromise<void>();
        const { resolver: nextResolver, promise: nextPromise } = createPromise<void>();
        otaRequestor.eventsOf(FailingOtaRequestorServer).stateTransition.on(event => {
            transitions.push(event);
            if (event.newState === OtaSoftwareUpdateRequestor.UpdateState.Idle) {
                idleResolver();
            } else if (transitions.at(-2)?.reason === OtaSoftwareUpdateRequestor.ChangeReason.Failure) {
                nextResolver();
            }
        });

        const { otaImage, vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
        data.expectedOtaImage = Bytes.of(otaImage.image);

        const peerAddress = controller.peers.get("peer1")!.state.commissioning.peerAddress!;
        await otaProvider.act(agent =>
            agent
                .get(SoftwareUpdateManager)
                .forceUpdate(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion }),
        );
        await MockTime.resolve(applyUpdatePromise);
        await MockTime.resolve(idlePromise);

        expect(
            transitions.slice(-1).map(({ previousState, newState, reason }) => [previousState, newState, reason]),
        ).deep.equals([
            [
                OtaSoftwareUpdateRequestor.UpdateState.Applying,
                OtaSoftwareUpdateRequestor.UpdateState.Idle,
                OtaSoftwareUpdateRequestor.ChangeReason.Failure,
            ],
        ]);
        expect(otaRequestor.stateOf(FailingOtaRequestorServer).updateInProgressDetails).equals(null);
        expect(storedDuringApply).not.equals(undefined);
        expect(storedDuringApply).not.equals(null);
        const stored = site.storageFor(device)["root.parts.ota-requestor.otaSoftwareUpdateRequestor"];
        expect(stored?.updateInProgressDetails ?? null).equals(null);

        // With the file gone the next attempt asks the provider rather than applying from disk
        await otaProvider.act(agent =>
            agent
                .get(SoftwareUpdateManager)
                .forceUpdate(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion }),
        );
        await MockTime.resolve(nextPromise);
        expect(transitions.at(-1)?.newState).equals(OtaSoftwareUpdateRequestor.UpdateState.Querying);
    }).timeout(10_000);

    it("does not query while an update is being applied", async () => {
        const data = { expectedOtaImage: Bytes.fromHex("") };
        const { applyUpdatePromise, TestOtaRequestorServer } = InstrumentedOtaRequestorServer(
            { requestUserConsent: false },
            data,
        );
        const { resolver: releaseApply, promise: applyReleased } = createPromise<void>();

        // Consumes the file and then takes its time, as flashing an image does
        class SlowOtaRequestorServer extends TestOtaRequestorServer {
            override async applyUpdate(newSoftwareVersion: number, fileDesignator: PersistedFileDesignator) {
                await super.applyUpdate(newSoftwareVersion, fileDesignator);
                await fileDesignator.delete();
                await applyReleased;
            }
        }

        const provider = InstrumentedOtaProviderServer({ requestUserConsentForUpdate: false });
        const { site, device, controller, otaProvider, otaRequestor } = await initOtaSite(
            provider.TestOtaProviderServer,
            SlowOtaRequestorServer,
        );
        await using _localSite = site;

        const transitions = new Array<OtaSoftwareUpdateRequestor.StateTransitionEvent>();
        const { resolver: idleResolver, promise: idlePromise } = createPromise<void>();
        otaRequestor.eventsOf(SlowOtaRequestorServer).stateTransition.on(event => {
            transitions.push(event);
            if (event.newState === OtaSoftwareUpdateRequestor.UpdateState.Idle) {
                idleResolver();
            }
        });

        const { otaImage, vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
        data.expectedOtaImage = Bytes.of(otaImage.image);

        const peerAddress = controller.peers.get("peer1")!.state.commissioning.peerAddress!;
        await otaProvider.act(agent =>
            agent
                .get(SoftwareUpdateManager)
                .forceUpdate(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion }),
        );
        await MockTime.resolve(applyUpdatePromise);

        // An announcement schedules a query with an explicit delay, whatever the requestor is doing
        const [{ location }] = otaRequestor.stateOf(SlowOtaRequestorServer).activeOtaProviders;
        const requestorEndpoint = [...controller.peers.get("peer1")!.endpoints].find(endpoint =>
            endpoint.behaviors.has(OtaSoftwareUpdateRequestorClient),
        );
        await MockTime.resolve(
            requestorEndpoint!.commandsOf(OtaSoftwareUpdateRequestorClient).announceOtaProvider({
                providerNodeId: location.providerNodeId,
                vendorId: VendorId(vendorId),
                announcementReason: OtaSoftwareUpdateRequestor.AnnouncementReason.UpdateAvailable,
                endpoint: location.endpoint,
            }),
        );
        await MockTime.advance(Seconds(700));
        await MockTime.macrotasks;

        expect(otaRequestor.stateOf(SlowOtaRequestorServer).updateState).equals(
            OtaSoftwareUpdateRequestor.UpdateState.Applying,
        );
        expect(
            transitions.filter(
                ({ previousState }) => previousState === OtaSoftwareUpdateRequestor.UpdateState.Applying,
            ),
        ).length(0);

        releaseApply();
        await MockTime.resolve(idlePromise);
    }).timeout(10_000);

    it("handles an announcement only after a running query, so no second query overlaps it", async () => {
        const { promise: queried, resolver: queryArrived } = createPromise<void>();
        const { promise: answer, resolver: releaseAnswer } = createPromise<void>();
        let queries = 0;

        class SlowOtaProviderServer extends OtaSoftwareUpdateProviderServer {
            override async queryImage(): Promise<OtaSoftwareUpdateProvider.QueryImageResponse> {
                queries++;
                queryArrived();
                await answer;
                return { status: OtaSoftwareUpdateProvider.Status.NotAvailable };
            }
        }

        const { site, controller, otaRequestor } = await initOtaSite(
            SlowOtaProviderServer,
            OtaSoftwareUpdateRequestorServer,
        );
        await using _localSite = site;
        await MockTime.resolve(queried);

        const [{ location }] = otaRequestor.stateOf(OtaSoftwareUpdateRequestorServer).activeOtaProviders;
        const requestorEndpoint = [...controller.peers.get("peer1")!.endpoints].find(endpoint =>
            endpoint.behaviors.has(OtaSoftwareUpdateRequestorClient),
        );
        let announced = false;
        const announcement = requestorEndpoint!
            .commandsOf(OtaSoftwareUpdateRequestorClient)
            .announceOtaProvider({
                providerNodeId: location.providerNodeId,
                vendorId: VendorId(0xfff1),
                announcementReason: OtaSoftwareUpdateRequestor.AnnouncementReason.UrgentUpdateAvailable,
                endpoint: location.endpoint,
            })
            .then(() => (announced = true));

        await MockTime.advance(Seconds(700));
        await MockTime.macrotasks;
        expect(announced).false;
        expect(queries).equals(1);

        releaseAnswer();
        await MockTime.resolve(announcement);
        await MockTime.advance(Seconds(700));
        await MockTime.macrotasks;
        expect(queries).equals(2);
    });

    describe("with a provider that answers Busy", () => {
        /** A provider answering every query Busy, recording the virtual time of each answer. */
        function BusyOtaProviderServer() {
            const answeredAt = new Array<number>();

            class TestOtaProviderServer extends OtaSoftwareUpdateProviderServer {
                override async queryImage(): Promise<OtaSoftwareUpdateProvider.QueryImageResponse> {
                    answeredAt.push(MockTime.nowUs);
                    return { status: OtaSoftwareUpdateProvider.Status.Busy, delayedActionTime: 60 };
                }
            }

            return { TestOtaProviderServer, answeredAt };
        }

        /**
         * The requestor's state transitions, which a test can wait on by the number of transitions into a state.  Waits
         * on the requestor's own events, so they do not depend on how far mock network delivery lags virtual time.
         */
        function stateTransitionsOf(otaRequestor: Endpoint) {
            const transitions = new Array<OtaSoftwareUpdateRequestor.StateTransitionEvent>();
            const waiters = new Array<{
                state: OtaSoftwareUpdateRequestor.UpdateState;
                count: number;
                resolver: () => void;
            }>();

            const reached = (state: OtaSoftwareUpdateRequestor.UpdateState, count: number) =>
                transitions.filter(({ newState }) => newState === state).length >= count;

            otaRequestor.eventsOf(OtaSoftwareUpdateRequestorServer).stateTransition.on(event => {
                transitions.push(event);
                for (const waiter of [...waiters]) {
                    if (reached(waiter.state, waiter.count)) {
                        waiters.splice(waiters.indexOf(waiter), 1);
                        waiter.resolver();
                    }
                }
            });

            return {
                transitions,
                into(state: OtaSoftwareUpdateRequestor.UpdateState, count = 1) {
                    const { promise, resolver } = createPromise<void>();
                    if (reached(state, count)) {
                        resolver();
                    } else {
                        waiters.push({ state, count, resolver });
                    }
                    return promise;
                },
            };
        }

        it("waits in DelayedOnQuery while the retry is armed, and queries again when it is due", async () => {
            const busy = BusyOtaProviderServer();
            const { site, otaRequestor } = await initOtaSite(
                busy.TestOtaProviderServer,
                OtaSoftwareUpdateRequestorServer,
            );
            await using _localSite = site;
            const states = stateTransitionsOf(otaRequestor);

            await MockTime.resolve(states.into(OtaSoftwareUpdateRequestor.UpdateState.DelayedOnQuery));
            await MockTime.resolve(states.into(OtaSoftwareUpdateRequestor.UpdateState.DelayedOnQuery, 2));

            const { Querying, DelayedOnQuery } = OtaSoftwareUpdateRequestor.UpdateState;
            expect(states.transitions.map(({ newState }) => newState)).deep.equals([
                Querying,
                DelayedOnQuery,
                Querying,
                DelayedOnQuery,
            ]);

            expect(busy.answeredAt.length).equals(2);

            // The provider asked for 60 s, and the requestor's minimum query interval of 120 s is longer
            const [first, second] = busy.answeredAt;
            expect(second - first).within(Seconds(120), Seconds(130));
        });

        it("gives up on the provider after three Busy retries", async () => {
            const busy = BusyOtaProviderServer();
            const { site, otaRequestor } = await initOtaSite(
                busy.TestOtaProviderServer,
                OtaSoftwareUpdateRequestorServer,
            );
            await using _localSite = site;
            const states = stateTransitionsOf(otaRequestor);

            await MockTime.resolve(states.into(OtaSoftwareUpdateRequestor.UpdateState.Idle));
            expect(busy.answeredAt.length).equals(4);

            const transitions = states.transitions.length;
            await MockTime.advance(Minutes(10));
            await MockTime.macrotasks;
            expect(states.transitions.length).equals(transitions);
            expect(busy.answeredAt.length).equals(4);
        });

        it("returns to Idle when updates are disabled while it waits", async () => {
            const busy = BusyOtaProviderServer();
            const { site, otaRequestor } = await initOtaSite(
                busy.TestOtaProviderServer,
                OtaSoftwareUpdateRequestorServer,
            );
            await using _localSite = site;
            const states = stateTransitionsOf(otaRequestor);
            await MockTime.resolve(states.into(OtaSoftwareUpdateRequestor.UpdateState.DelayedOnQuery));

            await MockTime.resolve(
                otaRequestor.setStateOf(OtaSoftwareUpdateRequestorServer, { updatePossible: false }),
            );

            expect(otaRequestor.stateOf(OtaSoftwareUpdateRequestorServer).updateState).equals(
                OtaSoftwareUpdateRequestor.UpdateState.Idle,
            );
            const transitions = states.transitions.length;
            await MockTime.advance(Minutes(10));
            await MockTime.macrotasks;
            expect(states.transitions.length).equals(transitions);
            expect(busy.answeredAt.length).equals(1);
        });
    });

    it("OTA reboot: closes older sessions and does not re-subscribe a device that feeds its subscription", async () => {
        const data = { expectedOtaImage: Bytes.fromHex("") };

        const { applyUpdatePromise, announceOtaProviderPromise, TestOtaRequestorServer } =
            InstrumentedOtaRequestorServer({ requestUserConsent: false }, data);

        const {
            queryImagePromise,
            applyUpdateRequestPromise,
            checkUpdateAvailablePromise,
            notifyUpdateAppliedPromise,
            TestOtaProviderServer,
        } = InstrumentedOtaProviderServer({ requestUserConsentForUpdate: false });

        const { site, device, controller, otaProvider } = await initOtaSite(
            TestOtaProviderServer,
            TestOtaRequestorServer,
        );
        await using _localSite = site;

        const { otaImage, vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
        data.expectedOtaImage = Bytes.of(otaImage.image);

        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.state.commissioning.peerAddress!;

        // Spy on the collaborators the armer drives. No restore is needed: each initOtaSite test gets its
        // own Environment, so these patches die with the site (same rationale as the BDX test below).
        const shutdownCalls = new Array<{ address: PeerAddress; keep?: NodeSession | Timestamp }>();
        const closeForPeerCalls = new Array<PeerAddress>();
        // A device-pushed (non-initiator) session for this peer is the reboot return the armer keys on; capturing
        // it lets us prove the armer's Mechanism A fired (it passes the returning session), distinct from the
        // Peers.#onStartUp reboot path that also calls handlePeerShutdown.
        const rebootSessions = new Array<NodeSession>();
        await otaProvider.act(agent => {
            const sessionManager = agent.env.get(SessionManager);
            const subscriptions = agent.env.get(ClientSubscriptions);
            const originalShutdown = sessionManager.handlePeerShutdown.bind(sessionManager);
            sessionManager.handlePeerShutdown = (address, keep) => {
                shutdownCalls.push({ address, keep });
                return originalShutdown(address, keep);
            };
            const originalCloseForPeer = subscriptions.closeForPeer.bind(subscriptions);
            subscriptions.closeForPeer = address => {
                closeForPeerCalls.push(address);
                return originalCloseForPeer(address);
            };
            sessionManager.sessions.added.on(session => {
                if (!session.isInitiator && PeerAddress.is(session.peerAddress, peerAddress)) {
                    rebootSessions.push(session);
                }
            });
        });

        await otaProvider.act(agent =>
            agent
                .get(SoftwareUpdateManager)
                .forceUpdate(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion }),
        );

        await MockTime.resolve(announceOtaProviderPromise);
        await MockTime.resolve(queryImagePromise);
        await MockTime.resolve(checkUpdateAvailablePromise);
        await MockTime.resolve(applyUpdateRequestPromise);

        // The armer specifically must have been armed for this peer at Applying — this disambiguates
        // the shutdownCalls assertion below from the general Peers.#onStartUp reboot path, which also
        // calls handlePeerShutdown independently of OTA.
        const armerDefinedAfterApplying = await otaProvider.act(
            agent => agent.get(SoftwareUpdateManager).internal.rebootResubscribeArmer !== undefined,
        );
        expect(armerDefinedAfterApplying).equals(true);

        await MockTime.resolve(applyUpdatePromise);

        // Simulate reboot with the new version.  The device re-establishes its persisted subscription over the session
        // it opens, so it keeps feeding the subscription.  The sibling Mechanism B test proves the grace window reaches
        // closeForPeer in this harness, so the keep asserted below is a decision and not an absence of one.
        await MockTime.resolve(device.stop());
        await device.setStateOf(BasicInformationServer, { softwareVersion: targetSoftwareVersion });
        await MockTime.resolve(device.start());
        await MockTime.resolve(notifyUpdateAppliedPromise);

        // Let the grace window elapse.
        await MockTime.advance(Seconds(30));
        await MockTime.macrotasks;

        // Mechanism A ran for the returning peer with the reboot session, not merely the general Peers.#onStartUp
        // shutdown.
        expect(rebootSessions.length).greaterThan(0);
        expect(
            shutdownCalls.some(
                c =>
                    PeerAddress.is(c.address, peerAddress) &&
                    typeof c.keep === "object" &&
                    rebootSessions.includes(c.keep),
            ),
        ).equals(true);

        // …and because the subscription was fed, the armer chose KEEP: no force re-subscribe.
        expect(closeForPeerCalls.some(a => PeerAddress.is(a, peerAddress))).equals(false);

        // The armer watches the ClientSubscriptions of one run; the next run must not reuse it
        await MockTime.resolve(controller.stop());
        expect(otaProvider.behaviors.internalsOf(SoftwareUpdateManager).rebootResubscribeArmer).undefined;

        await site[Symbol.asyncDispose]();
    }).timeout(10_000);

    it("OTA reboot: force re-subscribes (Mechanism B) when the subscription is not fed within the grace window", async () => {
        const data = { expectedOtaImage: Bytes.fromHex("") };

        const { applyUpdatePromise, announceOtaProviderPromise, TestOtaRequestorServer } =
            InstrumentedOtaRequestorServer({ requestUserConsent: false }, data);

        const {
            queryImagePromise,
            applyUpdateRequestPromise,
            checkUpdateAvailablePromise,
            notifyUpdateAppliedPromise,
            TestOtaProviderServer,
        } = InstrumentedOtaProviderServer({ requestUserConsentForUpdate: false });

        const { site, device, controller, otaProvider } = await initOtaSite(
            TestOtaProviderServer,
            TestOtaRequestorServer,
        );
        await using _localSite = site;

        const { otaImage, vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
        data.expectedOtaImage = Bytes.of(otaImage.image);

        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.state.commissioning.peerAddress!;

        // Complement of the sibling "does not re-subscribe" test: spy on the real closeForPeer and let the
        // rebooted device stay silent, which is what a device that does not persist subscriptions does. No
        // restore is needed: each initOtaSite test gets its own Environment, so this patch dies with the site.
        const closeForPeerCalls = new Array<PeerAddress>();
        await otaProvider.act(agent => {
            const subscriptions = agent.env.get(ClientSubscriptions);
            const originalCloseForPeer = subscriptions.closeForPeer.bind(subscriptions);
            subscriptions.closeForPeer = address => {
                closeForPeerCalls.push(address);
                return originalCloseForPeer(address);
            };
        });

        await otaProvider.act(agent =>
            agent
                .get(SoftwareUpdateManager)
                .forceUpdate(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion }),
        );

        await MockTime.resolve(announceOtaProviderPromise);
        await MockTime.resolve(queryImagePromise);
        await MockTime.resolve(checkUpdateAvailablePromise);
        await MockTime.resolve(applyUpdateRequestPromise);

        const armerDefinedAfterApplying = await otaProvider.act(
            agent => agent.get(SoftwareUpdateManager).internal.rebootResubscribeArmer !== undefined,
        );
        expect(armerDefinedAfterApplying).equals(true);

        await MockTime.resolve(applyUpdatePromise);

        // Simulate reboot with the new version of a device that does not persist subscriptions
        await device.setStateOf(SubscriptionsServer, { persistenceEnabled: false });
        await MockTime.resolve(device.stop());
        await device.setStateOf(BasicInformationServer, { softwareVersion: targetSoftwareVersion });
        await MockTime.resolve(device.start());
        await MockTime.resolve(notifyUpdateAppliedPromise);

        // Nothing must fire before the grace elapses — this rules out a regression that force-re-subscribes
        // on session-added rather than after the grace window.
        expect(closeForPeerCalls.some(a => PeerAddress.is(a, peerAddress))).equals(false);

        // Let the grace window elapse without the device reporting.
        await MockTime.advance(Seconds(31));
        await MockTime.macrotasks;

        expect(closeForPeerCalls.some(a => PeerAddress.is(a, peerAddress))).equals(true);

        await site[Symbol.asyncDispose]();
    }).timeout(10_000);

    it("a real inbound subscription report announces the session it arrived over", async () => {
        // Exercises the actual report notification in ClientSubscriptionHandler with no patch of it — the
        // RebootResubscribeArmer's grace-window decision depends entirely on this real path staying correct.
        const { TestOtaProviderServer } = InstrumentedOtaProviderServer({ requestUserConsentForUpdate: false });
        const { TestOtaRequestorServer } = InstrumentedOtaRequestorServer({ requestUserConsent: false });

        const { site, device, controller, otaProvider } = await initOtaSite(
            TestOtaProviderServer,
            TestOtaRequestorServer,
        );
        await using _localSite = site;

        // subscribedPeer waits for the sustained subscription to be genuinely active; without that wait, a
        // state change made immediately after commissioning can race the initial bootstrap read and land via
        // that read's response rather than a real subscription report.
        const peer1 = await subscribedPeer(controller, "peer1");
        // #peers is keyed by the interned PeerAddress instance (reference equality); state.commissioning.peerAddress
        // is not itself interned, so it must be normalized before use as a lookup key here — same as production
        // callers (e.g. SoftwareUpdateManager.forceUpdate) do via PeerAddress(peerAddress).
        const peerAddress = PeerAddress(peer1.state.commissioning.peerAddress!);

        const { subscriptions, sessions } = await otaProvider.act(agent => ({
            subscriptions: agent.env.get(ClientSubscriptions),
            sessions: agent.env.get(SessionManager),
        }));

        const reports = new Array<{ peer: PeerAddress; session: SecureSession }>();
        subscriptions.reportStarted.on(session => {
            reports.push({ peer: session.peerAddress, session });
        });

        // Only device-pushed reports flow through ClientSubscriptionHandler; the initial priming report comes back
        // inline in the subscribe exchange and never touches that path. So we drive TWO successive device-pushed
        // reports and assert both are announced — a notification raised from the wrong place would fail even
        // though a single report leaves the list merely non-empty.
        const firstReport = new Promise<void>(resolve => {
            peer1.eventsOf(BasicInformationClient).softwareVersion$Changed.once(() => resolve());
        });
        await device.setStateOf(BasicInformationServer, { softwareVersion: 99 });
        await MockTime.resolve(firstReport);
        expect(reports.length).equals(1);

        await MockTime.advance(Seconds(5));

        const secondReport = new Promise<void>(resolve => {
            peer1.eventsOf(BasicInformationClient).softwareVersion$Changed.once(() => resolve());
        });
        await device.setStateOf(BasicInformationServer, { softwareVersion: 100 });
        await MockTime.resolve(secondReport);
        expect(reports.length).equals(2);

        // The session is what the armer keys its decision on, so each report must name the peer's own live session
        // rather than any session that happens to exist.
        const live = sessions.sessions.filter(session => PeerAddress.is(session.peerAddress, peerAddress));
        expect(live.length).equals(1);
        expect(reports.every(report => PeerAddress.is(report.peer, peerAddress) && report.session === live[0])).equals(
            true,
        );

        await site[Symbol.asyncDispose]();
    }).timeout(10_000);

    it("OTA reboot: the failed-apply detection path does not disarm the peer", async () => {
        // The armer refreshes the subscription only when the returning device opens a device-initiated session; in
        // this harness that session appears via notifyUpdateApplied, which a FAILED apply never sends (the device
        // instead schedules a much-later retry query). So the observable proof here is the invariant the fix relies
        // on: the failed-apply detection path must NOT disarm the peer, so a retry-query session arriving within the
        // return-timeout window still finds the armer live and re-subscribes fast instead of falling back to the full
        // liveness timeout. (A return slower than that window is recovered by the armer's own return-timeout backstop
        // — a separate path exercised in RebootResubscribeArmerTest.) The sibling Mechanism-B test covers the
        // closeForPeer behaviour once such a session exists.
        const data = { expectedOtaImage: Bytes.fromHex("") };

        const { applyUpdatePromise, announceOtaProviderPromise, TestOtaRequestorServer } =
            InstrumentedOtaRequestorServer({ requestUserConsent: false }, data);

        const { queryImagePromise, applyUpdateRequestPromise, checkUpdateAvailablePromise, TestOtaProviderServer } =
            InstrumentedOtaProviderServer({ requestUserConsentForUpdate: false });

        const { site, device, controller, otaProvider } = await initOtaSite(
            TestOtaProviderServer,
            TestOtaRequestorServer,
        );
        await using _localSite = site;

        const { otaImage, vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
        data.expectedOtaImage = Bytes.of(otaImage.image);

        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.state.commissioning.peerAddress!;

        const updateFailedEvents = new Array<PeerAddress>();
        await otaProvider.act(agent => {
            agent.get(SoftwareUpdateManager).events.updateFailed.on(peer => {
                updateFailedEvents.push(peer);
            });
        });

        // Drive the update through to Applying, which arms the armer for this peer.
        await otaProvider.act(agent =>
            agent
                .get(SoftwareUpdateManager)
                .forceUpdate(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion }),
        );
        await MockTime.resolve(announceOtaProviderPromise);
        await MockTime.resolve(queryImagePromise);
        await MockTime.resolve(checkUpdateAvailablePromise);
        await MockTime.resolve(applyUpdateRequestPromise);

        // Armed at Applying. Spy on disarm so we can assert the failed-apply path leaves the arming in place. No
        // restore is needed: each initOtaSite test gets its own Environment, so the patch dies with the site.
        const disarmCalls = new Array<PeerAddress>();
        await otaProvider.act(agent => {
            const armer = agent.get(SoftwareUpdateManager).internal.rebootResubscribeArmer;
            expect(armer).not.undefined;
            const originalDisarm = armer!.disarm.bind(armer);
            armer!.disarm = address => {
                disarmCalls.push(address);
                return originalDisarm(address);
            };
        });

        await MockTime.resolve(applyUpdatePromise);

        // Simulate a FAILED apply: the device reboots reporting the OLD (unchanged) softwareVersion. startUp fires
        // with the old version while the entry is still in Applying → apply-failure detection.
        const subscription = peer1.behaviors.internalsOf(NetworkClient).activeSubscription!;
        expect(subscription).not.undefined;
        SustainedSubscription.assert(subscription);

        await MockTime.resolve(device.stop());
        await MockTime.resolve(subscription.inactive);

        // While the device is down, the return-timeout backstop (#onReturnTimeout) elapses and recovers the peer
        // (disarm + re-subscribe) — a separate path from the failed-apply detection this test guards, and one that
        // cannot be confused with it because detection only runs once the device is back up. Wait for it here, then
        // discard its disarm so the assertion below sees only disarm calls that could originate from the detection
        // code. (This backstop is covered directly in RebootResubscribeArmerTest.)
        while (!disarmCalls.some(a => PeerAddress.is(a, peerAddress))) {
            await MockTime.advance(Seconds(10));
        }
        disarmCalls.length = 0;

        // Keep the original softwareVersion (do NOT set it to targetSoftwareVersion).
        await MockTime.resolve(device.start());
        await MockTime.resolve(subscription.active);
        await MockTime.macrotasks;

        // Failure detection still fires…
        expect(updateFailedEvents.some(a => PeerAddress.is(a, peerAddress))).equals(true);
        // …and — the invariant this test guards — the failed-apply path did NOT disarm the peer. Re-adding a
        // disarm() to that branch would make this fail.
        expect(disarmCalls.some(a => PeerAddress.is(a, peerAddress))).equals(false);

        await site[Symbol.asyncDispose]();
    }).timeout(10_000);

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
                .forceUpdate(peerAddress!, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion });
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
    /** A commissioned pair with an OTA image staged, for tests that only exercise transfer-option resolution. */
    async function otaSiteWithImage() {
        const { TestOtaRequestorServer } = InstrumentedOtaRequestorServer(
            { requestUserConsent: false },
            { expectedOtaImage: Bytes.fromHex("") },
        );
        const { TestOtaProviderServer } = InstrumentedOtaProviderServer({ requestUserConsentForUpdate: false });

        const { site, device, controller, otaProvider } = await initOtaSite(
            TestOtaProviderServer,
            TestOtaRequestorServer,
        );
        const { vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
        const peerAddress = controller.peers.get("peer1")!.state.commissioning.peerAddress!;

        const optionsFor = () =>
            otaProvider.act(agent => agent.get(SoftwareUpdateManager).bdxTransferOptionsFor(peerAddress));
        const consentTo = (target: Partial<SoftwareUpdateManager.UpdateTarget>) =>
            otaProvider.act(agent =>
                agent.get(SoftwareUpdateManager).addUpdateConsent(peerAddress, {
                    vendorId: VendorId(vendorId),
                    productId,
                    targetSoftwareVersion,
                    ...target,
                }),
            );

        return { site, otaProvider, peerAddress, optionsFor, consentTo };
    }

    it("resolves transfer options from the consent, then from state", async () => {
        const { site, otaProvider, optionsFor, consentTo } = await otaSiteWithImage();
        await using _localSite = site;

        // Nothing configured: the peer and its medium decide
        expect(await optionsFor()).deep.equals({ maxBlockSize: undefined, additionalMrpDelay: undefined });

        await otaProvider.act(agent => {
            const { state } = agent.get(SoftwareUpdateManager);
            state.maxBdxBlockSize = 512;
            state.bdxAdditionalMrpDelay = Seconds(2);
        });
        expect(await optionsFor()).deep.equals({ maxBlockSize: 512, additionalMrpDelay: Seconds(2) });

        // Consent-level overrides outrank the general defaults
        await consentTo({ maxBdxBlockSize: 256, bdxAdditionalMrpDelay: Millis(500) });
        expect(await optionsFor()).deep.equals({ maxBlockSize: 256, additionalMrpDelay: Millis(500) });
    });

    it("lets a later consent change and clear the options of a queued update", async () => {
        const { site, optionsFor, consentTo } = await otaSiteWithImage();
        await using _localSite = site;

        await consentTo({ maxBdxBlockSize: 256, bdxAdditionalMrpDelay: Millis(500) });
        expect(await optionsFor()).deep.equals({ maxBlockSize: 256, additionalMrpDelay: Millis(500) });

        await consentTo({ maxBdxBlockSize: 128 });
        expect(await optionsFor()).deep.equals({ maxBlockSize: 128, additionalMrpDelay: undefined });

        await consentTo({});
        expect(await optionsFor()).deep.equals({ maxBlockSize: undefined, additionalMrpDelay: undefined });
    });

    it("rejects invalid transfer options before touching any state", async () => {
        const { site, otaProvider, peerAddress, consentTo } = await otaSiteWithImage();
        await using _localSite = site;

        for (const maxBdxBlockSize of [0, -1, 1.5, Number.NaN]) {
            await expect(consentTo({ maxBdxBlockSize })).to.be.rejectedWith(ImplementationError);
        }
        for (const bdxAdditionalMrpDelay of [Millis(-1), Millis(Number.NaN)]) {
            await expect(consentTo({ bdxAdditionalMrpDelay })).to.be.rejectedWith(ImplementationError);
        }

        // forceUpdate tears down BDX registration and queue state on its way, so it must reject first too
        await expect(
            otaProvider.act(agent =>
                agent.get(SoftwareUpdateManager).forceUpdate(peerAddress, {
                    vendorId: VendorId(0),
                    productId: 0,
                    targetSoftwareVersion: 1,
                    maxBdxBlockSize: 0,
                }),
            ),
        ).to.be.rejectedWith(ImplementationError);

        expect(await otaProvider.act(agent => agent.get(SoftwareUpdateManager).queuedUpdates)).length(0);
    });

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
                .addUpdateConsent(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion });
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

    it("refuses to force an update of a node without OTA requestor, storing no consent", async () => {
        const { TestOtaProviderServer } = InstrumentedOtaProviderServer({
            requestUserConsentForUpdate: false,
        });

        const site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            controller: {
                type: ServerNode.RootEndpoint,
                parts: [{ id: "ota-provider", type: OtaProviderEndpoint.with(TestOtaProviderServer) }],
            },
        });
        await using _localSite = site;

        const otaProvider = controller.parts.get("ota-provider")!;
        const peerAddress = controller.peers.get("peer1")!.state.commissioning.peerAddress!;

        await expect(
            otaProvider.act(agent =>
                agent.get(SoftwareUpdateManager).forceUpdate(peerAddress, {
                    vendorId: VendorId(0xfff1),
                    productId: 0x8000,
                    targetSoftwareVersion: 2,
                }),
            ),
        ).rejectedWith(OtaUpdateError, "not currently applicable");

        const state = await otaProvider.act(agent => {
            const manager = agent.get(SoftwareUpdateManager);
            return { consent: manager.hasConsent(peerAddress), consents: consentsOf(manager).length };
        });
        expect(state).deep.equals({ consent: false, consents: 0 });
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
                .addUpdateConsent(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion });
        });

        const attempt = await otaProvider.act(agent =>
            reportStatus(
                agent.get(SoftwareUpdateManager),
                peerAddress,
                targetSoftwareVersion,
                OtaUpdateStatus.Downloading,
            ),
        );

        const updateFailedEvents: PeerAddress[] = [];
        await otaProvider.act(agent => {
            agent.get(SoftwareUpdateManager).events.updateFailed.on(peer => {
                updateFailedEvents.push(peer);
            });
        });

        // Simulate BDX transport cancellation via Cancelled status
        await otaProvider.act(agent => {
            agent.get(SoftwareUpdateManager).reportAttemptStatus(attempt, OtaUpdateStatus.Cancelled);
        });

        // Queue entry should still exist (reset, not removed), and the reset entry is announced again at once
        const queue = await otaProvider.act(agent => agent.get(SoftwareUpdateManager).queuedUpdates);
        expect(queue).length(1);
        expect(queue[0].status).equals("in-progress");
        expect(queue[0].lastProgressStatus).undefined;

        // A cancelled transfer is retried, not failed; only removeConsent() reports a cancel as failed
        expect(updateFailedEvents).length(0);
    }).timeout(10_000);

    it("reports Cancelled and resets the queued update when it refuses the apply of its linked attempt", async () => {
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
        const peerAddress = controller.peers.get("peer1")!.state.commissioning.peerAddress!;

        await otaProvider.act(agent =>
            agent
                .get(SoftwareUpdateManager)
                .addUpdateConsent(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion }),
        );

        const result = await otaProvider.act(agent => {
            const manager = agent.get(SoftwareUpdateManager);
            const attempt = reportStatus(manager, peerAddress, targetSoftwareVersion, OtaUpdateStatus.Downloading);
            const before = manager.queuedUpdates[0].lastProgressStatus;
            // A version other than the one the attempt offered is refused
            const allowed = manager.applyUpdate(peerAddress, tokenOf(attempt), targetSoftwareVersion + 1, Seconds(120));
            return { before, allowed, status: attempt.status, queue: manager.queuedUpdates };
        });

        expect(result.before).equals(OtaUpdateStatus.Downloading);
        expect(result.allowed).false;
        expect(result.status).equals(OtaUpdateStatus.Cancelled);
        expect(result.queue).length(1);
        expect(result.queue[0].lastProgressStatus).undefined;
    }).timeout(10_000);

    it("answers a resent apply request of an applying attempt again and reports it applying once", async () => {
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
        const peerAddress = controller.peers.get("peer1")!.state.commissioning.peerAddress!;

        await otaProvider.act(agent =>
            agent
                .get(SoftwareUpdateManager)
                .addUpdateConsent(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion }),
        );

        const result = await otaProvider.act(agent => {
            const manager = agent.get(SoftwareUpdateManager);
            const applying = new Array<PeerAddress>();
            manager.events.updateApplying.on(peer => {
                applying.push(peer);
            });
            const attempt = reportStatus(manager, peerAddress, targetSoftwareVersion, OtaUpdateStatus.Applying);
            const resent = manager.applyUpdate(peerAddress, tokenOf(attempt), targetSoftwareVersion, Seconds(120));
            return { resent, applying: applying.length };
        });

        expect(result).deep.equals({ resent: true, applying: 1 });
    }).timeout(10_000);

    it("Done status clears the consent for the completed version", async () => {
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

        await otaProvider.act(agent =>
            agent
                .get(SoftwareUpdateManager)
                .addUpdateConsent(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion }),
        );
        expect(await otaProvider.act(agent => agent.get(SoftwareUpdateManager).hasConsent(peerAddress))).equals(true);

        await otaProvider.act(agent => {
            const manager = agent.get(SoftwareUpdateManager);
            const attempt = deliverOffer(manager, peerAddress, targetSoftwareVersion);
            manager.updateApplied(peerAddress, tokenOf(attempt), targetSoftwareVersion);
        });

        expect(await otaProvider.act(agent => agent.get(SoftwareUpdateManager).hasConsent(peerAddress))).equals(false);
        expect(await otaProvider.act(agent => agent.get(SoftwareUpdateManager).queuedUpdates)).length(0);
    }).timeout(10_000);

    it("refuses an apply it holds no consent for, naming the wait in seconds", async () => {
        const data = { expectedOtaImage: Bytes.fromHex("") };
        const { TestOtaRequestorServer } = InstrumentedOtaRequestorServer({ requestUserConsent: false }, data);

        let peerAddress: PeerAddress | undefined;
        let targetVersion: number | undefined;
        const { queryImagePromise, applyUpdateRequestPromise, applyUpdateResponses, TestOtaProviderServer } =
            InstrumentedOtaProviderServer(
                { requestUserConsentForUpdate: false, notifyUpdateApplied: false },
                {
                    // The provider refuses an update it holds no consent for, and the flow that reaches
                    // its apply is the flow that granted one, so the consent goes away here
                    beforeApplyUpdateRequest: agent =>
                        agent.get(SoftwareUpdateManager).removeConsent(peerAddress!, targetVersion!),
                },
            );

        const { site, device, controller, otaProvider } = await initOtaSite(
            TestOtaProviderServer,
            TestOtaRequestorServer,
        );
        await using _localSite = site;

        const { otaImage, vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
        data.expectedOtaImage = Bytes.of(otaImage.image);
        targetVersion = targetSoftwareVersion;

        const peer1 = controller.peers.get("peer1")!;
        peerAddress = peer1.state.commissioning.peerAddress!;

        await otaProvider.act(agent =>
            agent
                .get(SoftwareUpdateManager)
                .forceUpdate(peerAddress!, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion }),
        );

        await MockTime.resolve(queryImagePromise);
        await MockTime.resolve(applyUpdateRequestPromise);
        await MockTime.macrotasks;

        expect(applyUpdateResponses).length(1);
        expect(applyUpdateResponses[0].action).equals(OtaSoftwareUpdateProvider.ApplyUpdateAction.Discontinue);

        // DelayedActionTime is seconds on the wire (Matter Core 11.20.6.10), so two minutes is 120; a
        // Duration written straight into the field would say 120000, which a requestor clamps to 24 hours
        expect(applyUpdateResponses[0].delayedActionTime).equals(120);

        await site[Symbol.asyncDispose]();
    }).timeout(10_000);

    /** Drives one update to its apply, with the apply request rewritten as a non-compliant requestor sends it. */
    async function applyRewritten(
        rewrite: (
            request: OtaSoftwareUpdateProvider.ApplyUpdateRequest,
        ) => OtaSoftwareUpdateProvider.ApplyUpdateRequest,
        {
            consent = "kept",
            afterApply,
        }: {
            /** Inspects the provider once the apply was answered. */
            afterApply?: (agent: Agent) => void;
            consent?:
                | "kept"
                | "not-held"
                | "removed"
                | "removed-without-queued-update"
                | "moved-to-next-version"
                | "removed-replaced-as-stale";
        } = {},
    ) {
        const data = { expectedOtaImage: Bytes.fromHex("") };
        const { TestOtaRequestorServer } = InstrumentedOtaRequestorServer({ requestUserConsent: false }, data);

        let peerAddress: PeerAddress | undefined;
        let target: SoftwareUpdateManager.UpdateTarget | undefined;
        let controller: ServerNode | undefined;
        let device: ServerNode | undefined;
        const { queryImagePromise, applyUpdateRequestPromise, applyUpdateResponses, TestOtaProviderServer } =
            InstrumentedOtaProviderServer(
                { requestUserConsentForUpdate: false, notifyUpdateApplied: false },
                {
                    beforeApplyUpdateRequest: async agent => {
                        const manager = agent.get(SoftwareUpdateManager);
                        switch (consent) {
                            case "not-held":
                                // The consent is gone without removeConsent(), as when it was completed meanwhile
                                manager.internal.consents.delete(peerAddress!);
                                break;
                            case "removed":
                                await manager.removeConsent(peerAddress!, target!.targetSoftwareVersion);
                                break;
                            case "removed-without-queued-update":
                                manager.internal.updateQueue = [];
                                await manager.removeConsent(peerAddress!, target!.targetSoftwareVersion);
                                break;
                            case "removed-replaced-as-stale":
                                await manager.removeConsent(peerAddress!, target!.targetSoftwareVersion);
                                // The wall clock only, so the exchange of the apply request in flight does not
                                // time out.  A new query of the node finds the attempt stale and ends it.
                                await withWallClockAhead(Minutes(16), () =>
                                    manager.admitQuery(peerAddress!, sessionOf(manager, peerAddress!), 0),
                                );
                                break;
                            case "moved-to-next-version":
                                await manager.addUpdateConsent(peerAddress!, {
                                    ...target!,
                                    targetSoftwareVersion: target!.targetSoftwareVersion + 1,
                                });
                                break;
                        }
                    },
                    rewriteApplyUpdateRequest: rewrite,
                },
            );

        const ota = await initOtaSite(TestOtaProviderServer, TestOtaRequestorServer);
        const { site, otaProvider } = ota;
        ({ controller, device } = ota);
        await using _localSite = site;

        const { otaImage, vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
        data.expectedOtaImage = Bytes.of(otaImage.image);
        target = { vendorId: VendorId(vendorId), productId, targetSoftwareVersion };
        peerAddress = controller.peers.get("peer1")!.state.commissioning.peerAddress!;

        await otaProvider.act(agent => agent.get(SoftwareUpdateManager).forceUpdate(peerAddress!, target!));

        await MockTime.resolve(queryImagePromise);
        await MockTime.resolve(applyUpdateRequestPromise);
        await MockTime.macrotasks;
        if (afterApply !== undefined) {
            await otaProvider.act(afterApply);
        }

        return applyUpdateResponses.map(({ action }) => action);
    }

    it("applies the version of a known update token when the requestor asks for version 0", async () => {
        expect(await applyRewritten(request => ({ ...request, newVersion: 0 }))).deep.equals([
            OtaSoftwareUpdateProvider.ApplyUpdateAction.Proceed,
        ]);
    }).timeout(10_000);

    it("refuses a version other than 0 that differs from its update token", async () => {
        expect(await applyRewritten(request => ({ ...request, newVersion: request.newVersion + 1 }))).deep.equals([
            OtaSoftwareUpdateProvider.ApplyUpdateAction.Discontinue,
        ]);
    }).timeout(10_000);

    it("refuses a version other than 0 that differs from its update token, even with consent for it", async () => {
        expect(
            await applyRewritten(request => ({ ...request, newVersion: request.newVersion + 1 }), {
                consent: "moved-to-next-version",
            }),
        ).deep.equals([OtaSoftwareUpdateProvider.ApplyUpdateAction.Discontinue]);
    }).timeout(10_000);

    it("applies the version of its update token once its consent is gone without removeConsent(), as the offer allowed it", async () => {
        expect(await applyRewritten(request => request, { consent: "not-held" })).deep.equals([
            OtaSoftwareUpdateProvider.ApplyUpdateAction.Proceed,
        ]);
    }).timeout(10_000);

    it("refuses the version of its update token once the consent is removed without a queued update", async () => {
        expect(await applyRewritten(request => request, { consent: "removed-without-queued-update" })).deep.equals([
            OtaSoftwareUpdateProvider.ApplyUpdateAction.Discontinue,
        ]);
    }).timeout(10_000);

    it("applies the version of its update token when a consent for a higher version is added meanwhile", async () => {
        expect(await applyRewritten(request => request, { consent: "moved-to-next-version" })).deep.equals([
            OtaSoftwareUpdateProvider.ApplyUpdateAction.Proceed,
        ]);
    }).timeout(10_000);

    it("applies a consented version under an update token it does not know, as after a restart", async () => {
        expect(
            await applyRewritten(request => ({ ...request, updateToken: Bytes.fromHex("0102030405060708") })),
        ).deep.equals([OtaSoftwareUpdateProvider.ApplyUpdateAction.Proceed]);
    }).timeout(10_000);

    it("tracks an allowed apply under an update token it did not hand out as an applying update", async () => {
        const unknownToken = Bytes.fromHex("0102030405060708");
        let adopted: { status: OtaUpdateStatus; linked: boolean } | undefined;
        await applyRewritten(request => ({ ...request, updateToken: unknownToken }), {
            afterApply: agent => {
                const manager = agent.get(SoftwareUpdateManager);
                const [{ peerAddress, phase }] = manager.internal.updateQueue;
                const attempt = manager.attemptFor(peerAddress, unknownToken);
                adopted = attempt && {
                    status: attempt.status,
                    linked: phase.state === "progress" && phase.attempt === attempt,
                };
            },
        });
        expect(adopted).deep.equals({ status: OtaUpdateStatus.Applying, linked: true });
    }).timeout(10_000);

    it("refuses version 0 under an update token it does not know", async () => {
        expect(
            await applyRewritten(request => ({
                ...request,
                updateToken: Bytes.fromHex("0102030405060708"),
                newVersion: 0,
            })),
        ).deep.equals([OtaSoftwareUpdateProvider.ApplyUpdateAction.Discontinue]);
    }).timeout(10_000);

    it("applies a version above 0 under an update token it does not know, also without a consent", async () => {
        expect(
            await applyRewritten(
                request => ({
                    ...request,
                    updateToken: Bytes.fromHex("0102030405060708"),
                    newVersion: 1,
                }),
                { consent: "not-held" },
            ),
        ).deep.equals([OtaSoftwareUpdateProvider.ApplyUpdateAction.Proceed]);
    }).timeout(10_000);

    it("applies a version above 0 under an update token whose attempt a new query ended as stale, also after its consent was removed", async () => {
        expect(
            await applyRewritten(request => request, {
                consent: "removed-replaced-as-stale",
            }),
        ).deep.equals([OtaSoftwareUpdateProvider.ApplyUpdateAction.Proceed]);
    }).timeout(10_000);

    it("refuses version 0 for a known update token once its consent is gone", async () => {
        expect(await applyRewritten(request => ({ ...request, newVersion: 0 }), { consent: "removed" })).deep.equals([
            OtaSoftwareUpdateProvider.ApplyUpdateAction.Discontinue,
        ]);
    }).timeout(10_000);

    /** Drives one update to its apply with a provider whose `applyDelay` is `delay`. */
    async function applyWithDelay(delay: Duration) {
        const data = { expectedOtaImage: Bytes.fromHex("") };
        const { announceOtaProviderPromise, TestOtaRequestorServer } = InstrumentedOtaRequestorServer(
            { requestUserConsent: false },
            data,
        );
        const { queryImagePromise, applyUpdateRequestPromise, checkUpdateAvailablePromise, TestOtaProviderServer } =
            InstrumentedOtaProviderServer({ requestUserConsentForUpdate: false });

        const sent = new Array<number>();
        class DelayingProviderServer extends TestOtaProviderServer {
            override initialize() {
                this.state.applyDelay = delay;
                return super.initialize();
            }

            override async applyUpdateRequest(request: OtaSoftwareUpdateProvider.ApplyUpdateRequest) {
                const response = await super.applyUpdateRequest(request);
                sent.push(response.delayedActionTime);
                return response;
            }
        }

        const armed = new Array<Duration | undefined>();
        const originalArm = RebootResubscribeArmer.prototype.arm;
        RebootResubscribeArmer.prototype.arm = function (this: RebootResubscribeArmer, peer, applyDelay) {
            armed.push(applyDelay);
            return originalArm.call(this, peer, applyDelay);
        };
        try {
            const { site, device, controller, otaProvider } = await initOtaSite(
                DelayingProviderServer,
                TestOtaRequestorServer,
            );
            await using _localSite = site;

            const { otaImage, vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
            data.expectedOtaImage = Bytes.of(otaImage.image);
            const peerAddress = controller.peers.get("peer1")!.state.commissioning.peerAddress!;

            await otaProvider.act(agent =>
                agent
                    .get(SoftwareUpdateManager)
                    .forceUpdate(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion }),
            );
            await MockTime.resolve(announceOtaProviderPromise);
            await MockTime.resolve(queryImagePromise);
            await MockTime.resolve(checkUpdateAvailablePromise);
            await MockTime.resolve(applyUpdateRequestPromise);
        } finally {
            RebootResubscribeArmer.prototype.arm = originalArm;
        }
        return { sent, armed };
    }

    it("expects the device's return only after the delay it was allowed to apply with", async () => {
        const { sent, armed } = await applyWithDelay(Seconds(180));

        expect(sent).deep.equal([180]);
        expect(armed).deep.equal([Seconds(180)]);
    }).timeout(10_000);

    it("rounds an apply delay up to whole seconds, since it is a minimum wait", async () => {
        const { sent, armed } = await applyWithDelay(Millis(1500));

        expect(sent).deep.equal([2]);
        expect(armed).deep.equal([Seconds(2)]);
    }).timeout(10_000);

    it("sends at most a day of apply delay, which a requestor may treat a longer one as", async () => {
        const { sent, armed } = await applyWithDelay(Hours(48));

        expect(sent).deep.equal([86_400]);
        expect(armed).deep.equal([Seconds(86_400)]);
    }).timeout(10_000);

    it("does not count an update as stalled while the device waits out its apply delay", async () => {
        const { TestOtaProviderServer } = InstrumentedOtaProviderServer({ requestUserConsentForUpdate: false });
        const { TestOtaRequestorServer } = InstrumentedOtaRequestorServer({ requestUserConsent: false });
        const { site, device, controller, otaProvider } = await initOtaSite(
            TestOtaProviderServer,
            TestOtaRequestorServer,
        );
        await using _localSite = site;

        const { vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
        const peerAddress = controller.peers.get("peer1")!.state.commissioning.peerAddress!;
        await otaProvider.act(agent =>
            agent
                .get(SoftwareUpdateManager)
                .addUpdateConsent(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion }),
        );
        await otaProvider.act(agent =>
            reportStatus(
                agent.get(SoftwareUpdateManager),
                peerAddress,
                targetSoftwareVersion,
                OtaUpdateStatus.Applying,
                Minutes(30),
            ),
        );

        const phaseOf = () =>
            otaProvider.act(agent => agent.get(SoftwareUpdateManager).internal.updateQueue.map(({ phase }) => phase));

        await MockTime.advance(Minutes(40));
        expect((await phaseOf()).map(({ state }) => state)).deep.equals(["progress"]);

        // Past the delay and the progress timeout, the queue resets the attempt and announces the update again
        await MockTime.advance(Minutes(10));
        expect((await phaseOf()).map(({ state }) => state)).deep.equals(["announcing"]);
    }).timeout(10_000);

    it("moves an update whose apply did not take to the version consented while it applied", async () => {
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
        const target = { vendorId: VendorId(vendorId), productId };

        const updateFailedEvents = new Array<PeerAddress>();
        await otaProvider.act(async agent => {
            const manager = agent.get(SoftwareUpdateManager);
            manager.events.updateFailed.on(peer => {
                updateFailedEvents.push(peer);
            });
            await manager.addUpdateConsent(peerAddress, { ...target, targetSoftwareVersion });
            reportStatus(manager, peerAddress, targetSoftwareVersion, OtaUpdateStatus.Applying);
            await manager.addUpdateConsent(peerAddress, {
                ...target,
                targetSoftwareVersion: targetSoftwareVersion + 1,
            });
        });

        // The device restarts into its previous version
        const subscription = peer1.behaviors.internalsOf(NetworkClient).activeSubscription!;
        SustainedSubscription.assert(subscription);
        await MockTime.resolve(device.stop());
        await MockTime.resolve(subscription.inactive);
        await MockTime.resolve(device.start());
        await MockTime.resolve(subscription.active);
        await MockTime.macrotasks;

        expect(updateFailedEvents).length(1);
        expect(
            await otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                return manager.internal.updateQueue.map(entry => ({
                    targetSoftwareVersion: entry.targetSoftwareVersion,
                    failed: phaseStateOf(manager.internal, entry) === "failed" || consentFailed(manager, entry),
                }));
            }),
        ).deep.equals([{ targetSoftwareVersion: targetSoftwareVersion + 1, failed: false }]);
    }).timeout(10_000);

    it("Apply failure detected when startUp fires after Applying state", async () => {
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
                .addUpdateConsent(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion });
        });

        await otaProvider.act(agent => {
            reportStatus(
                agent.get(SoftwareUpdateManager),
                peerAddress,
                targetSoftwareVersion,
                OtaUpdateStatus.Applying,
            );
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

        // The failed update keeps its consent, but neither the queue nor a later check announces it again
        const afterCheck = await otaProvider.act(async agent => {
            const manager = agent.get(SoftwareUpdateManager);
            await manager.queryUpdates({ includeStoredUpdates: true });
            return {
                consent: manager.hasConsent(peerAddress, targetSoftwareVersion),
                queued: manager.queuedUpdates.length,
                phase: phaseStatesOf(manager.internal),
            };
        });
        expect(afterCheck).deep.equals({ consent: true, queued: 0, phase: ["failed"] });

        // A new consent still starts the update
        await otaProvider.act(agent =>
            agent
                .get(SoftwareUpdateManager)
                .forceUpdate(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion }),
        );
        const requeued = await otaProvider.act(agent => agent.get(SoftwareUpdateManager).queuedUpdates);
        expect(requeued.map(({ targetSoftwareVersion }) => targetSoftwareVersion)).deep.equals([targetSoftwareVersion]);
    }).timeout(10_000);

    /**
     * Queues an update the device has been allowed to apply but that it never acts on: it does not query again and
     * does not restart.
     */
    async function applyWithoutRestart(
        options: { applyDelay?: Duration; targetSoftwareVersion?: number; status?: OtaUpdateStatus } = {},
    ) {
        const { TestOtaProviderServer } = InstrumentedOtaProviderServer({ requestUserConsentForUpdate: false });
        const { TestOtaRequestorServer } = InstrumentedOtaRequestorServer({ requestUserConsent: false });
        const { site, device, controller, otaProvider } = await initOtaSite(
            TestOtaProviderServer,
            TestOtaRequestorServer,
        );

        const { vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
        const peerAddress = (await subscribedPeer(controller, "peer1")).state.commissioning.peerAddress!;
        const failed = new Array<PeerAddress>();
        await otaProvider.act(agent => {
            const manager = agent.get(SoftwareUpdateManager);
            manager.events.updateFailed.on(peer => {
                failed.push(peer);
            });
            manager.internal.announcements!.announceOtaProvider = async () => {};
        });

        await otaProvider.act(agent =>
            agent
                .get(SoftwareUpdateManager)
                .addUpdateConsent(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion }),
        );
        await otaProvider.act(agent => {
            const manager = agent.get(SoftwareUpdateManager);
            // No order of events reaches an entry in Applying whose target the node already runs: the version change
            // that brings the node there completes the entry first.  So the test lowers the target by hand
            if (options.targetSoftwareVersion !== undefined) {
                manager.internal.updateQueue[0].targetSoftwareVersion = options.targetSoftwareVersion;
            }
            reportStatus(
                manager,
                peerAddress,
                options.targetSoftwareVersion ?? targetSoftwareVersion,
                options.status ?? OtaUpdateStatus.Applying,
                options.applyDelay,
            );
        });

        // Steps let the mock network deliver reports in between, so the subscription stays up
        const runFor = async (duration: Duration) => {
            for (let elapsed = 0; elapsed < duration; elapsed += Seconds(10)) {
                await MockTime.advance(Seconds(10));
                await MockTime.macrotasks;
            }
        };
        const queued = () => otaProvider.act(agent => agent.get(SoftwareUpdateManager).queuedUpdates);

        const deadline = Time.nowMs + RebootResubscribeArmer.returnTimeout(options.applyDelay);
        const resubscribed = { afterDeadline: 0 };
        controller.peers
            .get("peer1")!
            .eventsOf(NetworkClient)
            .subscriptionStatusChanged.on(isActive => {
                if (isActive && Time.nowMs >= deadline) {
                    resubscribed.afterDeadline++;
                }
            });

        return { site, device, controller, peerAddress, failed, runFor, queued, resubscribed };
    }

    for (const { applyDelay, wait } of [
        { applyDelay: undefined, wait: Minutes(4) },
        { applyDelay: Minutes(2), wait: Minutes(6) },
    ]) {
        it(`fails an applied update when the node resubscribes with its previous version (apply delay ${Duration.format(applyDelay ?? 0)})`, async () => {
            const { site, failed, runFor } = await applyWithoutRestart({ applyDelay });
            await using _localSite = site;

            // The reboot armer forces a resubscription once it stops waiting for the restart
            await runFor(wait);

            expect(failed).length(1);
        }).timeout(10_000);
    }

    // Characterization test of the version check in the resubscription handler, on a state the test builds by hand
    it("keeps an applied update when the node resubscribes at or above the target version", async () => {
        const { site, failed, runFor, queued, resubscribed } = await applyWithoutRestart({ targetSoftwareVersion: 0 });
        await using _localSite = site;

        await runFor(Minutes(4));

        expect(resubscribed.afterDeadline).greaterThan(0);
        expect(failed).length(0);
        expect(await queued()).length(1);
    }).timeout(10_000);

    for (const { when, applyDelay, before } of [
        { when: "before its restart deadline", applyDelay: undefined, before: Seconds(0) },
        { when: "during its apply delay", applyDelay: Minutes(30), before: Minutes(4) },
    ]) {
        it(`keeps an applied update while the controller resubscribes ${when}`, async () => {
            const { site, controller, peerAddress, failed, runFor, queued } = await applyWithoutRestart({ applyDelay });
            await using _localSite = site;
            let resubscribed = 0;
            controller.peers
                .get("peer1")!
                .eventsOf(NetworkClient)
                .subscriptionStatusChanged.on(isActive => {
                    if (isActive) {
                        resubscribed++;
                    }
                });

            await runFor(before);
            controller.env.get(ClientSubscriptions).closeForPeer(peerAddress);
            await runFor(Minutes(2));

            expect(resubscribed).greaterThan(0);
            expect(failed).length(0);
            expect(await queued()).length(1);
        }).timeout(10_000);
    }

    it("keeps an applied update when the node goes away as the restart deadline passes", async () => {
        const { site, device, failed, runFor, queued } = await applyWithoutRestart();
        await using _localSite = site;

        // Still subscribed when the reboot armer closes the subscription at the deadline, then unreachable
        await runFor(Seconds(170));
        await MockTime.resolve(device.stop());
        await runFor(Minutes(2));

        expect(failed).length(0);
        expect(await queued()).length(1);
    }).timeout(10_000);

    it("keeps an update that waits for its apply when the controller resubscribes", async () => {
        const { site, controller, peerAddress, failed, runFor, queued, resubscribed } = await applyWithoutRestart({
            status: OtaUpdateStatus.WaitForApply,
        });
        await using _localSite = site;

        await runFor(Minutes(4));
        controller.env.get(ClientSubscriptions).closeForPeer(peerAddress);
        await runFor(Minutes(2));

        expect(resubscribed.afterDeadline).greaterThan(0);
        expect(failed).length(0);
        expect(await queued()).length(1);
    }).timeout(10_000);

    it("skips the announcement while a BDX session for the node is active", async () => {
        const { TestOtaProviderServer } = InstrumentedOtaProviderServer({
            requestUserConsentForUpdate: false,
            queryImage: false, // Should NOT be called — BDX active, announcement should be skipped
        });
        const { TestOtaRequestorServer } = InstrumentedOtaRequestorServer({
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

        // Each MockSite test has its own Environment, so the patched BdxProtocol is discarded with the site
        await otaProvider.act(agent => {
            const bdxProtocol = agent.get(SoftwareUpdateManager).env.get(BdxProtocol);
            const originalSessionFor = bdxProtocol.sessionFor.bind(bdxProtocol);
            bdxProtocol.sessionFor = (peer, scope) => {
                if (PeerAddress.is(peer, peerAddress)) {
                    return { peerAddress } as BdxSession | undefined; // fake active session
                }
                return originalSessionFor(peer, scope);
            };
        });

        await otaProvider.act(agent => {
            return agent
                .get(SoftwareUpdateManager)
                .addUpdateConsent(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion });
        });
        await MockTime.macrotasks;

        const queue = await otaProvider.act(agent => agent.get(SoftwareUpdateManager).queuedUpdates);
        expect(queue.map(({ status }) => status)).deep.equals(["queued"]);
    }).timeout(10_000);

    it("A running BDX transfer keeps a long download out of the stalled state", async () => {
        const { TestOtaProviderServer } = InstrumentedOtaProviderServer({
            requestUserConsentForUpdate: false,
            queryImage: false, // announcement is suppressed by the BDX guard, so the device never queries
        });
        const { TestOtaRequestorServer } = InstrumentedOtaRequestorServer({
            requestUserConsent: false,
            announceOtaProvider: false,
        });

        const { site, device, controller, otaProvider } = await initOtaSite(
            TestOtaProviderServer,
            TestOtaRequestorServer,
        );
        await using _localSite = site;

        const { vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.state.commissioning.peerAddress!;

        const bdxSession = { peerAddress, transferredBytes: 0, dataLength: 6_000_000 };
        await otaProvider.act(agent => {
            const bdxProtocol = agent.get(SoftwareUpdateManager).env.get(BdxProtocol);
            const originalSessionFor = bdxProtocol.sessionFor.bind(bdxProtocol);
            bdxProtocol.sessionFor = (peer, scope) =>
                PeerAddress.is(peer, peerAddress)
                    ? (bdxSession as unknown as BdxSession)
                    : originalSessionFor(peer, scope);
        });

        await otaProvider.act(agent =>
            agent
                .get(SoftwareUpdateManager)
                .addUpdateConsent(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion }),
        );

        // Simulate the state the download reaches: announced, image transfer running
        await otaProvider.act(agent => {
            reportStatus(
                agent.get(SoftwareUpdateManager),
                peerAddress,
                targetSoftwareVersion,
                OtaUpdateStatus.Downloading,
            );
        });

        // Well beyond the 15 minute progress timeout, with blocks arriving all the way
        for (let minutes = 0; minutes < 30; minutes += 5) {
            bdxSession.transferredBytes += 200_000;
            await MockTime.advance(Minutes(5));
        }

        const queue = await otaProvider.act(agent => agent.get(SoftwareUpdateManager).queuedUpdates);
        expect(queue).length(1);
        expect(queue[0].status).equals("in-progress");
        expect(queue[0].lastProgressStatus).equals(OtaUpdateStatus.Downloading);
        expect(queue[0].bdxTransferredBytes).equals(1_200_000);
        expect(queue[0].bdxDataLength).equals(6_000_000);

        // Blocks that arrive between two queue checks also count for the reported status.  The wall clock only, so
        // no queue check runs in between
        bdxSession.transferredBytes += 200_000;
        const polledQueue = await withWallClockAhead(Minutes(20), () =>
            otaProvider.act(agent => agent.get(SoftwareUpdateManager).queuedUpdates),
        );
        expect(polledQueue[0].status).equals("in-progress");
    }).timeout(10_000);

    it("A retried BDX transfer counts as progress although its byte counter restarts", async () => {
        const { TestOtaProviderServer } = InstrumentedOtaProviderServer({
            requestUserConsentForUpdate: false,
            queryImage: false,
        });
        const { TestOtaRequestorServer } = InstrumentedOtaRequestorServer({
            requestUserConsent: false,
            announceOtaProvider: false,
        });

        const { site, device, controller, otaProvider } = await initOtaSite(
            TestOtaProviderServer,
            TestOtaRequestorServer,
        );
        await using _localSite = site;

        const { vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.state.commissioning.peerAddress!;

        const bdxSession = { peerAddress, transferredBytes: 900_000, dataLength: 6_000_000 };
        await otaProvider.act(agent => {
            const bdxProtocol = agent.get(SoftwareUpdateManager).env.get(BdxProtocol);
            const originalSessionFor = bdxProtocol.sessionFor.bind(bdxProtocol);
            bdxProtocol.sessionFor = (peer, scope) =>
                PeerAddress.is(peer, peerAddress)
                    ? (bdxSession as unknown as BdxSession)
                    : originalSessionFor(peer, scope);
        });

        await otaProvider.act(agent =>
            agent
                .get(SoftwareUpdateManager)
                .addUpdateConsent(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion }),
        );
        await otaProvider.act(agent => {
            reportStatus(
                agent.get(SoftwareUpdateManager),
                peerAddress,
                targetSoftwareVersion,
                OtaUpdateStatus.Downloading,
            );
        });

        // The first attempt gets far enough for its counter to be recorded
        await MockTime.advance(Minutes(5));

        // It then fails and the requestor retries on a fresh session, which starts over. This stand-in session reports
        // no status change to the manager.
        bdxSession.transferredBytes = 0;
        for (let minutes = 0; minutes < 25; minutes += 5) {
            bdxSession.transferredBytes += 20_000;
            await MockTime.advance(Minutes(5));
        }

        const queue = await otaProvider.act(agent => agent.get(SoftwareUpdateManager).queuedUpdates);
        expect(queue).length(1);
        expect(queue[0].status).equals("in-progress");
        expect(queue[0].lastProgressStatus).equals(OtaUpdateStatus.Downloading);
    }).timeout(10_000);

    it("A running BDX transfer keeps its in-progress entry alive, including a session opened for a retry", async () => {
        const data = { expectedOtaImage: Bytes.fromHex("") };
        const { applyUpdatePromise, TestOtaRequestorServer } = InstrumentedOtaRequestorServer(
            { requestUserConsent: false },
            data,
        );
        const { TestOtaProviderServer } = InstrumentedOtaProviderServer({ requestUserConsentForUpdate: false });

        const { site, device, controller, otaProvider } = await initOtaSite(
            TestOtaProviderServer,
            TestOtaRequestorServer,
        );
        await using _localSite = site;

        const { otaImage, vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
        data.expectedOtaImage = Bytes.of(otaImage.image);

        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.state.commissioning.peerAddress!;

        const attempts = await otaProvider.act(agent => agent.get(SoftwareUpdateManager).internal.attempts);
        const offered = () => [...attempts.of(peerAddress)].find(({ token }) => token !== undefined);

        // Read the timestamp at the first block, step the wall clock and read it again a few blocks later: it moved
        // only if the blocks in between refreshed it.  This listener runs before the provider's for each block.
        let timestampAtFirstBlock: Timestamp | undefined;
        let wallClockStep = 0;
        let blocks = 0;
        let timestampWhileTransferring: Timestamp | undefined;
        await otaProvider.act(agent => {
            agent
                .get(SoftwareUpdateManager)
                .env.get(BdxProtocol)
                .sessionStarted.on((bdxSession: BdxSession) =>
                    bdxSession.progressInfo.on(() => {
                        const attempt = offered();
                        if (attempt === undefined) {
                            return;
                        }
                        blocks++;
                        if (blocks === 1) {
                            timestampAtFirstBlock = attempt.lastActivity;
                            wallClockStep = Minutes(1);
                            MockTime.stepWallClock(wallClockStep);
                        } else if (blocks === 3) {
                            timestampWhileTransferring = attempt.lastActivity;
                        }
                    }),
                );
        });

        await otaProvider.act(agent =>
            agent
                .get(SoftwareUpdateManager)
                .forceUpdate(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion }),
        );

        try {
            await MockTime.resolve(applyUpdatePromise);
        } finally {
            MockTime.stepWallClock(-wallClockStep);
        }

        expect(blocks).greaterThan(3);
        expect(timestampWhileTransferring).greaterThan(timestampAtFirstBlock!);

        // A failed attempt is retried on a fresh session within the same query cycle, so the provider must still be
        // listening after the first session of that cycle ended
        const retrySession = {
            peerAddress,
            progressInfo: Observable<[bytesTransferred: number, totalBytesLength: number | undefined]>(),
            progressFinished: Observable<[totalBytesTransferred: number]>(),
            progressCancelled: Observable(),
            closed: Observable(),
        };
        await otaProvider.act(agent => {
            const server = agent.get(OtaSoftwareUpdateProviderServer);
            agent
                .get(SoftwareUpdateManager)
                .env.get(BdxProtocol)
                .sessionStarted.emit(retrySession as unknown as BdxSession, server.updateStorage.scope);
        });

        const retryAttempt = offered();
        expect(retryAttempt?.status).equals(OtaUpdateStatus.Downloading);

        const timestampBeforeBlock = retryAttempt!.lastActivity;
        await MockTime.advance(Seconds(1));
        retrySession.progressInfo.emit(1024, 50_000);
        expect(retryAttempt!.lastActivity).greaterThan(timestampBeforeBlock);
    }).timeout(10_000);

    // Guards against treating the mere existence of a BDX session as progress; a full revert of the activity check
    // also passes, since the entry then expires on the same tick.
    it("An open BDX session that never transfers a block does not count as progress", async () => {
        const { TestOtaProviderServer } = InstrumentedOtaProviderServer({
            requestUserConsentForUpdate: false,
            queryImage: false,
        });
        const { TestOtaRequestorServer } = InstrumentedOtaRequestorServer({
            requestUserConsent: false,
            announceOtaProvider: false,
        });

        const { site, device, controller, otaProvider } = await initOtaSite(
            TestOtaProviderServer,
            TestOtaRequestorServer,
        );
        await using _localSite = site;

        const { vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.state.commissioning.peerAddress!;

        // A session whose transfer flow is not negotiated yet reports 0 transferred bytes
        const bdxSession = { peerAddress, transferredBytes: 0, dataLength: undefined };
        await otaProvider.act(agent => {
            const bdxProtocol = agent.get(SoftwareUpdateManager).env.get(BdxProtocol);
            const originalSessionFor = bdxProtocol.sessionFor.bind(bdxProtocol);
            bdxProtocol.sessionFor = (peer, scope) =>
                PeerAddress.is(peer, peerAddress)
                    ? (bdxSession as unknown as BdxSession)
                    : originalSessionFor(peer, scope);
        });

        await otaProvider.act(agent =>
            agent
                .get(SoftwareUpdateManager)
                .addUpdateConsent(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion }),
        );

        await otaProvider.act(agent => {
            reportStatus(
                agent.get(SoftwareUpdateManager),
                peerAddress,
                targetSoftwareVersion,
                OtaUpdateStatus.Downloading,
            );
        });

        // Just past the first timeout window — an open session must not have bought the entry another one
        await MockTime.advance(Minutes(22));

        const queue = await otaProvider.act(agent => agent.get(SoftwareUpdateManager).queuedUpdates);
        expect(queue).length(1);
        expect(queue[0].status).equals("queued");
        expect(queue[0].lastProgressStatus).equals(OtaUpdateStatus.Unknown);
    }).timeout(10_000);

    // Characterization test: passes against the unmodified baseline as well. It guards the reset path itself, not
    // the BDX activity check.
    it("A BDX transfer that stops moving data is reset for retry", async () => {
        const { TestOtaProviderServer } = InstrumentedOtaProviderServer({
            requestUserConsentForUpdate: false,
            queryImage: false,
        });
        const { TestOtaRequestorServer } = InstrumentedOtaRequestorServer({
            requestUserConsent: false,
            announceOtaProvider: false,
        });

        const { site, device, controller, otaProvider } = await initOtaSite(
            TestOtaProviderServer,
            TestOtaRequestorServer,
        );
        await using _localSite = site;

        const { vendorId, productId, targetSoftwareVersion } = await addTestOtaImage(device, controller);
        const peer1 = controller.peers.get("peer1")!;
        const peerAddress = peer1.state.commissioning.peerAddress!;

        const bdxSession = { peerAddress, transferredBytes: 512_000, dataLength: 6_000_000 };
        await otaProvider.act(agent => {
            const bdxProtocol = agent.get(SoftwareUpdateManager).env.get(BdxProtocol);
            const originalSessionFor = bdxProtocol.sessionFor.bind(bdxProtocol);
            bdxProtocol.sessionFor = (peer, scope) =>
                PeerAddress.is(peer, peerAddress)
                    ? (bdxSession as unknown as BdxSession)
                    : originalSessionFor(peer, scope);
        });

        await otaProvider.act(agent =>
            agent
                .get(SoftwareUpdateManager)
                .addUpdateConsent(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion }),
        );

        await otaProvider.act(agent => {
            reportStatus(
                agent.get(SoftwareUpdateManager),
                peerAddress,
                targetSoftwareVersion,
                OtaUpdateStatus.Downloading,
            );
        });

        // The session stays open but no block arrives anymore
        await MockTime.advance(Minutes(30));

        const queue = await otaProvider.act(agent => agent.get(SoftwareUpdateManager).queuedUpdates);
        expect(queue).length(1);
        expect(queue[0].status).equals("queued");
        expect(queue[0].lastProgressStatus).equals(OtaUpdateStatus.Unknown);
    }).timeout(10_000);

    it("queryImage Case A: stale in-progress entry with no BDX session → cleared, fresh queryImage proceeds", async () => {
        // Case A: the node has an attempt with an offer but no active BDX session.
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

        // Start an attempt with a known "aa" token and no active BDX session; its recent activity keeps it from
        // ending as stale before queryImage runs.
        // "Stale" in Case A terms means: entry exists but no matching BDX session.
        await otaProvider.act(agent => {
            const manager = agent.get(SoftwareUpdateManager);
            const attempt = beginAttempt(manager, peerAddress);
            manager.offerUpdate(attempt, Bytes.fromHex("aa".repeat(32)), 1);
            manager.reportAttemptStatus(attempt, OtaUpdateStatus.Downloading);
        });

        // Verify the stale entry is there
        expect(
            await otaProvider.act(agent =>
                [...agent.get(SoftwareUpdateManager).internal.attempts.of(peerAddress)].flatMap(({ token }) =>
                    token === undefined ? [] : [Bytes.toHex(token)],
                ),
            ),
        ).length(1);

        // No need to patch BdxProtocol.sessionFor — since there's no active OTA running, the real
        // BdxProtocol.sessionFor will naturally return undefined for this peer, triggering Case A:
        // stale in-progress entry with no active BDX session → cleared and proceed fresh.

        // Set up idlePromise BEFORE forceUpdate: resolves when device returns to Idle.
        // The device will call queryImage, get NotAvailable, and go to Idle immediately.
        // We wait for Idle before site teardown to ensure the updateQueryTimer is started before
        // node.close() stops it.
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
                .forceUpdate(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion });
        });

        // Wait for queryImage to complete (provider ran Case A logic, returned NotAvailable)
        await MockTime.resolve(queryImagePromise);

        // The stale "aa" token entry should NOT be there — it was cleared by Case A logic
        const tokensAfter = await otaProvider.act(agent =>
            [...agent.get(SoftwareUpdateManager).internal.attempts.of(peerAddress)].flatMap(({ token }) =>
                token === undefined ? [] : [Bytes.toHex(token)],
            ),
        );
        expect(tokensAfter).not.include("aa".repeat(32));

        // A fresh attempt with a new token confirms that queryImage proceeded past the Case A check
        expect(tokensAfter).length(1);

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
        let interruptedAttempt: OtaUpdateAttempt | undefined;

        class CaseBTestProviderServer extends OtaSoftwareUpdateProviderServer {
            override async queryImage(
                request: OtaSoftwareUpdateProvider.QueryImageRequest,
            ): Promise<OtaSoftwareUpdateProvider.QueryImageResponse> {
                // The interrupted transfer moved blocks until the device rebooted, so its attempt is not stale
                interruptedAttempt?.touch();
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

        // Start an attempt with a "cc" token (simulates a prior download that
        // was interrupted by a device reboot).
        await otaProvider.act(agent => {
            const manager = agent.get(SoftwareUpdateManager);
            const attempt = beginAttempt(manager, peerAddress);
            manager.offerUpdate(attempt, Bytes.fromHex("cc".repeat(32)), 1);
            // The node got the offer, as only an answered offer starts a BDX transfer
            manager.offerAnswered(attempt);
            manager.reportAttemptStatus(attempt, OtaUpdateStatus.Downloading);
            interruptedAttempt = attempt;
        });

        // Verify the in-progress entry is there before queryImage
        expect(
            await otaProvider.act(agent =>
                [...agent.get(SoftwareUpdateManager).internal.attempts.of(peerAddress)].flatMap(({ token }) =>
                    token === undefined ? [] : [Bytes.toHex(token)],
                ),
            ),
        ).length(1);

        // Patch BdxProtocol.sessionFor to return a fake BDX session that appears to be from an
        // OLDER session. The real queryImage session will have a newer activeTimestamp, and a
        // different sessionId → triggers Case B.
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
                .forceUpdate(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion });
        });

        // Wait for queryImage to complete (provider ran Case B logic, returned NotAvailable to device)
        const queryImageResult = await MockTime.resolve(queryImageResultPromise);

        // Case B should NOT return Busy — it falls through to normal processing → UpdateAvailable
        expect(queryImageResult.status).equals(OtaSoftwareUpdateProvider.Status.UpdateAvailable);

        // The "cc" token entry should have been removed by Case B logic
        expect(
            await otaProvider.act(agent =>
                [...agent.get(SoftwareUpdateManager).internal.attempts.of(peerAddress)].flatMap(({ token }) =>
                    token === undefined ? [] : [Bytes.toHex(token)],
                ),
            ),
        ).not.include("cc".repeat(32));

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
            const manager = agent.get(SoftwareUpdateManager);
            const attempt = beginAttempt(manager, peerAddress);
            manager.offerUpdate(attempt, Bytes.fromHex("bb".repeat(32)), 1);
            manager.reportAttemptStatus(attempt, OtaUpdateStatus.Downloading);
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
                            activeTimestamp: (MockTime.nowUs + 10000) as Timestamp, // newer than any live session → Case C
                        },
                    } as any;
                }
                return originalSessionFor(peer, scope);
            };
        });

        // The in-progress entry should still be present (not cleared, since no queryImage was called)
        expect(
            await otaProvider.act(agent =>
                [...agent.get(SoftwareUpdateManager).internal.attempts.of(peerAddress)].flatMap(({ token }) =>
                    token === undefined ? [] : [Bytes.toHex(token)],
                ),
            ),
        ).deep.equals(["bb".repeat(32)]);
        const { admitted, statuses } = await otaProvider.act(async agent => {
            const manager = agent.get(SoftwareUpdateManager);
            return {
                admitted: await manager.admitQuery(peerAddress, sessionOf(manager, peerAddress), 0),
                statuses: manager.internal.attempts
                    .offered(peerAddress)
                    .map(({ status, ended }) => ({ status, ended })),
            };
        });
        expect({ admitted, statuses }).deep.equals({
            admitted: false,
            statuses: [{ status: OtaUpdateStatus.Downloading, ended: false }],
        });
    }).timeout(10_000);

    it("suppresses the startUp on the session of a query admitted after a restart during a transfer", async () => {
        // When admitQuery takes a query after a restart, and SessionManager is patched to return that query's
        // session ID for the peer, the next startUp event should be suppressed.
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
                .addUpdateConsent(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion });
        });

        const updateFailedEvents: PeerAddress[] = [];
        await otaProvider.act(agent => {
            agent.get(SoftwareUpdateManager).events.updateFailed.on(peer => {
                updateFailedEvents.push(peer);
            });
        });

        // Flush any deferred startUp deliveries that addUpdateConsent's announceOtaProvider flow may
        // have queued — they would otherwise consume the suppression entry before the real restart.
        await MockTime.macrotasks;

        // Register the suppression before the device restarts, with the update applying, so a startUp that is not
        // suppressed fails it
        const suppressedSessionId = await otaProvider.act(async agent => {
            const manager = agent.get(SoftwareUpdateManager);
            const sessionId = await admitQueryAfterRestart(manager, peerAddress, targetSoftwareVersion);
            reportStatus(manager, peerAddress, targetSoftwareVersion, OtaUpdateStatus.Applying);
            return sessionId;
        });
        expect(
            await otaProvider.act(agent =>
                agent.get(SoftwareUpdateManager).internal.pendingStartUpSuppress.get(peerAddress),
            ),
        ).equals(suppressedSessionId);

        // Patch SessionManager.maybeSessionFor to return the suppressed session ID for peerAddress.
        // This patch must be in place BEFORE device.start() so that when startUp fires (during start),
        // the session check in #onSoftwareVersionChanged sees that ID → suppress!
        await otaProvider.act(agent => {
            const su = agent.get(SoftwareUpdateManager);
            const sessionManager = su.env.get(SessionManager);
            const originalMaybeSessionFor = sessionManager.maybeSessionFor.bind(sessionManager);
            sessionManager.maybeSessionFor = (addr: any) => {
                if (PeerAddress.is(addr, peerAddress)) {
                    return { id: suppressedSessionId } as any;
                }
                return originalMaybeSessionFor(addr);
            };
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

    it("does not suppress a startUp on another session than the one of a query admitted after a restart", async () => {
        // When the suppression names another session ID than the one maybeSessionFor returns,
        // the startUp event should NOT be suppressed.
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
                .addUpdateConsent(peerAddress, { vendorId: VendorId(vendorId), productId, targetSoftwareVersion });
        });

        const updateFailedEvents: PeerAddress[] = [];
        await otaProvider.act(agent => {
            agent.get(SoftwareUpdateManager).events.updateFailed.on(peer => {
                updateFailedEvents.push(peer);
            });
        });

        // Flush any deferred startUp deliveries that addUpdateConsent's announceOtaProvider flow may
        // have queued — they would otherwise consume the suppression entry and emit a spurious
        // updateFailed before the real restart.
        await MockTime.macrotasks;

        // Suppress on the query's session, then set to Applying state
        const suppressedSessionId = await otaProvider.act(async agent => {
            const manager = agent.get(SoftwareUpdateManager);
            const sessionId = await admitQueryAfterRestart(manager, peerAddress, targetSoftwareVersion);
            reportStatus(manager, peerAddress, targetSoftwareVersion, OtaUpdateStatus.Applying);
            return sessionId;
        });

        // Patch SessionManager.maybeSessionFor to return another session ID
        const OTHER_SESSION_ID = suppressedSessionId + 1;
        await otaProvider.act(agent => {
            const su = agent.get(SoftwareUpdateManager);
            const sessionManager = su.env.get(SessionManager);
            const originalMaybeSessionFor = sessionManager.maybeSessionFor.bind(sessionManager);
            sessionManager.maybeSessionFor = (addr: any) => {
                if (PeerAddress.is(addr, peerAddress)) {
                    return { id: OTHER_SESSION_ID } as any;
                }
                return originalMaybeSessionFor(addr);
            };
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

        // The session IDs do not match → suppression NOT applied → updateFailed should fire
        expect(updateFailedEvents).length(1);

        // The suppression entry should be consumed (even though it didn't suppress)
        const hasSuppressedAfter = await otaProvider.act(agent => {
            return agent.get(SoftwareUpdateManager).internal.pendingStartUpSuppress.has(peerAddress);
        });
        expect(hasSuppressedAfter).equals(false);
    }).timeout(10_000);

    it("Cleanup purges stored test-mode OTA when allowTestOtaImages is disabled, preserves prod/local", async () => {
        // Device intentionally has no OTA requestor, so it is not an update target: the periodic check offers
        // nothing and #cleanupObsoleteUpdates is exercised in isolation.
        const site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            controller: {
                type: ServerNode.RootEndpoint,
                parts: [{ id: "ota-provider", type: OtaProviderEndpoint }],
            },
        });
        await using _localSite = site;

        const otaProvider = controller.parts.get("ota-provider")!;
        await otaProvider.act(agent => {
            agent.get(SoftwareUpdateManager).state.allowTestOtaImages = true;
        });

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

        // Disable test OTA usage: the check must purge the stored test-mode file.
        await otaProvider.act(agent => {
            agent.get(SoftwareUpdateManager).state.allowTestOtaImages = false;
        });

        // The periodic timer normally triggers this; invoke it directly so cleanup completes deterministically.
        await otaProvider.act(agent => agent.get(SoftwareUpdateManager).checkForUpdates());

        const after = await otaProvider.act(agent => agent.get(SoftwareUpdateManager).internal.otaService.find({}));
        expect(after.filter(u => u.mode === "test")).length(0);
        expect(after.filter(u => u.mode === "prod")).length(1);
        expect(after.filter(u => u.mode === "local")).length(1);
    }).timeout(15_000);

    describe("with test-net DCL images disabled", () => {
        async function initSiteWithoutTestImages({
            grantUserConsent,
            rewriteQueryImageRequest,
            rewriteApplyUpdateRequest,
            beforeApplyUpdateRequest,
            declineUpdates,
            requireConsent,
            localConfigDisabled,
            delegateConsent,
            lateConsent,
            removeConsentDuringQuery,
            denyConsent,
            answerQueryWith,
            whileConsentAsked,
        }: {
            grantUserConsent?: boolean;
            rewriteQueryImageRequest?: (
                request: OtaSoftwareUpdateProvider.QueryImageRequest,
            ) => OtaSoftwareUpdateProvider.QueryImageRequest;
            rewriteApplyUpdateRequest?: (
                request: OtaSoftwareUpdateProvider.ApplyUpdateRequest,
            ) => OtaSoftwareUpdateProvider.ApplyUpdateRequest;
            beforeApplyUpdateRequest?: (agent: Agent) => MaybePromise<void>;
            /** Overrides `checkUpdateAvailable()` to find nothing. */
            declineUpdates?: boolean;
            /** Overrides `checkUpdateAvailable()` to mark every offer as needing consent. */
            requireConsent?: boolean;
            localConfigDisabled?: boolean;
            /** Sets `delegateConsentToRequestor`. */
            delegateConsent?: boolean;
            /**
             * With `requireConsent`, the consent is granted after `removeConsent()` removed the manager's consent,
             * after it was recorded again with `addUpdateConsent()`, or after the manager's consent moved to the next
             * version.
             */
            lateConsent?: "after-removal" | "recorded-again" | "moved-to-next-version" | "after-attempt-ended";
            /** Overrides `checkUpdateAvailable()` to mark every offer as needing consent, which is then denied. */
            denyConsent?: boolean;
            /**
             * Overrides `checkUpdateAvailable()` to remove the consent before it answers with the offer: all consents
             * of the node, or the consent for the version given.
             */
            removeConsentDuringQuery?: true | number;
            /** Overrides `checkUpdateAvailable()` to answer with what this returns for the default answer. */
            answerQueryWith?: (
                manager: SoftwareUpdateManager,
                peerAddress: PeerAddress,
                details: OtaUpdateAvailableDetails | undefined,
            ) => MaybePromise<OtaUpdateAvailableDetails | undefined>;
            /** With `requireConsent`, runs while the consent is asked for, before it is granted. */
            whileConsentAsked?: (manager: SoftwareUpdateManager, peerAddress: PeerAddress) => MaybePromise<void>;
        } = {}) {
            const data = { expectedOtaImage: Bytes.fromHex(""), expectedSoftwareVersion: 1, grantUserConsent };
            const requestor = InstrumentedOtaRequestorServer({ requestUserConsent: grantUserConsent ?? false }, data);
            const provider = InstrumentedOtaProviderServer(
                { requestUserConsentForUpdate: false },
                { rewriteQueryImageRequest, rewriteApplyUpdateRequest, beforeApplyUpdateRequest },
            );
            class DecliningOtaProviderServer extends provider.TestOtaProviderServer {
                protected override checkUpdateAvailable() {
                    return undefined;
                }
            }
            class ConsentRequiringOtaProviderServer extends provider.TestOtaProviderServer {
                protected override async checkUpdateAvailable(
                    request: OtaSoftwareUpdateProvider.QueryImageRequest,
                    peerAddress: PeerAddress,
                ) {
                    const details = await super.checkUpdateAvailable(request, peerAddress);
                    return details && { ...details, consentRequired: true };
                }
            }
            class LateConsentOtaProviderServer extends ConsentRequiringOtaProviderServer {
                protected override async requestUserConsentForUpdate(
                    _request: OtaSoftwareUpdateProvider.QueryImageRequest,
                    { newSoftwareVersion }: { newSoftwareVersion: number },
                    peerAddress: PeerAddress,
                ) {
                    const manager = this.agent.get(SoftwareUpdateManager);
                    await whileConsentAsked?.(manager, peerAddress);
                    if (lateConsent === "after-removal") {
                        await manager.removeConsent(peerAddress);
                    } else if (lateConsent === "after-attempt-ended") {
                        // As when the controller goes offline while the consent is asked for
                        for (const attempt of manager.internal.attempts.of(peerAddress)) {
                            attempt.end();
                        }
                    } else if (lateConsent !== undefined) {
                        await manager.addUpdateConsent(peerAddress, {
                            vendorId: VendorId(0xfff1),
                            productId: 0x8000,
                            targetSoftwareVersion:
                                lateConsent === "moved-to-next-version" ? newSoftwareVersion + 1 : newSoftwareVersion,
                        });
                    }
                    return { consentState: OtaSoftwareUpdateConsentState.Granted };
                }
            }
            class DenyingOtaProviderServer extends ConsentRequiringOtaProviderServer {
                protected override requestUserConsentForUpdate() {
                    return { consentState: OtaSoftwareUpdateConsentState.Denied };
                }
            }
            class RemovingOtaProviderServer extends provider.TestOtaProviderServer {
                protected override async checkUpdateAvailable(
                    request: OtaSoftwareUpdateProvider.QueryImageRequest,
                    peerAddress: PeerAddress,
                ) {
                    const details = await super.checkUpdateAvailable(request, peerAddress);
                    await this.agent
                        .get(SoftwareUpdateManager)
                        .removeConsent(
                            peerAddress,
                            removeConsentDuringQuery === true ? undefined : removeConsentDuringQuery,
                        );
                    return details;
                }
            }
            class AnsweringOtaProviderServer extends provider.TestOtaProviderServer {
                protected override async checkUpdateAvailable(
                    request: OtaSoftwareUpdateProvider.QueryImageRequest,
                    peerAddress: PeerAddress,
                ) {
                    const details = await super.checkUpdateAvailable(request, peerAddress);
                    return answerQueryWith?.(this.agent.get(SoftwareUpdateManager), peerAddress, details);
                }
            }
            const ota = await initOtaSite(
                declineUpdates
                    ? DecliningOtaProviderServer
                    : denyConsent
                      ? DenyingOtaProviderServer
                      : requireConsent
                        ? lateConsent !== undefined || whileConsentAsked !== undefined
                            ? LateConsentOtaProviderServer
                            : ConsentRequiringOtaProviderServer
                        : removeConsentDuringQuery
                          ? RemovingOtaProviderServer
                          : answerQueryWith !== undefined
                            ? AnsweringOtaProviderServer
                            : provider.TestOtaProviderServer,
                requestor.TestOtaRequestorServer,
                { localConfigDisabled },
            );
            await ota.otaProvider.act(agent => {
                const { state } = agent.get(SoftwareUpdateManager);
                state.allowTestOtaImages = false;
                state.delegateConsentToRequestor = delegateConsent ?? false;
            });
            const peerAddress = ota.controller.peers.get("peer1")!.state.commissioning.peerAddress!;
            const { vendorId, productId, softwareVersion } = ota.device.state.basicInformation;

            /**
             * Stores an image the device can apply from its current version; `seed` tells images of one version apart.
             */
            async function storeImage(
                targetSoftwareVersion: number,
                mode: OtaStorageMode,
                seed = targetSoftwareVersion,
            ) {
                const otaImage = await createTestOtaImage(new StandardCrypto(), {
                    vendorId,
                    productId,
                    softwareVersion: targetSoftwareVersion,
                    maxApplicableSoftwareVersion: softwareVersion,
                    payload: generateTestPayload(50 * 1024, seed),
                });
                await storeOtaImage(ota.controller, otaImage, mode);
                return otaImage;
            }

            /** Sets the image the device must receive when it applies an update. */
            function expectImage(otaImage: TestOtaImageResult) {
                data.expectedOtaImage = Bytes.of(otaImage.image);
                data.expectedSoftwareVersion = otaImage.updateInfo.softwareVersion;
            }

            /** Lets the device download and apply the image it is offered, and checks what the provider answered. */
            async function expectApplied(otaImage: TestOtaImageResult) {
                expectImage(otaImage);
                await MockTime.resolve(requestor.applyUpdatePromise);
                expect(
                    provider.queryImageResponses.map(({ status, softwareVersion }) => ({ status, softwareVersion })),
                ).deep.equals([
                    {
                        status: OtaSoftwareUpdateProvider.Status.UpdateAvailable,
                        softwareVersion: otaImage.updateInfo.softwareVersion,
                    },
                ]);
            }

            async function queryUpdates() {
                return await ota.otaProvider.act(async agent => {
                    const manager = agent.get(SoftwareUpdateManager);
                    const offered = new Array<{ softwareVersion: number; source?: OtaUpdateSource }>();
                    manager.events.updateAvailable.on((_peer, { softwareVersion, source }) => {
                        offered.push({ softwareVersion, source });
                    });
                    await manager.queryUpdates({ includeStoredUpdates: true });
                    return offered;
                });
            }

            /**
             * Records the requestor endpoints the update queue announces to.  `replace` may answer an attempt (counted
             * from 1) to `endpoint` instead of the node; any other attempt reaches the node.
             */
            async function interceptAnnouncements(
                replace: (
                    attempt: number,
                    abort?: AbortSignal,
                    endpoint?: Endpoint,
                ) => Promise<void> | undefined = () => undefined,
            ) {
                const attempts = new Array<Endpoint>();
                await ota.otaProvider.act(agent => {
                    const announcements = agent.get(SoftwareUpdateManager).internal.announcements!;
                    const announceOtaProvider = announcements.announceOtaProvider.bind(announcements);
                    announcements.announceOtaProvider = async (endpoint, reason, abort) => {
                        attempts.push(endpoint);
                        return (
                            replace(attempts.length, abort, endpoint) ?? announceOtaProvider(endpoint, reason, abort)
                        );
                    };
                });
                return attempts;
            }

            /**
             * Commissions a second device with an OTA requestor into the controller and subscribes to it.  Returns the
             * peer address of its node, the requestor endpoint the manager announces its updates to, a function that
             * adds a consent for it, and a function that closes the device, so it answers nothing any more.
             */
            async function addSecondDevice() {
                const second = await ota.site.addDevice({
                    parts: [
                        {
                            id: "ota-requestor",
                            type: OtaRequestorEndpoint.with(InstrumentedOtaRequestorServer({}).TestOtaRequestorServer),
                        },
                    ],
                });
                const { passcode, discriminator } = second.state.commissioning;
                const node = await MockTime.resolve(
                    ota.controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }),
                    { macrotasks: true },
                );
                await subscribedPeer(ota.controller, node.id);
                const secondAddress = PeerAddress(node.peerAddress!);
                return {
                    peerAddress: secondAddress,
                    requestor: node.endpoints.for(second.parts.get("ota-requestor")!.number),
                    consentTo: (targetSoftwareVersion: number) =>
                        ota.otaProvider.act(agent =>
                            agent.get(SoftwareUpdateManager).addUpdateConsent(secondAddress, {
                                vendorId: VendorId(vendorId),
                                productId,
                                targetSoftwareVersion,
                            }),
                        ),
                    close: () => MockTime.resolve(second.close()),
                };
            }

            /** What the manager offers the device for a QueryImage without a consent. */
            function offerToRequestor({ requestorCanConsent }: { requestorCanConsent: boolean }) {
                return ota.otaProvider.act(agent =>
                    agent.get(SoftwareUpdateManager).updateExistsFor(peerAddress, {
                        vendorId,
                        productId,
                        softwareVersion,
                        protocolsSupported: [OtaSoftwareUpdateProvider.DownloadProtocol.BdxSynchronous],
                        requestorCanConsent,
                    }),
                );
            }

            function queueSnapshot() {
                return ota.otaProvider.act(agent =>
                    agent
                        .get(SoftwareUpdateManager)
                        .queuedUpdates.map(({ targetSoftwareVersion, status, lastProgressStatus }) => ({
                            targetSoftwareVersion,
                            status,
                            lastProgressStatus,
                        })),
                );
            }

            function forceUpdate(targetSoftwareVersion: number) {
                return ota.otaProvider.act(agent =>
                    agent.get(SoftwareUpdateManager).forceUpdate(peerAddress, {
                        vendorId: VendorId(vendorId),
                        productId,
                        targetSoftwareVersion,
                    }),
                );
            }

            return {
                ...ota,
                requestor,
                provider,
                peerAddress,
                storeImage,
                expectImage,
                expectApplied,
                queryUpdates,
                interceptAnnouncements,
                offerToRequestor,
                queueSnapshot,
                forceUpdate,
                addSecondDevice,
            };
        }

        it("offers neither a stored local nor a stored test-net image", async () => {
            const { site, otaProvider, provider, storeImage, queryUpdates, offerToRequestor, forceUpdate } =
                await initSiteWithoutTestImages({ delegateConsent: true });
            await using _localSite = site;

            await storeImage(1, "local");
            await storeImage(2, "test");

            expect(await queryUpdates()).deep.equals([]);
            expect(await offerToRequestor({ requestorCanConsent: true })).undefined;

            const { promise: failed, resolver: failedResolver } = createPromise<void>();
            await otaProvider.act(agent => {
                agent.get(SoftwareUpdateManager).events.updateFailed.once(() => failedResolver());
            });
            await forceUpdate(1);
            await MockTime.resolve(failed);
            expect(provider.queryImageResponses.map(({ status }) => status)).deep.equals([
                OtaSoftwareUpdateProvider.Status.NotAvailable,
            ]);
        }).timeout(10_000);

        it("offers a stored production image, not a newer stored local image", async () => {
            const { site, storeImage, expectApplied, queryUpdates, forceUpdate } = await initSiteWithoutTestImages();
            await using _localSite = site;

            const prod = await storeImage(1, "prod");
            await storeImage(2, "local");

            expect(await queryUpdates()).deep.equals([{ softwareVersion: 1, source: "dcl-prod" }]);

            await forceUpdate(1);
            await expectApplied(prod);
        }).timeout(10_000);

        it("offers and transfers a stored local image once test images are enabled", async () => {
            const { site, otaProvider, storeImage, expectApplied, queryUpdates, forceUpdate } =
                await initSiteWithoutTestImages();
            await using _localSite = site;
            await otaProvider.act(agent => {
                agent.get(SoftwareUpdateManager).state.allowTestOtaImages = true;
            });

            await storeImage(1, "prod");
            const local = await storeImage(2, "local");

            expect(await queryUpdates()).deep.equals([{ softwareVersion: 2, source: "local" }]);

            await forceUpdate(2);
            await expectApplied(local);
        }).timeout(10_000);

        it("offers a stored local image over an older version on the production DCL once test images are enabled", async () => {
            const { site, device, otaProvider, storeImage, expectApplied, queryUpdates, forceUpdate } =
                await initSiteWithoutTestImages();
            await using _localSite = site;
            await otaProvider.act(agent => {
                agent.get(SoftwareUpdateManager).state.allowTestOtaImages = true;
            });

            const { vendorId, productId } = device.state.basicInformation;
            const versionsPath = `on\\.dcl\\.csa-iot\\.org/dcl/model/versions/${vendorId}/${productId}`;
            fetchMock.addResponse(new RegExp(`${versionsPath}$`), {
                modelVersions: { vid: vendorId, pid: productId, softwareVersions: [1], schemaVersion: 0 },
            });
            fetchMock.addResponse(new RegExp(`${versionsPath}/1$`), {
                modelVersion: {
                    vid: vendorId,
                    pid: productId,
                    softwareVersion: 1,
                    softwareVersionString: "v1.0.0",
                    cdVersionNumber: 1,
                    creator: "cosmos1test",
                    firmwareInformation: "",
                    softwareVersionValid: true,
                    otaUrl: "https://example.com/ota-v1.bin",
                    otaFileSize: "1024",
                    otaChecksum: "checksum123",
                    otaChecksumType: 1,
                    minApplicableSoftwareVersion: 0,
                    maxApplicableSoftwareVersion: 0,
                    releaseNotesUrl: "",
                    specificationVersion: 0,
                    schemaVersion: 0,
                },
            });

            const local = await storeImage(2, "local");

            // Characterization: the update check alone prefers the local image here
            expect(await queryUpdates()).deep.equals([{ softwareVersion: 2, source: "local" }]);
            expect(fetchMock.getCallLog().map(({ url }) => url)).not.include("https://example.com/ota-v1.bin");

            await forceUpdate(2);
            await expectApplied(local);
        }).timeout(10_000);

        it("offers no image at the version the device already runs", async () => {
            const { site, device, otaProvider, peerAddress, storeImage, queryUpdates } =
                await initSiteWithoutTestImages();
            await using _localSite = site;

            const { softwareVersion, vendorId, productId } = device.state.basicInformation;
            await storeImage(softwareVersion, "prod");

            expect(await queryUpdates()).deep.equals([]);
            const offered = await otaProvider.act(agent =>
                agent.get(SoftwareUpdateManager).updateExistsFor(peerAddress, {
                    vendorId: VendorId(vendorId),
                    productId,
                    softwareVersion,
                    protocolsSupported: [OtaSoftwareUpdateProvider.DownloadProtocol.BdxSynchronous],
                    requestorCanConsent: true,
                }),
            );
            expect(offered).undefined;
        }).timeout(10_000);

        it("offers a stored test-net image over a stored production image of the same version once enabled", async () => {
            const { site, otaProvider, storeImage, expectApplied, queryUpdates, forceUpdate } =
                await initSiteWithoutTestImages();
            await using _localSite = site;
            await otaProvider.act(agent => {
                agent.get(SoftwareUpdateManager).state.allowTestOtaImages = true;
            });

            await storeImage(1, "prod", 0x10);
            const test = await storeImage(1, "test", 0x30);

            expect(await queryUpdates()).deep.equals([{ softwareVersion: 1, source: "dcl-test" }]);

            await forceUpdate(1);
            await expectApplied(test);
        }).timeout(10_000);

        it("offers a stored local image over a stored production image of the same version once test images are enabled", async () => {
            const { site, otaProvider, storeImage, expectApplied, queryUpdates, forceUpdate } =
                await initSiteWithoutTestImages();
            await using _localSite = site;
            await otaProvider.act(agent => {
                agent.get(SoftwareUpdateManager).state.allowTestOtaImages = true;
            });

            await storeImage(1, "prod", 0x10);
            const local = await storeImage(1, "local", 0x20);

            expect(await queryUpdates()).deep.equals([{ softwareVersion: 1, source: "local" }]);

            await forceUpdate(1);
            await expectApplied(local);
        }).timeout(10_000);

        it("answers not available and fails the queued update when the consented version is not stored", async () => {
            const {
                site,
                otaProvider,
                requestor,
                provider,
                peerAddress,
                storeImage,
                interceptAnnouncements,
                forceUpdate,
                addSecondDevice,
            } = await initSiteWithoutTestImages();
            await using _localSite = site;

            await storeImage(1, "prod");
            const other = await addSecondDevice();
            const announced = await interceptAnnouncements((_attempt, _abort, endpoint) =>
                endpoint === other.requestor ? Promise.resolve() : undefined,
            );
            const { promise: failed, resolver: failedResolver } = createPromise<void>();
            await otaProvider.act(agent => {
                agent.get(SoftwareUpdateManager).events.updateFailed.once(() => failedResolver());
            });

            await forceUpdate(2);
            // Queued while the update of the device runs, so it waits for that update to end
            await other.consentTo(1);
            await other.close();
            await otaProvider.act(agent => {
                agent.get(SoftwareUpdateManager).internal.pendingStartUpSuppress.set(peerAddress, 1);
            });
            await MockTime.resolve(failed);
            expect(provider.queryImageResponses.map(({ status }) => status)).deep.equals([
                OtaSoftwareUpdateProvider.Status.NotAvailable,
            ]);
            const { queued, suppressed } = await otaProvider.act(agent => {
                const { internal } = agent.get(SoftwareUpdateManager);
                const { updateQueue, pendingStartUpSuppress } = internal;
                return {
                    queued: updateQueue.map(entry => [entry.peerAddress.nodeId, phaseStateOf(internal, entry)]),
                    suppressed: pendingStartUpSuppress.has(peerAddress),
                };
            });
            expect({ queued, suppressed }).deep.equals({
                queued: [
                    [peerAddress.nodeId, "failed"],
                    [other.peerAddress.nodeId, "announced"],
                ],
                suppressed: false,
            });
            expect(await otaProvider.act(agent => agent.get(SoftwareUpdateManager).hasConsent(peerAddress, 2))).true;
            // The next queued node is started once the update failed
            expect(announced.map(endpoint => (endpoint === other.requestor ? "other node" : "device"))).deep.equals([
                "device",
                "other node",
            ]);

            await MockTime.advance(Hours(1));
            expect(requestor.announceOtaProviderRequests).length(1);
        }).timeout(10_000);

        it("keeps an applying update when not available is reported for its device with the old version", async () => {
            const { site, otaProvider, peerAddress, storeImage, expectApplied, forceUpdate } =
                await initSiteWithoutTestImages();
            await using _localSite = site;

            const image = await storeImage(1, "prod");
            await forceUpdate(1);
            await expectApplied(image);

            const { queued, failed } = await otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                let failed = false;
                manager.events.updateFailed.once(() => {
                    failed = true;
                });
                manager.dropUndeliverableUpdate(peerAddress, 0);
                return { queued: manager.internal.updateQueue.length, failed };
            });
            expect({ queued, failed }).deep.equals({ queued: 1, failed: false });
        }).timeout(10_000);

        it("fails a queued update on not available only while it waits for the query of a device below its target", async () => {
            const { site, otaProvider, peerAddress } = await initSiteWithoutTestImages();
            await using _localSite = site;

            const announced = { state: "announced", since: Time.nowMs } as const;
            const cases: {
                phase: (manager: SoftwareUpdateManager) => UpdatePhase;
                reportedSoftwareVersion: number;
                failed: boolean;
            }[] = [
                { phase: () => announced, reportedSoftwareVersion: 0, failed: true },
                // The device may query before the announcement returns
                {
                    phase: () => ({ state: "announcing" }),
                    reportedSoftwareVersion: 0,
                    failed: true,
                },
                // The device already runs the target, as after a slow restart into it
                { phase: () => announced, reportedSoftwareVersion: 2, failed: false },
                // Not announced yet, so the query was not an answer to this entry
                { phase: () => ({ state: "queued", resetAt: Time.nowMs }), reportedSoftwareVersion: 0, failed: false },
                {
                    phase: manager => ({
                        state: "progress",
                        attempt: reportStatus(manager, peerAddress, 2, OtaUpdateStatus.Downloading),
                    }),
                    reportedSoftwareVersion: 0,
                    failed: false,
                },
            ];
            const results = await otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                manager.internal.suppressUpdates = true; // Keep the queue from announcing the crafted entries
                return cases.map(({ phase, reportedSoftwareVersion }) => {
                    manager.internal.consents.set(peerAddress, {
                        peerAddress,
                        vendorId: VendorId(0xfff1),
                        productId: 0x8000,
                        targetSoftwareVersion: 2,
                    });
                    manager.internal.updateQueue = [
                        {
                            vendorId: VendorId(0xfff1),
                            productId: 0x8000,
                            targetSoftwareVersion: 2,
                            peerAddress,
                            endpoint: agent.endpoint,
                            phase: phase(manager),
                        },
                    ];
                    manager.dropUndeliverableUpdate(peerAddress, reportedSoftwareVersion);
                    return phaseStateOf(manager.internal, manager.internal.updateQueue[0]) === "failed";
                });
            });
            expect(results).deep.equals(cases.map(({ failed }) => failed));
        }).timeout(10_000);

        /** Queues an update to `targetSoftwareVersion` that the device is never announced for, and fails it. */
        async function failUpdateTo(
            {
                otaProvider,
                peerAddress,
                interceptAnnouncements,
                forceUpdate,
            }: Awaited<ReturnType<typeof initSiteWithoutTestImages>>,
            targetSoftwareVersion: number,
        ) {
            const announced = await interceptAnnouncements(() => Promise.resolve());
            await forceUpdate(targetSoftwareVersion);
            await MockTime.advance(Seconds(1));
            await otaProvider.act(agent => {
                agent.get(SoftwareUpdateManager).dropUndeliverableUpdate(peerAddress, 0);
            });
            return announced;
        }

        /** Restarts the device with the version it runs, as when an update it applied did not take. */
        async function restartIntoPreviousVersion({
            device,
            controller,
        }: Awaited<ReturnType<typeof initSiteWithoutTestImages>>) {
            const subscription = controller.peers
                .get("peer1")!
                .behaviors.internalsOf(NetworkClient).activeSubscription!;
            SustainedSubscription.assert(subscription);
            await MockTime.resolve(device.stop());
            await MockTime.resolve(subscription.inactive);
            await MockTime.resolve(device.start());
            await MockTime.resolve(subscription.active);
            await MockTime.macrotasks;
        }

        it("lets the device apply a failed update when it queries on its own, without announcing it again", async () => {
            const ota = await initSiteWithoutTestImages();
            const { site, controller, otaProvider, otaRequestor, peerAddress, storeImage, expectApplied } = ota;
            await using _localSite = site;

            const image = await storeImage(1, "prod");
            const announced = await failUpdateTo(ota, 1);
            await MockTime.advance(Hours(1));
            expect(announced).length(1);

            // As the device's own query after a restart, which the device sends without an announcement
            await MockTime.resolve(
                otaProvider.act(agent =>
                    agent
                        .get(SoftwareUpdateManager)
                        .internal.announcements!.announceOtaProvider(
                            controller.peers.get("peer1")!.endpoints.for(otaRequestor.number),
                            OtaSoftwareUpdateRequestor.AnnouncementReason.UpdateAvailable,
                        ),
                ),
            );
            await expectApplied(image);
            expect(
                await otaProvider.act(agent =>
                    phaseStatesOf(agent.get(SoftwareUpdateManager).internal).map((state, index) => ({
                        nodeId: agent.get(SoftwareUpdateManager).internal.updateQueue[index].peerAddress.nodeId,
                        state,
                    })),
                ),
            ).deep.equals([{ nodeId: peerAddress.nodeId, state: "progress" }]);
        }).timeout(10_000);

        it("drops a failed update with its consent 24 hours after it failed", async () => {
            const ota = await initSiteWithoutTestImages();
            const { site, otaProvider, peerAddress } = ota;
            await using _localSite = site;

            await failUpdateTo(ota, 1);
            const stateOf = () =>
                otaProvider.act(agent => {
                    const manager = agent.get(SoftwareUpdateManager);
                    return { consent: manager.hasConsent(peerAddress, 1), queued: manager.internal.updateQueue.length };
                });

            await MockTime.advance(Hours(23));
            expect(await stateOf()).deep.equals({ consent: true, queued: 1 });
            await MockTime.advance(Hours(2));
            expect(await stateOf()).deep.equals({ consent: false, queued: 0 });
        }).timeout(10_000);

        it("does not announce a failed update again when the update the node revived is reset", async () => {
            const ota = await initSiteWithoutTestImages();
            const { site, otaProvider, peerAddress } = ota;
            await using _localSite = site;

            const announced = await failUpdateTo(ota, 1);
            const phases = await otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                const phaseOf = () => phaseStatesOf(manager.internal);
                const attempt = deliverOffer(manager, peerAddress, 1);
                const revived = phaseOf();
                manager.reportAttemptStatus(attempt, OtaUpdateStatus.Cancelled);
                return { revived, reset: phaseOf() };
            });
            await MockTime.advance(Hours(1));
            expect(phases).deep.equals({ revived: ["progress"], reset: ["failed"] });
            expect(announced).length(1);
        }).timeout(10_000);

        it("keeps a new consent for a failed update given while the node cannot be updated", async () => {
            const ota = await initSiteWithoutTestImages();
            const { site, otaProvider, peerAddress } = ota;
            await using _localSite = site;

            await failUpdateTo(ota, 1);
            const { added, queued } = await otaProvider.act(async agent => {
                const manager = agent.get(SoftwareUpdateManager);
                const { announcements } = manager.internal;
                manager.internal.announcements = undefined; // The node is not applicable for updates without it
                const added = await manager.addUpdateConsent(peerAddress, {
                    vendorId: VendorId(0xfff1),
                    productId: 0x8000,
                    targetSoftwareVersion: 1,
                });
                manager.internal.announcements = announcements;
                return { added, queued: phaseStatesOf(manager.internal) };
            });
            // The failed update waits for an announcement again, as the new consent is not failed
            expect({ added, queued }).deep.equals({ added: false, queued: ["queued"] });

            await MockTime.advance(Hours(25));
            expect(await otaProvider.act(agent => agent.get(SoftwareUpdateManager).hasConsent(peerAddress, 1))).true;
        }).timeout(10_000);

        it("announces a failed update again for a new consent", async () => {
            const ota = await initSiteWithoutTestImages();
            const { site, otaProvider, peerAddress } = ota;
            await using _localSite = site;

            const announced = await failUpdateTo(ota, 1);
            await otaProvider.act(agent =>
                agent.get(SoftwareUpdateManager).addUpdateConsent(peerAddress, {
                    vendorId: VendorId(0xfff1),
                    productId: 0x8000,
                    targetSoftwareVersion: 1,
                }),
            );
            await MockTime.advance(Seconds(1));
            expect(announced).length(2);
        }).timeout(10_000);

        /**
         * Starts an update to version 1 and gives the consent for version 2 after the node reported `status`, or after
         * it was announced.
         */
        async function consentNextVersionDuring(
            ota: Awaited<ReturnType<typeof initSiteWithoutTestImages>>,
            status?: OtaUpdateStatus,
            { from = 1, to = 2 } = {},
        ) {
            const { otaProvider, peerAddress, interceptAnnouncements, forceUpdate } = ota;
            const announced = await interceptAnnouncements(() => Promise.resolve());
            await forceUpdate(from);
            await MockTime.advance(Seconds(1));
            if (status === undefined) {
                // The update is underway once the announcement reached the node
                await MockTime.macrotasks;
            }
            const events = new Array<string>();
            let attempt: OtaUpdateAttempt | undefined;
            const targetsBefore = await otaProvider.act(async agent => {
                const manager = agent.get(SoftwareUpdateManager);
                manager.events.updateFailed.on(() => {
                    events.push("failed");
                });
                manager.events.updateDone.on(() => {
                    events.push("done");
                });
                if (status !== undefined) {
                    attempt = reportStatus(manager, peerAddress, from, status);
                }
                await manager.addUpdateConsent(peerAddress, {
                    vendorId: VendorId(0xfff1),
                    productId: 0x8000,
                    targetSoftwareVersion: to,
                });
                return manager.internal.updateQueue.map(({ targetSoftwareVersion }) => targetSoftwareVersion);
            });
            const queue = () =>
                otaProvider.act(agent => {
                    const manager = agent.get(SoftwareUpdateManager);
                    return manager.internal.updateQueue.map(entry => ({
                        targetSoftwareVersion: entry.targetSoftwareVersion,
                        state: phaseStateOf(manager.internal, entry),
                        failed: consentFailed(manager, entry),
                    }));
                });
            return { announced, events, targetsBefore, queue, attempt };
        }

        it("moves an announced update to the version consented meanwhile and fails that version when it has no image", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            const { announced, events, targetsBefore, queue } = await consentNextVersionDuring(ota);
            await MockTime.advance(Seconds(1));
            await otaProvider.act(agent => agent.get(SoftwareUpdateManager).dropUndeliverableUpdate(peerAddress, 0));
            await MockTime.advance(Seconds(1));

            expect(targetsBefore).deep.equals([2]);
            expect(await queue()).deep.equals([{ targetSoftwareVersion: 2, state: "failed", failed: true }]);
            expect(events).deep.equals(["failed"]);
            expect(announced).length(2);
        }).timeout(10_000);

        it("moves an update whose transfer was cancelled to the version consented while it ran", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider } = ota;
            await using _localSite = ota.site;

            const { events, targetsBefore, queue, attempt } = await consentNextVersionDuring(
                ota,
                OtaUpdateStatus.Downloading,
            );
            await otaProvider.act(agent =>
                agent.get(SoftwareUpdateManager).reportAttemptStatus(attempt!, OtaUpdateStatus.Cancelled),
            );
            await MockTime.advance(Seconds(1));

            expect(targetsBefore).deep.equals([1]);
            expect(await queue()).deep.equals([{ targetSoftwareVersion: 2, state: "announcing", failed: false }]);
            expect(events).deep.equals([]);
        }).timeout(10_000);

        it("queues the version consented while an update ran once that update is done", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            const { events, targetsBefore, queue, attempt } = await consentNextVersionDuring(
                ota,
                OtaUpdateStatus.Downloading,
            );
            await otaProvider.act(agent =>
                agent.get(SoftwareUpdateManager).updateApplied(peerAddress, tokenOf(attempt!), 1),
            );
            await MockTime.advance(Seconds(1));

            expect(targetsBefore).deep.equals([1]);
            expect(await queue()).deep.equals([{ targetSoftwareVersion: 2, state: "announcing", failed: false }]);
            expect(events).deep.equals(["done"]);
        }).timeout(10_000);

        it("counts the 24 hours of a failed update from its first failure", async () => {
            const ota = await initSiteWithoutTestImages();
            const { site, otaProvider, peerAddress } = ota;
            await using _localSite = site;

            await failUpdateTo(ota, 1);
            await MockTime.advance(Hours(20));
            // A second failure, as when a retry by the node itself does not take
            await otaProvider.act(agent => {
                reportStatus(agent.get(SoftwareUpdateManager), peerAddress, 1, OtaUpdateStatus.Applying);
            });
            await restartIntoPreviousVersion(ota);
            expect(await otaProvider.act(agent => agent.get(SoftwareUpdateManager).hasConsent(peerAddress, 1))).true;
            await MockTime.advance(Hours(5));
            expect(await otaProvider.act(agent => agent.get(SoftwareUpdateManager).hasConsent(peerAddress, 1))).false;
        }).timeout(10_000);

        it("cancels a failed update without reporting it as failed again", async () => {
            const ota = await initSiteWithoutTestImages();
            const { site, otaProvider, peerAddress } = ota;
            await using _localSite = site;

            await failUpdateTo(ota, 1);
            const { failedEvents, consent, queued } = await otaProvider.act(async agent => {
                const manager = agent.get(SoftwareUpdateManager);
                let failedEvents = 0;
                manager.events.updateFailed.on(() => {
                    failedEvents++;
                });
                await manager.removeConsent(peerAddress, 1);
                return {
                    failedEvents,
                    consent: manager.hasConsent(peerAddress),
                    queued: manager.internal.updateQueue.length,
                };
            });
            expect({ failedEvents, consent, queued }).deep.equals({ failedEvents: 0, consent: false, queued: 0 });
        }).timeout(10_000);

        it("reports a failed update once, also when the update the node revived fails again or is cancelled", async () => {
            const ota = await initSiteWithoutTestImages();
            const { site, otaProvider, peerAddress } = ota;
            await using _localSite = site;

            await failUpdateTo(ota, 1);
            const events = await recordOutcomes(ota);
            await otaProvider.act(agent => {
                reportStatus(agent.get(SoftwareUpdateManager), peerAddress, 1, OtaUpdateStatus.Applying);
            });
            await restartIntoPreviousVersion(ota);
            await otaProvider.act(async agent => {
                const manager = agent.get(SoftwareUpdateManager);
                deliverOffer(manager, peerAddress, 1);
                await manager.removeConsent(peerAddress);
            });
            expect(events).deep.equals([]);
        }).timeout(10_000);

        it("returns a stalled update the node revived after a failure to failed and drops it after 24 hours", async () => {
            const ota = await initSiteWithoutTestImages();
            const { site, otaProvider, peerAddress } = ota;
            await using _localSite = site;

            const announced = await failUpdateTo(ota, 1);
            await otaProvider.act(agent =>
                reportStatus(agent.get(SoftwareUpdateManager), peerAddress, 1, OtaUpdateStatus.Downloading),
            );
            const stateOf = () =>
                otaProvider.act(agent => {
                    const manager = agent.get(SoftwareUpdateManager);
                    return {
                        consent: manager.hasConsent(peerAddress, 1),
                        phase: phaseStatesOf(manager.internal),
                    };
                });

            await MockTime.advance(Minutes(25));
            expect(await stateOf()).deep.equals({ consent: true, phase: ["failed"] });
            await MockTime.advance(Hours(24));
            expect(await stateOf()).deep.equals({ consent: false, phase: [] });
            expect(announced).length(1);
        }).timeout(10_000);

        it("keeps a failed update and its consent when the consent for another version is removed", async () => {
            const ota = await initSiteWithoutTestImages();
            const { site, otaProvider, peerAddress } = ota;
            await using _localSite = site;

            await failUpdateTo(ota, 1);
            expect(
                await otaProvider.act(async agent => {
                    const manager = agent.get(SoftwareUpdateManager);
                    await manager.removeConsent(peerAddress, 2);
                    return { consent: manager.hasConsent(peerAddress), queued: manager.internal.updateQueue.length };
                }),
            ).deep.equals({ consent: true, queued: 1 });
        }).timeout(10_000);

        /** Gives the node a consent for `targetSoftwareVersion`. */
        function consentTo(
            { otaProvider, peerAddress }: Awaited<ReturnType<typeof initSiteWithoutTestImages>>,
            targetSoftwareVersion: number,
            options: Pick<SoftwareUpdateManager.UpdateTarget, "maxBdxBlockSize"> = {},
        ) {
            return otaProvider.act(agent =>
                agent.get(SoftwareUpdateManager).addUpdateConsent(peerAddress, {
                    vendorId: VendorId(0xfff1),
                    productId: 0x8000,
                    targetSoftwareVersion,
                    ...options,
                }),
            );
        }

        /** The versions the node has a consent for, and the targets of its queued updates. */
        function consentsAndTargets({
            otaProvider,
            peerAddress,
        }: Awaited<ReturnType<typeof initSiteWithoutTestImages>>) {
            return otaProvider.act(agent => {
                const { consents, updateQueue } = agent.get(SoftwareUpdateManager).internal;
                const consent = consents.get(peerAddress);
                return {
                    consents: consent === undefined ? [] : [consent.targetSoftwareVersion],
                    targets: updateQueue.map(({ targetSoftwareVersion }) => targetSoftwareVersion),
                };
            });
        }

        it("replaces the consent for a lower version when one for a higher version is added, and updates to the higher", async () => {
            const ota = await initSiteWithoutTestImages();
            await using _localSite = ota.site;

            await ota.interceptAnnouncements(() => Promise.resolve());
            await consentTo(ota, 1);
            await consentTo(ota, 2);
            expect(await consentsAndTargets(ota)).deep.equals({ consents: [2], targets: [2] });
        }).timeout(10_000);

        it("moves a queued update to the version of a new consent also while the node cannot be updated", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            await ota.interceptAnnouncements(() => new Promise<void>(() => {}));
            await consentTo(ota, 1);
            const added = await otaProvider.act(async agent => {
                const manager = agent.get(SoftwareUpdateManager);
                const { announcements } = manager.internal;
                manager.internal.announcements = undefined; // The node is not applicable for updates without it
                const added = await manager.addUpdateConsent(peerAddress, {
                    vendorId: VendorId(0xfff1),
                    productId: 0x8000,
                    targetSoftwareVersion: 2,
                });
                manager.internal.announcements = announcements;
                return added;
            });
            expect({ added, ...(await consentsAndTargets(ota)) }).deep.equals({
                added: false,
                consents: [2],
                targets: [2],
            });
        }).timeout(10_000);

        it("removes the consent and the queued update of a node when no version is named", async () => {
            const ota = await initSiteWithoutTestImages();
            await using _localSite = ota.site;

            await ota.interceptAnnouncements(() => new Promise<void>(() => {}));
            await consentTo(ota, 1);
            await consentTo(ota, 2);
            await ota.otaProvider.act(agent => agent.get(SoftwareUpdateManager).removeConsent(ota.peerAddress));
            expect(await consentsAndTargets(ota)).deep.equals({ consents: [], targets: [] });
        }).timeout(10_000);

        it("keeps an update underway when the consent for another version is removed", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            await ota.interceptAnnouncements(() => Promise.resolve());
            await consentTo(ota, 1);
            await consentTo(ota, 2);
            await MockTime.advance(Seconds(1));
            const phase = await otaProvider.act(async agent => {
                const manager = agent.get(SoftwareUpdateManager);
                reportStatus(manager, peerAddress, 2, OtaUpdateStatus.Downloading);
                await manager.removeConsent(peerAddress, 1);
                return phaseStatesOf(manager.internal);
            });
            expect(phase).deep.equals(["progress"]);
            expect(await consentsAndTargets(ota)).deep.equals({ consents: [2], targets: [2] });
        }).timeout(10_000);

        it("cancels an update underway when the consent for its version is removed, and queues the version of the consent left", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            await ota.interceptAnnouncements(() => Promise.resolve());
            await consentTo(ota, 1);
            await MockTime.advance(Seconds(1));
            const cancels = await interceptBdxCancels(ota);
            const failures = await otaProvider.act(async agent => {
                const manager = agent.get(SoftwareUpdateManager);
                let failures = 0;
                manager.events.updateFailed.on(() => {
                    failures++;
                });
                const attempt = reportStatus(manager, peerAddress, 1, OtaUpdateStatus.Downloading);
                // The update underway keeps its version; the consent for version 2 waits for it to end
                await manager.addUpdateConsent(peerAddress, {
                    vendorId: VendorId(0xfff1),
                    productId: 0x8000,
                    targetSoftwareVersion: 2,
                });
                await manager.removeConsent(peerAddress, 1);
                // As reported by the provider when the cancel closes the BDX transfer
                manager.reportAttemptStatus(attempt, OtaUpdateStatus.Cancelled);
                return failures;
            });
            expect({ failures, cancels: cancels.count }).deep.equals({ failures: 1, cancels: 1 });
            expect(await consentsAndTargets(ota)).deep.equals({ consents: [2], targets: [2] });
        }).timeout(10_000);

        it("ignores a Done below the target that arrives after its update ended", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            const { announced, events, queue, attempt } = await consentNextVersionDuring(
                ota,
                OtaUpdateStatus.Downloading,
            );
            await otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                manager.updateApplied(peerAddress, tokenOf(attempt!), 1);
                manager.updateApplied(peerAddress, tokenOf(attempt!), 1);
            });
            expect(await queue()).deep.equals([{ targetSoftwareVersion: 2, state: "announcing", failed: false }]);
            expect(events).deep.equals(["done"]);
            expect(announced).length(2);
        }).timeout(10_000);

        /** Records `updateDone` and `updateFailed` of the manager in the order they are emitted. */
        function recordOutcomes({ otaProvider }: Awaited<ReturnType<typeof initSiteWithoutTestImages>>) {
            const events = new Array<string>();
            return otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                manager.events.updateDone.on(() => {
                    events.push("done");
                });
                manager.events.updateFailed.on(() => {
                    events.push("failed");
                });
                return events;
            });
        }

        it("keeps the consent of an applying update and completes it when the node restarts into it", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress, device, controller } = ota;
            await using _localSite = ota.site;

            await ota.interceptAnnouncements(() => Promise.resolve());
            await consentTo(ota, 1);
            await MockTime.advance(Seconds(1));
            const events = await recordOutcomes(ota);
            await otaProvider.act(async agent => {
                const manager = agent.get(SoftwareUpdateManager);
                reportStatus(manager, peerAddress, 1, OtaUpdateStatus.Applying);
                await manager.removeConsent(peerAddress);
            });
            expect(await consentsAndTargets(ota)).deep.equals({ consents: [], targets: [1] });

            const versionChanged = new Promise<void>(resolve => {
                controller.peers
                    .get("peer1")!
                    .eventsOf(BasicInformationClient)
                    .softwareVersion$Changed.once(() => resolve());
            });
            await device.setStateOf(BasicInformationServer, { softwareVersion: 1 });
            await MockTime.resolve(versionChanged);
            await MockTime.macrotasks;
            expect(events).deep.equals(["done"]);
            expect(await consentsAndTargets(ota)).deep.equals({ consents: [], targets: [] });
        }).timeout(10_000);

        it("changes no consent and no apply right when a forced update is refused for another product", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            await ota.interceptAnnouncements(() => new Promise<void>(() => {}));
            await consentTo(ota, 3);
            const attempt = await otaProvider.act(agent =>
                deliverOffer(agent.get(SoftwareUpdateManager), peerAddress, 3),
            );
            await expect(
                otaProvider.act(agent =>
                    agent.get(SoftwareUpdateManager).forceUpdate(peerAddress, {
                        vendorId: VendorId(0xfff1),
                        productId: 0x8001,
                        targetSoftwareVersion: 2,
                    }),
                ),
            ).rejectedWith(ImplementationError);
            expect(await consentsAndTargets(ota)).deep.equals({ consents: [3], targets: [3] });
            expect(isApplyAllowed(attempt)).true;
        }).timeout(10_000);

        it("queues a consent below the newest version at the update check and asks for consent to the newest", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            await ota.storeImage(1, "prod");
            await ota.storeImage(2, "prod");
            await otaProvider.act(async agent => {
                const manager = agent.get(SoftwareUpdateManager);
                const { announcements } = manager.internal;
                manager.internal.announcements = undefined; // The node is not applicable for updates without it
                await manager.addUpdateConsent(peerAddress, {
                    vendorId: VendorId(0xfff1),
                    productId: 0x8000,
                    targetSoftwareVersion: 1,
                });
                manager.internal.announcements = announcements;
            });
            await ota.interceptAnnouncements(() => new Promise<void>(() => {}));
            expect(await consentsAndTargets(ota)).deep.equals({ consents: [1], targets: [] });

            expect((await ota.queryUpdates()).map(({ softwareVersion }) => softwareVersion)).deep.equals([2]);
            expect(await consentsAndTargets(ota)).deep.equals({ consents: [1], targets: [1] });
        }).timeout(10_000);

        /** Counts the BDX cancels of the manager, and lets them fail while `fail` is set. */
        async function interceptBdxCancels({ otaProvider }: Awaited<ReturnType<typeof initSiteWithoutTestImages>>) {
            const cancels = { count: 0, fail: false };
            // Each MockSite test has its own Environment, so the patched BdxProtocol is discarded with the site
            await otaProvider.act(agent => {
                const bdxProtocol = agent.get(SoftwareUpdateManager).env.get(BdxProtocol);
                const disablePeerForScope = bdxProtocol.disablePeerForScope.bind(bdxProtocol);
                bdxProtocol.disablePeerForScope = async (...args: Parameters<typeof disablePeerForScope>) => {
                    cancels.count++;
                    if (cancels.fail) {
                        throw new InternalError("Simulated BDX cancel failure");
                    }
                    return disablePeerForScope(...args);
                };
            });
            return cancels;
        }

        it("cancels a BDX transfer without a queued update only when all consents of the node are removed", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            const cancels = await interceptBdxCancels(ota);
            await otaProvider.act(agent => agent.get(SoftwareUpdateManager).removeConsent(peerAddress, 7));
            expect(cancels.count).equals(0);
            await otaProvider.act(agent => agent.get(SoftwareUpdateManager).removeConsent(peerAddress));
            expect(cancels.count).equals(1);
        }).timeout(10_000);

        it("refuses a forced update to the version the node already runs, without changing anything", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            await ota.interceptAnnouncements(() => new Promise<void>(() => {}));
            await consentTo(ota, 3);
            const attempt = await otaProvider.act(agent =>
                deliverOffer(agent.get(SoftwareUpdateManager), peerAddress, 3),
            );
            const events = await recordOutcomes(ota);
            await expect(ota.forceUpdate(0)).rejectedWith(OtaUpdateError);
            expect(events).deep.equals([]);
            expect(await consentsAndTargets(ota)).deep.equals({ consents: [3], targets: [3] });
            expect(isApplyAllowed(attempt)).true;
        }).timeout(10_000);

        it("moves a stale update that a forced update to a lower version replaces to the forced version, without a failure", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider } = ota;
            await using _localSite = ota.site;

            const announced = await ota.interceptAnnouncements(() => Promise.resolve());
            await consentTo(ota, 2);
            await MockTime.advance(Seconds(1));
            const events = await recordOutcomes(ota);
            await otaProvider.act(agent => deliverOffer(agent.get(SoftwareUpdateManager), ota.peerAddress, 2));
            const announcedBefore = announced.length;
            await ota.forceUpdate(1);
            await MockTime.advance(Seconds(1));
            expect(events).deep.equals([]);
            expect(await consentsAndTargets(ota)).deep.equals({ consents: [1], targets: [1] });
            expect(announced).length(announcedBefore + 1);
        }).timeout(10_000);

        it("stores no consent for a version the node already runs", async () => {
            const ota = await initSiteWithoutTestImages();
            await using _localSite = ota.site;

            await ota.interceptAnnouncements(() => new Promise<void>(() => {}));
            expect(await consentTo(ota, 0)).false;
            expect(await consentsAndTargets(ota)).deep.equals({ consents: [], targets: [] });
        }).timeout(10_000);

        it("retries an update that the node completes below its target while it runs", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            await ota.interceptAnnouncements(() => Promise.resolve());
            await consentTo(ota, 2);
            await MockTime.advance(Seconds(1));
            const events = await recordOutcomes(ota);
            const states = await otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                const attempt = reportStatus(manager, peerAddress, 2, OtaUpdateStatus.Downloading);
                manager.updateApplied(peerAddress, tokenOf(attempt), 1);
                return manager.internal.updateQueue.map(entry => ({
                    targetSoftwareVersion: entry.targetSoftwareVersion,
                    state: phaseStateOf(manager.internal, entry),
                }));
            });
            expect(events).deep.equals([]);
            expect(states).deep.equals([{ targetSoftwareVersion: 2, state: "announcing" }]);
        }).timeout(10_000);

        it("lets a requestor that obtains consent itself apply the newest image it was offered without a consent", async () => {
            const { site, controller, otaProvider, otaRequestor, requestor, provider, storeImage, expectImage } =
                await initSiteWithoutTestImages({
                    delegateConsent: true,
                    grantUserConsent: true,
                });
            await using _localSite = site;

            await otaRequestor.setStateOf(requestor.TestOtaRequestorServer, { canConsent: true });
            await storeImage(1, "prod");
            const image = await storeImage(2, "prod");
            expectImage(image);
            await MockTime.resolve(
                otaProvider.act(agent =>
                    agent
                        .get(SoftwareUpdateManager)
                        .internal.announcements!.announceOtaProvider(
                            controller.peers.get("peer1")!.endpoints.for(otaRequestor.number),
                            OtaSoftwareUpdateRequestor.AnnouncementReason.UpdateAvailable,
                        ),
                ),
            );

            await MockTime.resolve(requestor.requestUserConsentPromise);
            await MockTime.resolve(requestor.applyUpdatePromise);
            expect(
                provider.queryImageResponses.map(({ status, softwareVersion, userConsentNeeded }) => ({
                    status,
                    softwareVersion,
                    userConsentNeeded,
                })),
            ).deep.equals([
                {
                    status: OtaSoftwareUpdateProvider.Status.UpdateAvailable,
                    softwareVersion: image.updateInfo.softwareVersion,
                    userConsentNeeded: true,
                },
            ]);
            expect(provider.applyUpdateResponses.map(({ action }) => action)).deep.equals([
                OtaSoftwareUpdateProvider.ApplyUpdateAction.Proceed,
            ]);
        }).timeout(10_000);

        it("offers a requestor that can consent the newest image when its consented version is not stored", async () => {
            const { site, otaRequestor, requestor, provider, storeImage, expectApplied, forceUpdate } =
                await initSiteWithoutTestImages({
                    delegateConsent: true,
                    grantUserConsent: true,
                });
            await using _localSite = site;

            await otaRequestor.setStateOf(requestor.TestOtaRequestorServer, { canConsent: true });
            const image = await storeImage(1, "prod");

            await forceUpdate(2);
            await expectApplied(image);
            expect(provider.queryImageResponses.map(({ userConsentNeeded }) => userConsentNeeded)).deep.equals([true]);
        }).timeout(10_000);

        it("announces again after an announcement failed unexpectedly", async () => {
            const { site, otaProvider, storeImage, expectApplied, interceptAnnouncements, queueSnapshot, forceUpdate } =
                await initSiteWithoutTestImages();
            await using _localSite = site;

            const image = await storeImage(1, "prod");
            const announced = await interceptAnnouncements(attempt =>
                attempt === 1 ? Promise.reject(new InternalError("Unexpected announcement failure")) : undefined,
            );

            await forceUpdate(1);
            await MockTime.resolve(
                otaProvider.act(agent =>
                    Promise.all(agent.get(SoftwareUpdateManager).internal.runningAnnouncements.values()),
                ),
            );
            // A failed announcement leaves the entry queued for the next queue check
            expect(await queueSnapshot()).deep.equals([
                { targetSoftwareVersion: 1, status: "queued", lastProgressStatus: OtaUpdateStatus.Unknown },
            ]);
            await expectApplied(image);
            expect(announced).length(2);
        }).timeout(10_000);

        it("replaces an announcement that is stuck for longer than the progress timeout", async () => {
            const { site, otaProvider, storeImage, expectApplied, interceptAnnouncements, forceUpdate } =
                await initSiteWithoutTestImages();
            await using _localSite = site;

            // Without a default provider the device does not query on its own, so only an announcement reaches it
            await otaProvider.act(agent => {
                agent.get(SoftwareUpdateManager).state.announceAsDefaultProvider = false;
            });
            const image = await storeImage(1, "prod");
            const announced = await interceptAnnouncements(attempt =>
                attempt === 1 ? new Promise<void>(() => {}) : undefined,
            );

            await forceUpdate(1);
            await expectApplied(image);
            expect(announced).length(2);
        }).timeout(10_000);

        it("offers a requestor that can consent the newest image without a consent only while delegation is on", async () => {
            const { site, otaProvider, storeImage, offerToRequestor } = await initSiteWithoutTestImages();
            await using _localSite = site;

            await storeImage(1, "prod");
            expect(await offerToRequestor({ requestorCanConsent: true })).undefined;

            await otaProvider.act(agent => {
                agent.get(SoftwareUpdateManager).state.delegateConsentToRequestor = true;
            });
            expect((await offerToRequestor({ requestorCanConsent: true }))?.newSoftwareVersion).equals(1);
        }).timeout(10_000);

        it("does not offer an image on the consent of another product, also when its version matches", async () => {
            const { site, otaProvider, peerAddress, storeImage, offerToRequestor } = await initSiteWithoutTestImages();
            await using _localSite = site;

            await storeImage(1, "prod");
            await otaProvider.act(agent => {
                agent.get(SoftwareUpdateManager).internal.consents.set(peerAddress, {
                    peerAddress,
                    vendorId: VendorId(0xfff1),
                    productId: 0x8001,
                    targetSoftwareVersion: 1,
                });
            });

            expect(await offerToRequestor({ requestorCanConsent: false })).undefined;
        }).timeout(10_000);

        it("asks for consent instead of delegating it when an override requires consent while delegation is off", async () => {
            const { site, otaRequestor, requestor, provider, storeImage, forceUpdate } =
                await initSiteWithoutTestImages({ requireConsent: true, grantUserConsent: true });
            await using _localSite = site;

            await otaRequestor.setStateOf(requestor.TestOtaRequestorServer, { canConsent: true });
            await storeImage(1, "prod");
            // This provider expects no consent request, so its consent hook rejects once it is asked
            const consentRequest = expect(provider.requestUserConsentForUpdatePromise).rejectedWith(
                /Unexpected call to requestUserConsentForUpdate/,
            );
            await forceUpdate(1);
            await MockTime.resolve(consentRequest);
        }).timeout(10_000);

        /** Counts the BDX enables of the provider and returns the node's attempts the manager still runs. */
        async function observeOfferEffects({
            otaProvider,
            peerAddress,
        }: Awaited<ReturnType<typeof initSiteWithoutTestImages>>) {
            let bdxEnabled = 0;
            await otaProvider.act(agent => {
                const bdxProtocol = agent.get(SoftwareUpdateManager).env.get(BdxProtocol);
                const enablePeerForScope = bdxProtocol.enablePeerForScope.bind(bdxProtocol);
                bdxProtocol.enablePeerForScope = (...args: Parameters<typeof enablePeerForScope>) => {
                    bdxEnabled++;
                    return enablePeerForScope(...args);
                };
            });
            return async () => ({
                bdxEnabled,
                attempts: await otaProvider.act(
                    agent => agent.get(SoftwareUpdateManager).internal.attempts.of(peerAddress).length,
                ),
            });
        }

        it("answers NotAvailable instead of an offer whose consent was removed while the query ran", async () => {
            const ota = await initSiteWithoutTestImages({ removeConsentDuringQuery: true });
            const { site, provider, storeImage, forceUpdate } = ota;
            await using _localSite = site;

            await storeImage(1, "prod");
            const effects = await observeOfferEffects(ota);
            await forceUpdate(1);
            await MockTime.resolve(provider.queryImageAnsweredPromise);
            await MockTime.advance(Seconds(1));
            expect(provider.queryImageResponses.map(({ status }) => status)).deep.equals([
                OtaSoftwareUpdateProvider.Status.NotAvailable,
            ]);
            expect(provider.applyUpdateResponses).deep.equals([]);
            expect(await effects()).deep.equals({ bdxEnabled: 0, attempts: 0 });
        }).timeout(10_000);

        it("refuses the apply of a delegated update token once removeConsent() is called for the node", async () => {
            const { site, controller, otaProvider, otaRequestor, requestor, provider, peerAddress, storeImage } =
                await initSiteWithoutTestImages({
                    delegateConsent: true,
                    grantUserConsent: true,
                    beforeApplyUpdateRequest: agent => agent.get(SoftwareUpdateManager).removeConsent(peerAddress),
                });
            await using _localSite = site;

            await otaRequestor.setStateOf(requestor.TestOtaRequestorServer, { canConsent: true });
            await storeImage(1, "prod");
            await MockTime.resolve(
                otaProvider.act(agent =>
                    agent
                        .get(SoftwareUpdateManager)
                        .internal.announcements!.announceOtaProvider(
                            controller.peers.get("peer1")!.endpoints.for(otaRequestor.number),
                            OtaSoftwareUpdateRequestor.AnnouncementReason.UpdateAvailable,
                        ),
                ),
            );

            await MockTime.resolve(provider.applyUpdateRequestPromise);
            await MockTime.advance(Seconds(1));
            expect(provider.applyUpdateResponses.map(({ action }) => action)[0]).equals(
                OtaSoftwareUpdateProvider.ApplyUpdateAction.Discontinue,
            );
        }).timeout(10_000);

        it("keeps the queued update when the node reports a version its cached state does not show yet", async () => {
            const { site, otaProvider, peerAddress, interceptAnnouncements, queueSnapshot, forceUpdate } =
                await initSiteWithoutTestImages();
            await using _localSite = site;

            await interceptAnnouncements(() => Promise.resolve());
            await forceUpdate(2);
            await MockTime.advance(Seconds(1));
            await otaProvider.act(agent => {
                agent.get(SoftwareUpdateManager).dropUndeliverableUpdate(peerAddress, 1);
            });
            expect((await queueSnapshot()).map(({ targetSoftwareVersion }) => targetSoftwareVersion)).deep.equals([2]);
        }).timeout(10_000);

        it("does not delegate consent to a node with LocalConfigDisabled", async () => {
            const { site, storeImage, offerToRequestor } = await initSiteWithoutTestImages({
                delegateConsent: true,
                localConfigDisabled: true,
            });
            await using _localSite = site;

            await storeImage(1, "prod");
            expect(await offerToRequestor({ requestorCanConsent: true })).undefined;
        }).timeout(10_000);

        it("keeps the queued update when an overriding checkUpdateAvailable() finds nothing", async () => {
            const { site, otaProvider, peerAddress, provider, storeImage, queueSnapshot, forceUpdate } =
                await initSiteWithoutTestImages({
                    declineUpdates: true,
                });
            await using _localSite = site;

            await storeImage(1, "prod");
            await forceUpdate(1);
            await MockTime.resolve(provider.queryImagePromise);
            await MockTime.advance(Seconds(1));
            expect(provider.queryImageResponses.map(({ status }) => status)).deep.equals([
                OtaSoftwareUpdateProvider.Status.NotAvailable,
            ]);
            expect((await queueSnapshot()).map(({ targetSoftwareVersion }) => targetSoftwareVersion)).deep.equals([1]);
            expect(
                await otaProvider.act(agent => [...agent.get(SoftwareUpdateManager).internal.attempts.of(peerAddress)]),
            ).length(0);
        }).timeout(10_000);

        it("announces a forced update once while another node waits in the queue", async () => {
            const { site, requestor, storeImage, expectApplied, forceUpdate, interceptAnnouncements, addSecondDevice } =
                await initSiteWithoutTestImages();
            await using _localSite = site;

            const image = await storeImage(1, "prod");
            const other = await addSecondDevice();
            await interceptAnnouncements((_attempt, _abort, endpoint) =>
                endpoint === other.requestor ? Promise.reject(new InternalError("Node does not answer")) : undefined,
            );
            // Its announcement fails, so it waits in the queue for a retry
            await other.consentTo(1);
            await other.close();

            await forceUpdate(1);
            await expectApplied(image);
            expect(requestor.announceOtaProviderRequests).length(1);
        }).timeout(10_000);

        for (const { reason, options, status, blockBdx } of [
            {
                reason: "BDX cannot be enabled",
                options: {},
                status: OtaSoftwareUpdateProvider.Status.Busy,
                blockBdx: true,
            },
            {
                reason: "the consent for it is denied",
                options: { denyConsent: true },
                status: OtaSoftwareUpdateProvider.Status.NotAvailable,
                blockBdx: false,
            },
        ]) {
            it(`keeps the queued update unchanged when its offer does not reach the node because ${reason}`, async () => {
                const {
                    site,
                    otaProvider,
                    peerAddress,
                    provider,
                    storeImage,
                    interceptAnnouncements,
                    queueSnapshot,
                    forceUpdate,
                } = await initSiteWithoutTestImages(options);
                await using _localSite = site;

                await storeImage(1, "prod");
                const announced = await interceptAnnouncements();
                if (blockBdx) {
                    // Each MockSite test has its own Environment, so the patched BdxProtocol is discarded with the site
                    await otaProvider.act(agent => {
                        agent.get(SoftwareUpdateManager).env.get(BdxProtocol).enablePeerForScope = () => false;
                    });
                }

                await forceUpdate(1);
                await MockTime.resolve(provider.queryImageAnsweredPromise);
                await MockTime.macrotasks;
                expect(provider.queryImageResponses.map(({ status }) => status)).deep.equals([status]);
                expect(
                    await otaProvider.act(agent =>
                        agent.get(SoftwareUpdateManager).internal.attempts.offered(peerAddress),
                    ),
                ).deep.equals([]);
                expect(await queueSnapshot()).deep.equals([
                    { targetSoftwareVersion: 1, status: "in-progress", lastProgressStatus: undefined },
                ]);
                expect(announced).length(1);
            }).timeout(10_000);
        }

        it("keeps the queued update and its consent when an offer of a lower version is cancelled or does not take", async () => {
            const ota = await initSiteWithoutTestImages({ delegateConsent: true });
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            const announced = await ota.interceptAnnouncements(() => Promise.resolve());
            await consentTo(ota, 2);
            await MockTime.advance(Seconds(1));
            await MockTime.macrotasks;
            const events = await recordOutcomes(ota);
            const phaseOf = () => otaProvider.act(agent => phaseStatesOf(agent.get(SoftwareUpdateManager).internal));

            // As offered to a node that obtains the consent for the newest stored image itself
            await otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                const attempt = reportStatus(manager, peerAddress, 1, OtaUpdateStatus.Downloading);
                manager.reportAttemptStatus(attempt, OtaUpdateStatus.Cancelled);
            });
            await MockTime.advance(Seconds(1));
            expect(await phaseOf()).deep.equals(["announced"]);
            expect(announced).length(1);

            await otaProvider.act(agent => {
                reportStatus(agent.get(SoftwareUpdateManager), peerAddress, 1, OtaUpdateStatus.Applying);
            });
            await restartIntoPreviousVersion(ota);
            expect(events).deep.equals([]);
            expect(
                await otaProvider.act(agent =>
                    consentsOf(agent.get(SoftwareUpdateManager)).map(consent => ({
                        targetSoftwareVersion: consent.targetSoftwareVersion,
                        failed: consentFailed(agent.get(SoftwareUpdateManager), consent),
                    })),
                ),
            ).deep.equals([{ targetSoftwareVersion: 2, failed: false }]);
        }).timeout(10_000);

        it("ignores a late Done of a completed update while the next update of the node runs", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            const { events, queue, attempt } = await consentNextVersionDuring(ota, OtaUpdateStatus.Downloading);
            await otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                manager.updateApplied(peerAddress, tokenOf(attempt!), 1);
                reportStatus(manager, peerAddress, 2, OtaUpdateStatus.Downloading);
                manager.updateApplied(peerAddress, tokenOf(attempt!), 1);
            });
            expect(await queue()).deep.equals([{ targetSoftwareVersion: 2, state: "progress", failed: false }]);
            expect(events).deep.equals(["done"]);
        }).timeout(10_000);

        it("keeps the apply right of an offer when the consent for another version is removed, and ends the right of an offer of that version", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            await ota.interceptAnnouncements(() => new Promise<void>(() => {}));
            await consentTo(ota, 2);
            const { offered, ofRemoved } = await otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                // As offered by an override that obtained the consent for version 1 itself
                const offered = deliverOffer(manager, peerAddress, 1);
                // An offer of version 2 whose query still runs
                const ofRemoved = beginAttempt(manager, peerAddress);
                expect(manager.offerUpdate(ofRemoved, Bytes.fromHex("0a0b0c0d0e0f0102"), 2)).true;
                return { offered, ofRemoved };
            });
            await otaProvider.act(agent => agent.get(SoftwareUpdateManager).removeConsent(peerAddress, 2));
            const allowed = await otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                return {
                    offered: manager.applyUpdate(peerAddress, tokenOf(offered), 1, Seconds(0)),
                    ofRemoved: manager.applyUpdate(peerAddress, tokenOf(ofRemoved), 2, Seconds(0)),
                };
            });
            expect(allowed).deep.equals({ offered: true, ofRemoved: false });
        }).timeout(10_000);

        it("lets an applying update apply again once its consent is removed, which hasConsent() no longer reports", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            await ota.interceptAnnouncements(() => Promise.resolve());
            await consentTo(ota, 1);
            await MockTime.advance(Seconds(1));
            const events = await recordOutcomes(ota);
            const result = await otaProvider.act(async agent => {
                const manager = agent.get(SoftwareUpdateManager);
                const attempt = deliverOffer(manager, peerAddress, 1);
                const allowed = manager.applyUpdate(peerAddress, tokenOf(attempt), 1, Seconds(0));
                await manager.removeConsent(peerAddress, 1);
                return {
                    allowed,
                    consent: manager.hasConsent(peerAddress, 1),
                    // As a requestor sends its ApplyUpdateRequest again when the response got lost
                    resent: manager.applyUpdate(peerAddress, tokenOf(attempt), 1, Seconds(0)),
                };
            });
            expect(result).deep.equals({ allowed: true, consent: false, resent: true });
            expect(events).deep.equals([]);
            expect(await consentsAndTargets(ota)).deep.equals({ consents: [], targets: [1] });
        }).timeout(10_000);

        it("reports a failed update again when it fails after a new consent for its version", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            await failUpdateTo(ota, 1);
            const events = await recordOutcomes(ota);
            await otaProvider.act(async agent => {
                const manager = agent.get(SoftwareUpdateManager);
                reportStatus(manager, peerAddress, 1, OtaUpdateStatus.Applying);
                await manager.addUpdateConsent(peerAddress, {
                    vendorId: VendorId(0xfff1),
                    productId: 0x8000,
                    targetSoftwareVersion: 1,
                });
            });
            await restartIntoPreviousVersion(ota);
            expect(events).deep.equals(["failed"]);
        }).timeout(10_000);

        /** The phase states of the node's queued updates, with their targets. */
        function phasesOf({ otaProvider }: Awaited<ReturnType<typeof initSiteWithoutTestImages>>) {
            return otaProvider.act(agent =>
                agent.get(SoftwareUpdateManager).internal.updateQueue.map(entry => ({
                    targetSoftwareVersion: entry.targetSoftwareVersion,
                    state: phaseStateOf(agent.get(SoftwareUpdateManager).internal, entry),
                })),
            );
        }

        for (const { what, status, offered, reported, failed } of [
            {
                what: "fails an applying update when its node queries again with a lower version",
                status: OtaUpdateStatus.Applying,
                offered: 2,
                reported: 0,
                failed: true,
            },
            {
                what: "resets an update without a failure when its node queries again before it applies",
                status: OtaUpdateStatus.WaitForApply,
                offered: 2,
                reported: 0,
                failed: false,
            },
            {
                what: "fails no applying update when its node queries again with the target version",
                status: OtaUpdateStatus.Applying,
                offered: 2,
                reported: 2,
                failed: false,
            },
            {
                what: "fails no update when its node queries again after applying another version than the target",
                status: OtaUpdateStatus.Applying,
                offered: 1,
                reported: 0,
                failed: false,
            },
        ]) {
            it(what, async () => {
                const ota = await initSiteWithoutTestImages();
                const { otaProvider, peerAddress } = ota;
                await using _localSite = ota.site;

                await ota.interceptAnnouncements(() => Promise.resolve());
                await consentTo(ota, 2);
                await MockTime.advance(Seconds(1));
                const events = await recordOutcomes(ota);
                const result = await otaProvider.act(async agent => {
                    const manager = agent.get(SoftwareUpdateManager);
                    const attempt = reportStatus(manager, peerAddress, offered, status, Seconds(0));
                    const admitted = await manager.admitQuery(peerAddress, sessionOf(manager, peerAddress), reported);
                    return {
                        admitted,
                        ended: attempt.ended,
                        failedConsent: consentsOf(manager).some(consent => consentFailed(manager, consent)),
                    };
                });
                expect({ ...result, events }).deep.equals({
                    admitted: true,
                    ended: true,
                    failedConsent: failed,
                    events: failed ? ["failed"] : [],
                });
            }).timeout(10_000);
        }

        for (const failed of [false, true]) {
            /** Brings an update to `progress`, then takes the controller offline and online again. */
            async function followEndedAttemptOffline() {
                const ota = await initSiteWithoutTestImages();
                const { otaProvider, peerAddress, controller } = ota;

                if (failed) {
                    await failUpdateTo(ota, 1);
                } else {
                    await ota.interceptAnnouncements(() => Promise.resolve());
                    await consentTo(ota, 1);
                    await MockTime.advance(Seconds(1));
                }
                const events = await recordOutcomes(ota);
                const { internal, attempt } = await otaProvider.act(agent => {
                    const manager = agent.get(SoftwareUpdateManager);
                    const attempt = reportStatus(manager, peerAddress, 1, OtaUpdateStatus.Downloading);
                    return { internal: manager.internal, attempt };
                });
                expect(phaseStatesOf(internal)).deep.equals(["progress"]);

                await MockTime.resolve(controller.stop());
                await MockTime.resolve(controller.start());
                const entryState = () =>
                    internal.updateQueue.map(entry => ({
                        targetSoftwareVersion: entry.targetSoftwareVersion,
                        state: phaseStateOf(internal, entry),
                        followsEndedAttempt:
                            entry.phase.state === "progress" && entry.phase.attempt === attempt && attempt.ended,
                    }));
                return { ota, events, internal, attempt, entryState };
            }

            it(`keeps an update in progress with its ended attempt when the controller goes offline and online, failed ${failed}`, async () => {
                const { ota, events, entryState } = await followEndedAttemptOffline();
                await using _localSite = ota.site;

                expect({ entry: entryState(), events }).deep.equals({
                    entry: [{ targetSoftwareVersion: 1, state: "progress", followsEndedAttempt: true }],
                    events: [],
                });
            }).timeout(10_000);

            it(`links an update that followed an ended attempt to the next answered offer of the node, failed ${failed}`, async () => {
                const { ota, events, internal, attempt } = await followEndedAttemptOffline();
                const { otaProvider, peerAddress } = ota;
                await using _localSite = ota.site;

                const next = await otaProvider.act(agent =>
                    reportStatus(agent.get(SoftwareUpdateManager), peerAddress, 1, OtaUpdateStatus.Downloading),
                );
                expect({
                    states: phaseStatesOf(internal),
                    linkedToNext: internal.updateQueue.map(
                        ({ phase }) => phase.state === "progress" && phase.attempt === next,
                    ),
                    nextEnded: next.ended,
                    firstEnded: attempt.ended,
                    events,
                }).deep.equals({
                    states: ["progress"],
                    linkedToNext: [true],
                    nextEnded: false,
                    firstEnded: true,
                    events: [],
                });
            }).timeout(10_000);

            it(`resets an update that followed an ended attempt when the stall check finds no new attempt, failed ${failed}`, async () => {
                const { ota, events, entryState } = await followEndedAttemptOffline();
                await using _localSite = ota.site;

                await MockTime.advance(Minutes(25));

                // The same queue run that resets the update announces it again, as the node did not come back by itself
                expect({ entry: entryState(), events }).deep.equals({
                    entry: [
                        {
                            targetSoftwareVersion: 1,
                            state: failed ? "failed" : "announcing",
                            followsEndedAttempt: false,
                        },
                    ],
                    events: [],
                });
            }).timeout(10_000);
        }

        it("resets an update to queued, without a failure, when the node restarts into its old version before it applies", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            const announced = await ota.interceptAnnouncements(() => Promise.resolve());
            await consentTo(ota, 1);
            await MockTime.advance(Seconds(1));
            const events = await recordOutcomes(ota);
            await otaProvider.act(agent => {
                reportStatus(agent.get(SoftwareUpdateManager), peerAddress, 1, OtaUpdateStatus.WaitForApply);
            });
            await restartIntoPreviousVersion(ota);
            await MockTime.advance(Seconds(1));

            expect(events).deep.equals([]);
            expect(
                await otaProvider.act(agent =>
                    consentsOf(agent.get(SoftwareUpdateManager)).map(
                        ({ targetSoftwareVersion }) => targetSoftwareVersion,
                    ),
                ),
            ).deep.equals([1]);
            expect(
                await otaProvider.act(agent =>
                    consentsOf(agent.get(SoftwareUpdateManager)).some(consent =>
                        consentFailed(agent.get(SoftwareUpdateManager), consent),
                    ),
                ),
            ).false;
            expect(await phasesOf(ota)).not.deep.equals([{ targetSoftwareVersion: 1, state: "failed" }]);
            // Announced again after the reset
            expect(announced).length(2);
        }).timeout(10_000);

        /**
         * Lets a requestor that can consent query and apply a delegated update while the given consent is removed, and
         * returns the statuses of the query, the actions of the apply, and what the offer left behind.
         */
        async function applyDelegatedWhileConsentRemoved(
            removed: { duringQuery: true | number } | { beforeApply: number },
        ) {
            const ota = await initSiteWithoutTestImages({
                delegateConsent: true,
                grantUserConsent: true,
                removeConsentDuringQuery: "duringQuery" in removed ? removed.duringQuery : undefined,
                beforeApplyUpdateRequest:
                    "beforeApply" in removed
                        ? agent => agent.get(SoftwareUpdateManager).removeConsent(ota.peerAddress, removed.beforeApply)
                        : undefined,
            });
            const { site, controller, otaProvider, otaRequestor, requestor, provider, storeImage } = ota;
            await using _localSite = site;

            await otaRequestor.setStateOf(requestor.TestOtaRequestorServer, { canConsent: true });
            await storeImage(1, "prod");
            const effects = await observeOfferEffects(ota);
            await MockTime.resolve(
                otaProvider.act(agent =>
                    agent
                        .get(SoftwareUpdateManager)
                        .internal.announcements!.announceOtaProvider(
                            controller.peers.get("peer1")!.endpoints.for(otaRequestor.number),
                            OtaSoftwareUpdateRequestor.AnnouncementReason.UpdateAvailable,
                        ),
                ),
            );
            await MockTime.resolve(provider.queryImageAnsweredPromise);
            const statuses = provider.queryImageResponses.map(({ status }) => status);
            if (statuses[0] === OtaSoftwareUpdateProvider.Status.UpdateAvailable) {
                await MockTime.resolve(provider.applyUpdateRequestPromise);
            }
            await MockTime.advance(Seconds(1));
            return {
                statuses,
                actions: provider.applyUpdateResponses.map(({ action }) => action),
                ...(await effects()),
            };
        }

        it("refuses the apply of a delegated offer once the consent for its version is removed, although none was stored", async () => {
            const { actions } = await applyDelegatedWhileConsentRemoved({ beforeApply: 1 });
            expect(actions).deep.equals([OtaSoftwareUpdateProvider.ApplyUpdateAction.Discontinue]);
        }).timeout(10_000);

        for (const [title, duringQuery] of [
            ["for the node", true],
            ["for the version the node would be offered", 1],
        ] as const) {
            it(`answers NotAvailable to a delegated query when its consent is removed ${title} while it runs`, async () => {
                const { statuses, actions, bdxEnabled, attempts } = await applyDelegatedWhileConsentRemoved({
                    duringQuery,
                });
                expect(statuses).deep.equals([OtaSoftwareUpdateProvider.Status.NotAvailable]);
                expect(actions).deep.equals([]);
                expect({ bdxEnabled, attempts }).deep.equals({ bdxEnabled: 0, attempts: 0 });
            }).timeout(10_000);
        }

        it("does not link an attempt that ended before its offer was delivered", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            await ota.interceptAnnouncements(() => new Promise<void>(() => {}));
            await consentTo(ota, 1);
            const { delivered, ended, linked } = await otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                const delivered = deliverOffer(manager, peerAddress, 1);
                const ended = beginAttempt(manager, peerAddress);
                manager.offerUpdate(ended, Bytes.fromHex("0a0b0c0d0e0f0107"), 1);
                // As the provider ends an attempt while its query still runs
                ended.end();
                manager.offerAnswered(ended);
                const { phase } = manager.internal.updateQueue[0];
                return { delivered, ended, linked: phase.state === "progress" ? phase.attempt : undefined };
            });
            expect(linked).equals(delivered);
            expect({ delivered: delivered.ended, ended: ended.answered }).deep.equals({
                delivered: false,
                ended: false,
            });
        }).timeout(10_000);

        /** The queued updates with the update token of the attempt each one is linked to. */
        function linkedUpdates(manager: SoftwareUpdateManager) {
            return manager.internal.updateQueue.map(entry => ({
                targetSoftwareVersion: entry.targetSoftwareVersion,
                state: phaseStateOf(manager.internal, entry),
                token: entry.phase.state === "progress" ? Bytes.toHex(tokenOf(entry.phase.attempt)) : undefined,
            }));
        }

        /** Whether the first queued update is linked to `attempt`. */
        function isLinked(manager: SoftwareUpdateManager, attempt: OtaUpdateAttempt) {
            const [entry] = manager.internal.updateQueue;
            return entry?.phase.state === "progress" && entry.phase.attempt === attempt;
        }

        it("resets an update whose attempt a newer answered offer of another version replaces, so the old status no longer counts", async () => {
            const ota = await initSiteWithoutTestImages();
            const { controller, device, otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            await ota.interceptAnnouncements(() => Promise.resolve());
            await consentTo(ota, 2);
            await MockTime.advance(Seconds(1));
            const replaced = await otaProvider.act(agent =>
                reportStatus(agent.get(SoftwareUpdateManager), peerAddress, 2, OtaUpdateStatus.WaitForApply),
            );

            await consentTo(ota, 3);
            const afterAnswer = await otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                const linkedBefore = linkedUpdates(manager);
                const replacing = deliverOffer(manager, peerAddress, 3);
                manager.reportAttemptStatus(replacing, OtaUpdateStatus.Downloading);
                return {
                    linkedBefore,
                    ended: replaced.ended,
                    linked: linkedUpdates(manager),
                    replacingToken: Bytes.toHex(tokenOf(replacing)),
                };
            });
            expect(afterAnswer).deep.equals({
                linkedBefore: [{ targetSoftwareVersion: 2, state: "progress", token: Bytes.toHex(tokenOf(replaced)) }],
                ended: true,
                linked: [{ targetSoftwareVersion: 3, state: "progress", token: afterAnswer.replacingToken }],
                replacingToken: afterAnswer.replacingToken,
            });

            // The node restarts below its target while the replacing attempt downloads
            const peer = controller.peers.get("peer1")!;
            await peer.act(agent =>
                peer
                    .eventsOf(BasicInformationClient)
                    .startUp.emit({ softwareVersion: device.state.basicInformation.softwareVersion }, agent.context),
            );
            await MockTime.yield3();
            expect(
                await otaProvider.act(agent =>
                    consentsOf(agent.get(SoftwareUpdateManager)).map(consent => ({
                        targetSoftwareVersion: consent.targetSoftwareVersion,
                        failed: consentFailed(agent.get(SoftwareUpdateManager), consent),
                    })),
                ),
            ).deep.equals([{ targetSoftwareVersion: 3, failed: false }]);
        }).timeout(10_000);

        it("ignores a late Cancelled of an attempt whose update was reset as stalled while the update is announced again", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            const signals = new Array<AbortSignal | undefined>();
            const announced = await ota.interceptAnnouncements((attempt, abort) => {
                signals.push(abort);
                return attempt === 1 ? Promise.resolve() : new Promise<void>(() => {});
            });
            await consentTo(ota, 1);
            await MockTime.advance(Seconds(1));
            const attempt = await otaProvider.act(agent =>
                reportStatus(agent.get(SoftwareUpdateManager), peerAddress, 1, OtaUpdateStatus.Downloading),
            );

            await MockTime.advance(Minutes(25));
            expect(announced).length(2);
            const late = await otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                const before = linkedUpdates(manager);
                manager.reportAttemptStatus(attempt, OtaUpdateStatus.Cancelled);
                return { ended: attempt.ended, before, after: linkedUpdates(manager) };
            });
            await MockTime.advance(Seconds(1));
            expect(late).deep.equals({
                ended: false,
                before: [{ targetSoftwareVersion: 1, state: "announcing", token: undefined }],
                after: [{ targetSoftwareVersion: 1, state: "announcing", token: undefined }],
            });
            expect({ announced: announced.length, aborted: signals.map(signal => signal?.aborted) }).deep.equals({
                announced: 2,
                aborted: [false, false],
            });
        }).timeout(10_000);

        it("ends the attempt of a queued update when an apply under an unknown update token replaces it", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            await ota.interceptAnnouncements(() => Promise.resolve());
            await consentTo(ota, 1);
            await MockTime.advance(Seconds(1));
            const unknownToken = Bytes.fromHex("0102030405060708");
            const result = await otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                const replaced = reportStatus(manager, peerAddress, 1, OtaUpdateStatus.Downloading);
                // As after a restart of the controller, which forgot the token the node applies under
                const applied = manager.applyUpdate(peerAddress, unknownToken, 1, Seconds(0));
                return { applied, ended: replaced.ended, linked: linkedUpdates(manager) };
            });
            expect(result).deep.equals({
                applied: true,
                ended: true,
                linked: [{ targetSoftwareVersion: 1, state: "progress", token: Bytes.toHex(unknownToken) }],
            });
        }).timeout(10_000);

        describe("admits a new query of a node with a running attempt", () => {
            /**
             * Links the node's queued update to an answered attempt, gives the attempt a BDX transfer on a session
             * `transferSession` derives from the session of the new query, if any, and asks the manager to admit that
             * query.
             */
            async function admitWithRunningAttempt({
                transferSession,
                stale = false,
                cancelFails = false,
            }: {
                transferSession?: (query: { id: number; activeTimestamp: Timestamp }) => {
                    id: number;
                    activeTimestamp: Timestamp;
                };
                stale?: boolean;
                cancelFails?: boolean;
            }) {
                const ota = await initSiteWithoutTestImages();
                const { otaProvider, peerAddress } = ota;

                await ota.interceptAnnouncements(() => new Promise<void>(() => {}));
                await consentTo(ota, 1);
                await MockTime.advance(Seconds(1));
                let cancels = 0;
                const result = await otaProvider.act(async agent => {
                    const manager = agent.get(SoftwareUpdateManager);
                    const attempt = reportStatus(manager, peerAddress, 1, OtaUpdateStatus.Downloading);
                    const linked = isLinked(manager, attempt);
                    const session = sessionOf(manager, peerAddress);
                    const bdxProtocol = manager.env.get(BdxProtocol);
                    if (transferSession !== undefined) {
                        const transfer = standInBdxSession(peerAddress, transferSession(session));
                        bdxProtocol.sessionFor = () => transfer.session;
                    }
                    bdxProtocol.disablePeerForScope = async () => {
                        cancels++;
                        if (cancelFails) {
                            throw new InternalError("Simulated BDX cancel failure");
                        }
                    };
                    const admit = () => manager.admitQuery(peerAddress, session, 0);
                    const admitted = stale ? await withWallClockAhead(Minutes(16), admit) : await admit();
                    return {
                        linked,
                        admitted,
                        ended: attempt.ended,
                        stillLinked: isLinked(manager, attempt),
                        suppressedStartUp: manager.internal.pendingStartUpSuppress.get(peerAddress) === session.id,
                    };
                });
                return { ota, result: { ...result, cancels } };
            }

            const running = { admitted: false, ended: false, stillLinked: true, suppressedStartUp: false, cancels: 0 };

            for (const { what, options, expected } of [
                {
                    what: "ends a stale attempt and resets its update, also while its BDX transfer looks newer",
                    options: {
                        stale: true,
                        transferSession: ({ id, activeTimestamp }: { id: number; activeTimestamp: Timestamp }) => ({
                            id: id + 1,
                            activeTimestamp: Timestamp(activeTimestamp + 1),
                        }),
                    },
                    expected: { admitted: true, ended: true, stillLinked: false, suppressedStartUp: false, cancels: 0 },
                },
                {
                    what: "ends an attempt without a BDX transfer and resets its update",
                    options: {},
                    expected: { admitted: true, ended: true, stillLinked: false, suppressedStartUp: false, cancels: 0 },
                },
                {
                    what: "cancels the transfer of a node that restarted, ends its attempt, resets its update and suppresses the startUp",
                    options: {
                        transferSession: ({ id }: { id: number }) => ({ id: id + 1, activeTimestamp: Timestamp(0) }),
                    },
                    expected: { admitted: true, ended: true, stillLinked: false, suppressedStartUp: true, cancels: 1 },
                },
                {
                    what: "answers busy and keeps the attempt when the transfer of a node that restarted cannot be cancelled",
                    options: {
                        cancelFails: true,
                        transferSession: ({ id }: { id: number }) => ({ id: id + 1, activeTimestamp: Timestamp(0) }),
                    },
                    expected: { ...running, cancels: 1 },
                },
                {
                    what: "answers busy while the transfer runs on the session of the query",
                    options: { transferSession: (query: { id: number; activeTimestamp: Timestamp }) => query },
                    expected: running,
                },
                {
                    what: "answers busy while the transfer on another session is as recent as the session of the query",
                    options: {
                        transferSession: ({ id, activeTimestamp }: { id: number; activeTimestamp: Timestamp }) => ({
                            id: id + 1,
                            activeTimestamp,
                        }),
                    },
                    expected: running,
                },
                {
                    what: "answers busy while the transfer is newer than the session of the query",
                    options: {
                        transferSession: ({ id, activeTimestamp }: { id: number; activeTimestamp: Timestamp }) => ({
                            id: id + 1,
                            activeTimestamp: Timestamp(activeTimestamp + 1),
                        }),
                    },
                    expected: running,
                },
            ]) {
                it(what, async () => {
                    const { ota, result } = await admitWithRunningAttempt(options);
                    await using _localSite = ota.site;
                    expect(result).deep.equals({ linked: true, ...expected });
                }).timeout(10_000);
            }
        });

        it("answers not available without a status when the attempt ended while the consent was asked for", async () => {
            const { site, provider, storeImage, forceUpdate } = await initSiteWithoutTestImages({
                requireConsent: true,
                lateConsent: "after-attempt-ended",
            });
            await using _localSite = site;

            await storeImage(1, "prod");
            await forceUpdate(1);
            await MockTime.resolve(provider.queryImageAnsweredPromise);
            expect(provider.queryImageResponses.map(({ status }) => status)).deep.equals([
                OtaSoftwareUpdateProvider.Status.NotAvailable,
            ]);
        }).timeout(10_000);

        /** The versions the node has a consent for, the targets of its updates, and whether each has a consent. */
        function consentsTargetsAndCoverage(ota: Awaited<ReturnType<typeof initSiteWithoutTestImages>>) {
            return ota.otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                const { consents, updateQueue } = manager.internal;
                const consent = consents.get(ota.peerAddress);
                return {
                    consents: consent === undefined ? [] : [consent.targetSoftwareVersion],
                    targets: updateQueue.map(({ targetSoftwareVersion }) => targetSoftwareVersion),
                    everyTargetConsented: updateQueue.every(
                        ({ peerAddress, targetSoftwareVersion, phase }) =>
                            phase.state === "progress" ||
                            consents.get(peerAddress)?.targetSoftwareVersion === targetSoftwareVersion,
                    ),
                };
            });
        }

        it("emits updateFailed once the state is final, so a listener sees it and its own removal stays", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            await ota.interceptAnnouncements(() => Promise.resolve());
            await consentTo(ota, 1);
            await MockTime.advance(Seconds(1));
            const removals = new Array<Promise<void>>();
            const seen = await otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                const seen = new Array<{ phases: string[]; queuedEvents: number }>();
                manager.events.updateFailed.on(() => {
                    seen.push({
                        phases: phaseStatesOf(manager.internal),
                        queuedEvents: manager.internal.outbox.length,
                    });
                    removals.push(manager.removeConsent(peerAddress));
                });
                manager.dropUndeliverableUpdate(peerAddress, 0);
                return seen;
            });
            await MockTime.resolve(Promise.all(removals));

            expect(seen).deep.equals([{ phases: ["failed"], queuedEvents: 0 }]);
            expect(await consentsTargetsAndCoverage(ota)).deep.equals({
                consents: [],
                targets: [],
                everyTargetConsented: true,
            });
        }).timeout(10_000);

        it("keeps the consent an updateFailed listener gives for another version", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            await ota.interceptAnnouncements(() => Promise.resolve());
            await consentTo(ota, 2);
            await MockTime.advance(Seconds(1));
            const consents = new Array<Promise<boolean>>();
            await otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                manager.events.updateFailed.on(() => {
                    consents.push(
                        manager.addUpdateConsent(peerAddress, {
                            vendorId: VendorId(0xfff1),
                            productId: 0x8000,
                            targetSoftwareVersion: 1,
                        }),
                    );
                });
                manager.dropUndeliverableUpdate(peerAddress, 0);
            });
            expect(await MockTime.resolve(Promise.all(consents))).deep.equals([true]);

            expect(await consentsTargetsAndCoverage(ota)).deep.equals({
                consents: [1],
                targets: [1],
                everyTargetConsented: true,
            });
        }).timeout(10_000);

        it("offers what an override makes without consentRequired, although the manager holds no consent for it", async () => {
            const ota = await initSiteWithoutTestImages({
                answerQueryWith: () => ({
                    newSoftwareVersion: 1,
                    newSoftwareVersionString: "1.0.0",
                    fileDesignator: new FileDesignator("ota/fff1.8000.prod.1"),
                    consentRequired: false,
                }),
            });
            const { site, storeImage, expectApplied } = ota;
            await using _localSite = site;

            const image = await storeImage(1, "prod");
            // A consent for another version, so the node is announced and queries
            await consentTo(ota, 2);
            await expectApplied(image);
        }).timeout(10_000);

        it("does not delegate consent to a requestor that cannot obtain it, also while delegation is on", async () => {
            const { site, storeImage, offerToRequestor } = await initSiteWithoutTestImages({ delegateConsent: true });
            await using _localSite = site;

            await storeImage(1, "prod");
            expect(await offerToRequestor({ requestorCanConsent: false })).undefined;
            expect((await offerToRequestor({ requestorCanConsent: true }))?.newSoftwareVersion).equals(1);
        }).timeout(10_000);

        /**
         * Builds OTA state of every kind for the node: a failed update with its expiry, the consented fallback
         * announced, an attempt with an offer, a found update, a startUp suppression, a fast resubscription, the
         * observers of the node, and a queued update of another node.  Returns what records the cleanup.
         */
        async function buildNodeState(ota: Awaited<ReturnType<typeof initSiteWithoutTestImages>>) {
            const { otaProvider } = ota;
            const peerAddress = PeerAddress(ota.peerAddress);
            const other = await ota.addSecondDevice();
            const announced = await ota.interceptAnnouncements(() => new Promise<void>(() => {}));
            await consentTo(ota, 2);
            // Waits in the queue behind the announcement of the node
            await other.consentTo(1);
            await other.close();
            const events = await recordOutcomes(ota);
            const effects = { disarmed: new Array<string>(), bdxDisabled: new Array<string>() };
            const attempt = await otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                const { internal, env } = manager;

                const attempt = beginAttempt(manager, peerAddress);
                manager.offerUpdate(attempt, Bytes.fromHex("0a0b0c0d0e0f0112"), 2);
                internal.knownUpdates.set(peerAddress, {
                    vendorId: VendorId(0xfff1),
                    productId: 0x8000,
                    softwareVersion: 2,
                    softwareVersionString: "2",
                    source: "local",
                });
                internal.pendingStartUpSuppress.set(peerAddress, 1);
                const armer = new RebootResubscribeArmer(env.get(SessionManager), env.get(ClientSubscriptions));
                armer.disarm = (address: PeerAddress) => effects.disarmed.push(address.toString());
                internal.rebootResubscribeArmer = armer;
                const bdx = env.get(BdxProtocol);
                const { disablePeerForScope } = bdx;
                bdx.disablePeerForScope = async (address, storage, force) => {
                    effects.bdxDisabled.push(address.toString());
                    return disablePeerForScope.call(bdx, address, storage, force);
                };
                return attempt;
            });
            const before = await nodeState(ota, peerAddress);
            expect(before).deep.include({ observed: true, known: true, suppressed: true });
            const versionChanged = ota.controller.peers
                .get("peer1")!
                .eventsOf(BasicInformationClient).softwareVersion$Changed;
            const observers = await otaProvider.act(agent =>
                agent.get(SoftwareUpdateManager).internal.versionUpdateObservers.get(peerAddress)!,
            );
            /** Whether the manager still observes the software version of the node. */
            const observesNode = () => observers.observes(versionChanged);
            return { peerAddress, announced, events, effects, attempt, other, observesNode };
        }

        /** What the manager holds about the node. */
        function nodeState(
            { otaProvider }: Awaited<ReturnType<typeof initSiteWithoutTestImages>>,
            peerAddress: PeerAddress,
        ) {
            return otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                const { internal } = manager;
                return {
                    consent: manager.hasConsent(peerAddress),
                    queued: internal.updateQueue.some(entry => PeerAddress.is(entry.peerAddress, peerAddress)),
                    attempts: internal.attempts.of(peerAddress).length,
                    observed: internal.versionUpdateObservers.get(peerAddress) !== undefined,
                    known: internal.knownUpdates.get(peerAddress) !== undefined,
                    suppressed: internal.pendingStartUpSuppress.get(peerAddress) !== undefined,
                };
            });
        }

        for (const { how, remove } of [
            {
                how: "is deleted",
                remove: (ota: Awaited<ReturnType<typeof initSiteWithoutTestImages>>) =>
                    ota.controller.peers.get("peer1")!.delete(),
            },
            {
                how: "is decommissioned",
                remove: (ota: Awaited<ReturnType<typeof initSiteWithoutTestImages>>) =>
                    ota.controller.peers.get("peer1")!.decommission(),
            },
            {
                how: "leaves the fabric",
                remove: async ({ controller, device }: Awaited<ReturnType<typeof initSiteWithoutTestImages>>) => {
                    // A Leave counts only on an active subscription
                    const peer1 = await subscribedPeer(controller, "peer1");
                    const fabricIndex = peer1.stateOf(OperationalCredentialsClient).currentFabricIndex;
                    await device.act(agent => {
                        agent.get(BasicInformationServer).events.leave.emit({ fabricIndex }, agent.context);
                    });
                    for (let wait = 0; controller.peers.get("peer1") && wait < 100; wait++) {
                        await MockTime.resolve(MockTime.sleep("peer deletion", Seconds(1)), { macrotasks: true });
                    }
                },
            },
        ]) {
            it(`drops all OTA state of a node that ${how}, without an event, and announces the next update`, async () => {
                const ota = await initSiteWithoutTestImages();
                const { controller } = ota;
                await using _localSite = ota.site;

                const { peerAddress, announced, events, effects, attempt, other, observesNode } =
                    await buildNodeState(ota);
                const announcedBefore = announced.length;

                await MockTime.resolve(remove(ota));
                await MockTime.macrotasks;
                const state = await nodeState(ota, peerAddress);

                expect({
                    controllerPeers: controller.peers.size,
                    events,
                    ended: attempt.ended,
                    observesNode: observesNode(),
                    disarmed: effects.disarmed,
                    bdxDisabled: effects.bdxDisabled.includes(peerAddress.toString()),
                    announcedNext: announced.slice(announcedBefore).map(endpoint => endpoint === other.requestor),
                    state,
                }).deep.equals({
                    controllerPeers: 1,
                    events: [],
                    ended: true,
                    observesNode: false,
                    disarmed: [peerAddress.toString()],
                    bdxDisabled: true,
                    announcedNext: [true],
                    state: {
                        consent: false,
                        queued: false,
                        attempts: 0,
                        observed: false,
                        known: false,
                        suppressed: false,
                    },
                });
            }).timeout(20_000);
        }

        it("refuses a consent and a forced update for a peer address no node has, and creates no node", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, controller, peerAddress } = ota;
            await using _localSite = ota.site;

            const unknown = PeerAddress({ fabricIndex: peerAddress.fabricIndex, nodeId: NodeId(0xfffe) });
            const target = { vendorId: VendorId(0xfff1), productId: 0x8000, targetSoftwareVersion: 1 };
            await expect(
                otaProvider.act(agent => agent.get(SoftwareUpdateManager).addUpdateConsent(unknown, target)),
            ).rejectedWith(OtaUpdateError, /No node has the peer address/);
            await expect(
                otaProvider.act(agent => agent.get(SoftwareUpdateManager).forceUpdate(unknown, target)),
            ).rejectedWith(OtaUpdateError, /No node has the peer address/);

            expect({
                peers: controller.peers.size,
                consent: await otaProvider.act(agent => agent.get(SoftwareUpdateManager).hasConsent(unknown)),
            }).deep.equals({ peers: 1, consent: false });
        }).timeout(10_000);

        it("refuses a consent and a forced update for another vendor than the node's, and changes nothing", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            const target = { vendorId: VendorId(0xfff2), productId: 0x8000, targetSoftwareVersion: 1 };
            await expect(
                otaProvider.act(agent => agent.get(SoftwareUpdateManager).addUpdateConsent(peerAddress, target)),
            ).rejectedWith(ImplementationError, /does not match given vendorId\/productId/);
            await expect(
                otaProvider.act(agent => agent.get(SoftwareUpdateManager).forceUpdate(peerAddress, target)),
            ).rejectedWith(ImplementationError, /does not match given vendorId\/productId/);
            expect(await consentsAndTargets(ota)).deep.equals({ consents: [], targets: [] });
        }).timeout(10_000);

        it("announces a forced update at once while the update of another node is announced", async () => {
            const ota = await initSiteWithoutTestImages();
            await using _localSite = ota.site;

            const other = await ota.addSecondDevice();
            const announced = await ota.interceptAnnouncements((_attempt, _abort, endpoint) =>
                endpoint === other.requestor ? new Promise<void>(() => {}) : Promise.resolve(),
            );
            await other.consentTo(1);
            expect(announced.map(endpoint => endpoint === other.requestor)).deep.equals([true]);

            await ota.forceUpdate(1);
            expect(announced.map(endpoint => endpoint === other.requestor)).deep.equals([true, false]);
        }).timeout(10_000);

        it("reports no update available for the version of a failed consent, but for a newer one", async () => {
            const ota = await initSiteWithoutTestImages();
            const { storeImage, queryUpdates } = ota;
            await using _localSite = ota.site;

            await storeImage(1, "prod");
            await failUpdateTo(ota, 1);
            expect(await queryUpdates()).deep.equals([]);

            await storeImage(2, "prod");
            expect((await queryUpdates()).map(({ softwareVersion }) => softwareVersion)).deep.equals([2]);
        }).timeout(10_000);

        /**
         * Queues for each of `others` an update that follows an applying attempt without a consent, as after
         * `removeConsent()` while it applies.  With the wall clock 20 minutes ahead, each of them is stalled.
         */
        function queueApplyingWithoutConsent(
            { otaProvider }: Awaited<ReturnType<typeof initSiteWithoutTestImages>>,
            others: PeerAddress[],
        ) {
            return otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                for (const peerAddress of others) {
                    const attempt = beginAttempt(manager, peerAddress);
                    const updateToken = Bytes.fromHex((++lastUpdateToken).toString(16).padStart(16, "0"));
                    expect(manager.offerUpdate(attempt, updateToken, 1)).true;
                    manager.offerAnswered(attempt);
                    attempt.setStatus(OtaUpdateStatus.Applying);
                    manager.internal.updateQueue.push({
                        peerAddress,
                        endpoint: agent.endpoint,
                        vendorId: VendorId(0xfff1),
                        productId: 0x8000,
                        targetSoftwareVersion: 1,
                        phase: { state: "progress", attempt },
                    });
                }
            });
        }

        it("drops the queued update of a node removed while updates were suppressed, without an event, when the queue runs next", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, controller } = ota;
            await using _localSite = ota.site;

            const other = await ota.addSecondDevice();
            const announced = await ota.interceptAnnouncements(() => new Promise<void>(() => {}));
            await consentTo(ota, 1);
            const events = await recordOutcomes(ota);
            const setSuppressed = (suppressed: boolean) =>
                otaProvider.act(agent => {
                    agent.get(SoftwareUpdateManager).internal.suppressUpdates = suppressed;
                });

            // As while the controller is offline, when the manager does not react to the removal
            await setSuppressed(true);
            await MockTime.resolve(controller.peers.get("peer1")!.delete());
            await setSuppressed(false);
            const queuedBefore = await otaProvider.act(
                agent => agent.get(SoftwareUpdateManager).internal.updateQueue.length,
            );
            await other.consentTo(1);
            await MockTime.advance(Seconds(1));

            const queued = await otaProvider.act(agent =>
                agent.get(SoftwareUpdateManager).internal.updateQueue.map(entry => PeerAddress(entry.peerAddress)),
            );
            expect({
                queuedBefore,
                queued,
                events,
                announcedLast: announced[announced.length - 1] === other.requestor,
            }).deep.equals({ queuedBefore: 1, queued: [other.peerAddress], events: [], announcedLast: true });
        }).timeout(20_000);

        it("emits the next event of a change when a listener of an earlier event fails", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            const other = await ota.addSecondDevice();
            await ota.interceptAnnouncements(() => Promise.resolve());
            await consentTo(ota, 1);
            await MockTime.advance(Seconds(1));
            await queueApplyingWithoutConsent(ota, [other.peerAddress]);
            const failed = await otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                reportStatus(manager, peerAddress, 1, OtaUpdateStatus.Downloading);
                const failed = new Array<string>();
                manager.events.updateFailed.on(address => {
                    failed.push(address.toString());
                    if (failed.length === 1) {
                        throw new InternalError("Listener failed");
                    }
                });
                return failed;
            });

            // One change cancels the update of the node and resets the stalled update of the other node
            await withWallClockAhead(Minutes(20), () =>
                otaProvider.act(agent => agent.get(SoftwareUpdateManager).removeConsent(peerAddress)),
            );

            expect(failed).deep.equals([PeerAddress(peerAddress).toString(), other.peerAddress.toString()]);
        }).timeout(20_000);

        it("lists a failed update while the node retries it on its own", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            await failUpdateTo(ota, 1);
            const whileFailed = await ota.queueSnapshot();
            await otaProvider.act(agent => {
                deliverOffer(agent.get(SoftwareUpdateManager), peerAddress, 1);
            });

            expect({ whileFailed, retried: await ota.queueSnapshot() }).deep.equals({
                whileFailed: [],
                retried: [
                    { targetSoftwareVersion: 1, status: "in-progress", lastProgressStatus: OtaUpdateStatus.Querying },
                ],
            });
        }).timeout(10_000);

        it("observes a node with one observer group and one set of reactors across update checks", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider, peerAddress } = ota;
            await using _localSite = ota.site;

            const observed = () =>
                otaProvider.act(async agent => {
                    const manager = agent.get(SoftwareUpdateManager);
                    await manager.queryUpdates();
                    const { versionUpdateObservers, peerEventReactors } = manager.internal;
                    return { observers: versionUpdateObservers.get(peerAddress), reactors: peerEventReactors };
                });
            const first = await observed();
            const second = await observed();
            const versionChanged = ota.controller.peers
                .get("peer1")!
                .eventsOf(BasicInformationClient).softwareVersion$Changed;
            const observedBefore = first.observers?.observes(versionChanged);

            await MockTime.resolve(otaProvider.close());

            expect({
                sameObservers: first.observers !== undefined && first.observers === second.observers,
                sameReactors: first.reactors !== undefined && first.reactors === second.reactors,
                observedBefore,
                observedAfterClose: first.observers?.observes(versionChanged),
            }).deep.equals({
                sameObservers: true,
                sameReactors: true,
                observedBefore: true,
                observedAfterClose: false,
            });
        }).timeout(10_000);

        it("answers an apply request when an updateApplying listener throws", async () => {
            const { site, otaProvider, provider, storeImage, expectApplied, forceUpdate } =
                await initSiteWithoutTestImages();
            await using _localSite = site;

            const image = await storeImage(1, "prod");
            const seen = await otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                const seen = new Array<OtaUpdateStatus | undefined>();
                manager.events.updateApplying.on(() => {
                    seen.push(manager.queuedUpdates[0]?.lastProgressStatus);
                });
                manager.events.updateApplying.on(() => {
                    throw new InternalError("Listener failed");
                });
                return seen;
            });
            await forceUpdate(1);
            await expectApplied(image);

            expect({ seen, actions: provider.applyUpdateResponses.map(({ action }) => action) }).deep.equals({
                seen: [OtaUpdateStatus.Applying],
                actions: [OtaSoftwareUpdateProvider.ApplyUpdateAction.Proceed],
            });
        }).timeout(10_000);

        for (const { state, cancels } of [
            { state: "announcing", cancels: true },
            { state: "failed", cancels: true },
            { state: "applying", cancels: false },
        ] as const) {
            it(`${cancels ? "cancels" : "keeps"} the BDX transfer of a node when all its consents are removed while its update is ${state}`, async () => {
                const ota = await initSiteWithoutTestImages();
                const { otaProvider } = ota;
                const peerAddress = PeerAddress(ota.peerAddress);
                await using _localSite = ota.site;

                await ota.interceptAnnouncements(() => new Promise<void>(() => {}));
                await consentTo(ota, 1);
                const disabled = await otaProvider.act(agent => {
                    const manager = agent.get(SoftwareUpdateManager);
                    if (state === "failed") {
                        manager.dropUndeliverableUpdate(peerAddress, 0);
                    } else if (state === "applying") {
                        reportStatus(manager, peerAddress, 1, OtaUpdateStatus.Applying);
                    }
                    const disabled = new Array<string>();
                    const bdx = manager.env.get(BdxProtocol);
                    const { disablePeerForScope } = bdx;
                    bdx.disablePeerForScope = async (address, storage, force) => {
                        disabled.push(PeerAddress(address).toString());
                        return disablePeerForScope.call(bdx, address, storage, force);
                    };
                    return disabled;
                });
                await otaProvider.act(agent => agent.get(SoftwareUpdateManager).removeConsent(peerAddress));

                expect(disabled).deep.equals(cancels ? [peerAddress.toString()] : []);
            }).timeout(10_000);
        }

        /** Lets the node's BDX transfer run for the manager, and records the BDX registrations it cancels. */
        function standInTransfer(manager: SoftwareUpdateManager, peerAddress: PeerAddress) {
            const bdx = manager.env.get(BdxProtocol);
            const transfer = standInBdxSession(peerAddress);
            bdx.sessionFor = () => transfer.session;
            const cancelled = new Array<string>();
            bdx.disablePeerForScope = async address => {
                cancelled.push(PeerAddress(address).toString());
            };
            return cancelled;
        }

        it("keeps the running BDX transfer of the target when the update is forced again", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider } = ota;
            const peerAddress = PeerAddress(ota.peerAddress);
            await using _localSite = ota.site;

            const announced = await ota.interceptAnnouncements(() => Promise.resolve());
            await ota.forceUpdate(1);
            await MockTime.advance(Seconds(1));
            const cancelled = await otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                deliverOffer(manager, peerAddress, 1);
                return standInTransfer(manager, peerAddress);
            });

            await ota.forceUpdate(1);
            await MockTime.advance(Seconds(1));

            expect({ cancelled, announced: announced.length, phases: await phasesOf(ota) }).deep.equals({
                cancelled: [],
                announced: 1,
                phases: [{ targetSoftwareVersion: 1, state: "progress" }],
            });
        }).timeout(10_000);

        it("refuses a forced update while a delegated BDX transfer of another version runs, and changes no consent", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider } = ota;
            const peerAddress = PeerAddress(ota.peerAddress);
            await using _localSite = ota.site;

            await ota.interceptAnnouncements(() => Promise.resolve());
            const cancelled = await otaProvider.act(agent => {
                const manager = agent.get(SoftwareUpdateManager);
                // As an offer the node obtains consent for itself: no consent, no queued update
                deliverOffer(manager, peerAddress, 2);
                return standInTransfer(manager, peerAddress);
            });

            await expect(ota.forceUpdate(1)).rejectedWith(OtaUpdateError, /transfers version 2 right now/);

            expect({ ...(await consentsAndTargets(ota)), phases: await phasesOf(ota), cancelled }).deep.equals({
                consents: [],
                targets: [],
                phases: [],
                cancelled: [],
            });
        }).timeout(10_000);

        it("refuses a forced update while a BDX transfer of unknown version runs, and changes nothing", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider } = ota;
            const peerAddress = PeerAddress(ota.peerAddress);
            await using _localSite = ota.site;

            await ota.interceptAnnouncements(() => Promise.resolve());
            await consentTo(ota, 1);
            await MockTime.advance(Seconds(1));
            await MockTime.macrotasks;
            await otaProvider.act(agent => {
                const bdx = agent.get(SoftwareUpdateManager).env.get(BdxProtocol);
                const transfer = standInBdxSession(peerAddress);
                bdx.sessionFor = () => transfer.session;
            });
            await expect(ota.forceUpdate(2)).rejectedWith(
                OtaUpdateError,
                /transfers an update of unknown version right now/,
            );

            expect({ ...(await consentsAndTargets(ota)), phases: await phasesOf(ota) }).deep.equals({
                consents: [1],
                targets: [1],
                phases: [{ targetSoftwareVersion: 1, state: "announced" }],
            });
        }).timeout(10_000);

        it("announces the next node's update when the update of a node leaves the queue as its consent is removed", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider } = ota;
            const peerAddress = PeerAddress(ota.peerAddress);
            await using _localSite = ota.site;

            const other = await ota.addSecondDevice();
            const announced = await ota.interceptAnnouncements(() => new Promise<void>(() => {}));
            await consentTo(ota, 1);
            await other.consentTo(1);
            await other.close();
            const announcedBefore = announced.length;
            await otaProvider.act(agent => agent.get(SoftwareUpdateManager).removeConsent(peerAddress, 1));

            expect(announced.slice(announcedBefore).map(endpoint => endpoint === other.requestor)).deep.equals([true]);
        }).timeout(10_000);

        it("stops the fast resubscription of a node whose update underway is cancelled by removing its consent", async () => {
            const ota = await initSiteWithoutTestImages();
            const { otaProvider } = ota;
            const peerAddress = PeerAddress(ota.peerAddress);
            await using _localSite = ota.site;

            await ota.interceptAnnouncements(() => Promise.resolve());
            await consentTo(ota, 1);
            const disarmed = await otaProvider.act(async agent => {
                const manager = agent.get(SoftwareUpdateManager);
                reportStatus(manager, peerAddress, 1, OtaUpdateStatus.Downloading);
                const disarmed = new Array<string>();
                const armer = new RebootResubscribeArmer(
                    manager.env.get(SessionManager),
                    manager.env.get(ClientSubscriptions),
                );
                armer.disarm = (address: PeerAddress) => disarmed.push(PeerAddress(address).toString());
                manager.internal.rebootResubscribeArmer = armer;
                await manager.removeConsent(peerAddress, 1);
                return disarmed;
            });

            expect(disarmed).deep.equals([peerAddress.toString()]);
        }).timeout(10_000);

        const { BdxSynchronous, Https } = OtaSoftwareUpdateProvider.DownloadProtocol;
        for (const { what, protocolsSupported, httpsUri, status, transfer } of [
            {
                what: "DownloadProtocolNotSupported to a requestor without BDX when the update has no HTTPS URI",
                protocolsSupported: [Https],
                httpsUri: undefined,
                status: OtaSoftwareUpdateProvider.Status.DownloadProtocolNotSupported,
                transfer: "none",
            },
            {
                what: "DownloadProtocolNotSupported to a requestor without BDX and HTTPS when the update has an HTTPS URI",
                protocolsSupported: [],
                httpsUri: "https://example.com/ota.bin",
                status: OtaSoftwareUpdateProvider.Status.DownloadProtocolNotSupported,
                transfer: "none",
            },
            {
                what: "the HTTPS URI to a requestor without BDX, without a BDX registration",
                protocolsSupported: [Https],
                httpsUri: "https://example.com/ota.bin",
                status: OtaSoftwareUpdateProvider.Status.UpdateAvailable,
                transfer: "https",
            },
            {
                what: "a BDX URI to a requestor with BDX and HTTPS when the update has an HTTPS URI",
                protocolsSupported: [BdxSynchronous, Https],
                httpsUri: "https://example.com/ota.bin",
                status: OtaSoftwareUpdateProvider.Status.UpdateAvailable,
                transfer: "bdx",
            },
        ]) {
            it(`answers ${what}`, async () => {
                const ota = await initSiteWithoutTestImages({
                    rewriteQueryImageRequest: request => ({ ...request, protocolsSupported }),
                    answerQueryWith: (_manager, _peerAddress, details) => details && { ...details, httpsUri },
                });
                const { otaProvider, provider } = ota;
                const peerAddress = PeerAddress(ota.peerAddress);
                await using _localSite = ota.site;

                await ota.storeImage(1, "prod");
                const enabled = await otaProvider.act(agent => {
                    const enabled = new Array<string>();
                    const bdx = agent.get(SoftwareUpdateManager).env.get(BdxProtocol);
                    const { enablePeerForScope } = bdx;
                    bdx.enablePeerForScope = (address, storage, options) => {
                        enabled.push(PeerAddress(address).toString());
                        return enablePeerForScope.call(bdx, address, storage, options);
                    };
                    return enabled;
                });
                await ota.forceUpdate(1);
                await MockTime.resolve(provider.queryImageAnsweredPromise);
                const [answer] = provider.queryImageResponses;

                expect({
                    status: answer.status,
                    transfer: answer.imageUri?.startsWith("bdx://")
                        ? "bdx"
                        : answer.imageUri === httpsUri && httpsUri !== undefined
                          ? "https"
                          : "none",
                    enabled,
                    answered: await otaProvider.act(agent =>
                        agent
                            .get(SoftwareUpdateManager)
                            .internal.attempts.of(peerAddress)
                            .map(({ answered }) => answered),
                    ),
                }).deep.equals({
                    status,
                    transfer,
                    enabled: transfer === "bdx" ? [peerAddress.toString()] : [],
                    answered: transfer === "none" ? [] : [true],
                });
            }).timeout(10_000);
        }

        it("reports Querying for an offer once the consent it waited for is granted", async () => {
            const ota = await initSiteWithoutTestImages({ requireConsent: true, lateConsent: "recorded-again" });
            await using _localSite = ota.site;

            await ota.storeImage(1, "prod");
            const statuses = new Array<OtaUpdateStatus>();
            const { offerAnswered } = SoftwareUpdateManager.prototype;
            SoftwareUpdateManager.prototype.offerAnswered = function (query) {
                statuses.push(query.status);
                offerAnswered.call(this, query);
            };
            try {
                await ota.forceUpdate(1);
                await MockTime.resolve(ota.provider.queryImageAnsweredPromise);
            } finally {
                SoftwareUpdateManager.prototype.offerAnswered = offerAnswered;
            }

            expect(statuses).deep.equals([OtaUpdateStatus.Querying]);
        }).timeout(10_000);

        it("refuses a forced update to a version below the one the node runs, without changing anything", async () => {
            const ota = await initSiteWithoutTestImages();
            const { device, controller } = ota;
            await using _localSite = ota.site;

            const versionChanged = new Promise<void>(resolve => {
                controller.peers
                    .get("peer1")!
                    .eventsOf(BasicInformationClient)
                    .softwareVersion$Changed.once(() => resolve());
            });
            await device.setStateOf(BasicInformationServer, { softwareVersion: 2 });
            await MockTime.resolve(versionChanged);
            const events = await recordOutcomes(ota);
            await expect(ota.forceUpdate(1)).rejectedWith(OtaUpdateError, "not below the target");
            expect(events).deep.equals([]);
            expect(await consentsTargetsAndCoverage(ota)).deep.equals({
                consents: [],
                targets: [],
                everyTargetConsented: true,
            });
        }).timeout(10_000);
    });

    // TODO Add more test cases for edge cases and error cases, also split out setup into helpers
});
