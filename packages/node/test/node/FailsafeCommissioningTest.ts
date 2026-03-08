/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Integration tests for commissioning failsafe expiry re-announcement.
 *
 * Verifies that when the failsafe timer expires during a commissioning attempt, the device correctly remains
 * (or returns to being) commissionable. This covers two scenarios:
 *
 * 1. Failsafe expires while a PASE session is active (no addNOC yet).
 *    - rollback() closes the PASE session → sessions.deleted (isPase=true) → DeviceAdvertiser re-announces.
 *
 * 2. Failsafe expires after addNOC + CASE reconnect but before CommissioningComplete.
 *    - PASE was already closed by commission() finally block, so the device re-announced then.
 *    - Rollback closes CASE sessions → sessions.deleted (isPase=false) → new guard prevents spurious re-announce.
 *    - No factory reset (state.commissioned was never true; handleFabricChange sees false→false, no state change).
 */

import { ServerNode } from "#node/ServerNode.js";
import { Crypto, Lifecycle, MockCrypto, Seconds } from "@matter/general";
import {
    Advertiser,
    ControllerCommissioningFlow,
    DeviceAdvertiser,
    DeviceCommissioner,
    FabricManager,
    ServiceDescription,
} from "@matter/protocol";
import { MockSite } from "./mock-site.js";

describe("Failsafe commissioning re-announcement", () => {
    before(() => {
        // MockTime is disabled before each test file by the test harness (Boot.reboot → MockTime.disable()).
        // Re-enable it here so that failsafe timers registered via Time.getTimer() use mock time.
        MockTime.init();
    });

    /**
     * Helper: enable entropy on both nodes (required for real PASE/CASE crypto).
     */
    function enableEntropy(controller: ServerNode, device: ServerNode) {
        const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
        const deviceCrypto = device.env.get(Crypto) as MockCrypto;
        controllerCrypto.entropic = deviceCrypto.entropic = true;
        return () => {
            controllerCrypto.entropic = deviceCrypto.entropic = false;
        };
    }

    /**
     * Returns a Promise that resolves when the given DeviceCommissioner's active FailsafeContext is destroyed
     * (i.e. when the failsafe timer fires and rollback() completes).
     */
    function waitForFailsafeDestroyed(commissioner: DeviceCommissioner): Promise<void> {
        const failsafe = commissioner.failsafeContext;
        return new Promise<void>(resolve => {
            failsafe.construction.change.on(status => {
                if (status === Lifecycle.Status.Destroyed) {
                    resolve();
                }
            });
        });
    }

    /**
     * Lightweight spy advertiser: counts how many times the device broadcasts a commissioning advertisement.
     * Added to the device's DeviceAdvertiser so we can verify MDNS re-announcement without parsing raw UDP packets.
     */
    class CommissioningAdSpy extends Advertiser {
        count = 0;

        protected getAdvertisement(_description: ServiceDescription) {
            return undefined;
        }

        override advertise(description: ServiceDescription, _event: Advertiser.BroadcastEvent) {
            if (ServiceDescription.isCommissioning(description)) {
                this.count++;
            }
            return undefined;
        }
    }

    it("re-announces after failsafe expiry with PASE session active (before addNOC)", async () => {
        // Use explicit try/finally to ensure cleanup even when assertions fail.
        const site = new MockSite();
        try {
            const { controller, device } = await site.addUncommissionedPair();
            const disableEntropy = enableEntropy(controller, device);

            const { passcode, discriminator } = device.state.commissioning;
            const commissioner = device.env.get(DeviceCommissioner);

            // Install a spy advertiser so we can verify the commissionable re-announcement via MDNS.
            const adSpy = new CommissioningAdSpy();
            device.env.get(DeviceAdvertiser).addAdvertiser(adSpy);

            /**
             * Flow that signals when the PASE session is established (and the device has auto-armed the
             * failsafe), then hangs until explicitly cancelled.  This keeps the PASE session alive when we
             * advance mock time to expire the failsafe — the "active PASE session" scenario.
             *
             * When cancelled (by rejecting the held promise), executeCommissioning() throws so that
             * commission() fails cleanly and the controller removes the uncommissioned peer entry.
             */
            let signalPaseReady!: () => void;
            const paseReady = new Promise<void>(resolve => (signalPaseReady = resolve));

            let cancelFlow!: (err: Error) => void;

            class PauseAtPaseFlow extends ControllerCommissioningFlow {
                override async executeCommissioning() {
                    // Notify test that PASE is established and the device has auto-armed the failsafe.
                    signalPaseReady();
                    // Hang until the test cancels us (after expiring the failsafe).
                    await new Promise<void>((_, reject) => (cancelFlow = reject));
                }
            }

            // Start commissioning.  The flow pauses inside executeCommissioning() once PASE is up.
            const commissionPromise = controller.peers.commission({
                passcode,
                discriminator,
                commissioningFlowImpl: PauseAtPaseFlow,
                timeout: Seconds(90),
            });

            // Wait until the device has established the PASE session and auto-armed the failsafe.
            await MockTime.resolve(paseReady, { macrotasks: true });

            expect(commissioner.isFailsafeArmed).to.equal(true);
            expect(device.state.commissioning.commissioned).to.equal(false);

            // Set up a signal that fires once rollback() completes and the FailsafeContext is destroyed.
            // Must be set up before advancing time to avoid a race condition.
            const failsafeGone = waitForFailsafeDestroyed(commissioner);

            // Reset spy counter: we only care about advertisements triggered by the failsafe expiry.
            adSpy.count = 0;

            // Advance mock time step-by-step until the failsafe fires and rollback() completes.
            //
            // We use MockTime.resolve() here (not a single large advance) because #handleAddedPaseSessions
            // runs asynchronously after the PASE session is added, and the failsafe timer is registered as
            // part of that async work.  A single large advance might run before the timer is registered.
            //
            // When the failsafe expires, rollback():
            //   1. No addNOC → fabricIndex is undefined → fabric step skipped.
            //   2. closePaseSession() → sessions.deleted (isPase=true) → DeviceAdvertiser re-announces ✓.
            await MockTime.resolve(failsafeGone, { macrotasks: true });

            disableEntropy();

            // Device must remain online and in commissioning mode (no factory reset; no fabric was added).
            expect(commissioner.isFailsafeArmed).to.equal(false);
            expect(device.lifecycle.isOnline).to.equal(true);
            expect(device.state.commissioning.commissioned).to.equal(false);

            // The device must have re-announced as commissionable via MDNS after the PASE session closed.
            expect(adSpy.count).to.be.greaterThan(0);

            // Cancel the paused flow so commission() rejects and the uncommissioned peer entry is removed.
            cancelFlow(new Error("flow cancelled by test after failsafe expiry"));
            await commissionPromise.catch(() => {});
        } finally {
            await site.close();
        }
    });

    it("re-announces after failsafe expiry with CASE session after addNOC (before CommissioningComplete)", async () => {
        const site = new MockSite();
        try {
            const { controller, device } = await site.addUncommissionedPair();
            const disableEntropy = enableEntropy(controller, device);

            const { passcode, discriminator } = device.state.commissioning;
            const commissioner = device.env.get(DeviceCommissioner);

            // Install a spy advertiser to track when the device broadcasts commissionable announcements.
            const adSpy = new CommissioningAdSpy();
            device.env.get(DeviceAdvertiser).addAdvertiser(adSpy);

            /**
             * A commissioning flow that runs all standard steps up to and including the CASE reconnect ("Reconnect")
             * but skips CommissioningComplete and post-commissioning steps.
             *
             * After this flow exits:
             * - The device has a provisionally added fabric and an active CASE session.
             * - The failsafe is still armed (CommissioningComplete was not called).
             * - The device's PASE session is still open (the controller closes its own ephemeral session,
             *   but the device's PASE session is only closed by rollback when the failsafe fires).
             *
             * When the failsafe subsequently expires:
             * - rollback() step 1: Fabric.delete() → closes CASE sessions (fabric-scoped) →
             *     sessions.deleted(isPase=false, fabric≠undefined) → DeviceAdvertiser takes the operational
             *     path → no commissioning re-announcement (guard not even reached).
             * - rollback() step 2: closePaseSession() → closes the PASE session →
             *     sessions.deleted(isPase=true, fabric=undefined) → guard passes →
             *     DeviceAdvertiser.#startCommissioningAdvertisement() → adSpy.count++.
             * - FailsafeContext destroyed → handleFabricChange(fabricIndex, "added"):
             *   commissioned (fabrics.length=0) == this.state.commissioned (false) → no state change,
             *   no factory reset, no decommissioned event.
             */
            class SkipCompleteFlow extends ControllerCommissioningFlow {
                override async executeCommissioning() {
                    const stepsToSkip = [
                        "GeneralCommissioning.Complete",
                        "OperationalCredentials.UpdateFabricLabel",
                        "AdditionalLogic.AddDefaultOtaProvider",
                    ];
                    for (let i = this.commissioningSteps.length - 1; i >= 0; i--) {
                        if (stepsToSkip.includes(this.commissioningSteps[i].name)) {
                            this.commissioningSteps.splice(i, 1);
                        }
                    }
                    await super.executeCommissioning();
                }
            }

            // Commission through the Reconnect step (addNOC + CASE).  CommissioningComplete is intentionally
            // skipped so the failsafe remains armed and the fabric is only provisional (not yet persisted).
            //
            // Note: the controller force-closes its own PASE session in the finally block, but the device's
            // PASE session remains open until rollback explicitly closes it.  So adSpy.count is still 0 here.
            await MockTime.resolve(
                controller.peers.commission({
                    passcode,
                    discriminator,
                    commissioningFlowImpl: SkipCompleteFlow,
                    timeout: Seconds(90),
                }),
                { macrotasks: true },
            );

            // addNOC was called so a provisional fabric exists in FabricManager.
            // device.state.commissioning.commissioned is still false because handleFabricChange only fires
            // when the FailsafeContext is DESTROYED — which hasn't happened yet (Complete was skipped).
            expect(device.env.get(FabricManager).fabrics.length).to.equal(1);
            expect(commissioner.isFailsafeArmed).to.equal(true);

            // Set up a signal that fires once rollback() completes and the FailsafeContext is destroyed.
            // Must be set up before advancing time to avoid a race condition.
            const failsafeGone = waitForFailsafeDestroyed(commissioner);

            // Reset spy counter: we only want to count announcements triggered by the failsafe expiry.
            adSpy.count = 0;

            // Advance mock time step-by-step until the failsafe fires and rollback() completes.
            // See scenario 1 comment above for why we use MockTime.resolve() rather than a single advance().
            await MockTime.resolve(failsafeGone, { macrotasks: true });

            disableEntropy();

            // After rollback: provisional fabric is removed.  No factory reset occurred because
            // device.state.commissioning.commissioned was already false (CommissioningComplete was skipped),
            // so handleFabricChange sees no state transition.  Device remains online and in commissioning mode.
            expect(device.env.get(FabricManager).fabrics.length).to.equal(0);
            expect(device.state.commissioning.commissioned).to.equal(false);
            expect(device.lifecycle.isOnline).to.equal(true);

            // The PASE session close during rollback MUST have triggered a commissionable re-announcement
            // (sessions.deleted with isPase=true reaches #startCommissioningAdvertisement).
            expect(adSpy.count).to.be.greaterThan(0);

            // The CASE session close that happens earlier in rollback (inside fabric.delete()) must NOT have
            // triggered an additional spurious re-announcement.  In the sessions.deleted handler the CASE
            // session has fabric≠undefined, so the handler takes the operational path and returns before
            // reaching the isPase guard.  Had the CASE close also triggered #startCommissioningAdvertisement,
            // the count would be 2 instead of 1.
            expect(adSpy.count).to.equal(1);
        } finally {
            await site.close();
        }
    });
});
