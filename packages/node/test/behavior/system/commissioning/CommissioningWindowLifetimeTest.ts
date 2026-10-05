/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningServer } from "#behavior/system/commissioning/CommissioningServer.js";
import {
    AdministratorCommissioningClient,
    AdministratorCommissioningServer,
} from "#behaviors/administrator-commissioning";
import { GeneralCommissioningClient } from "#behaviors/general-commissioning";
import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import {
    Crypto,
    CRYPTO_PBKDF_ITERATIONS_MIN,
    Duration,
    Hours,
    MatterFlowError,
    Millis,
    Minutes,
    Seconds,
} from "@matter/general";
import { DeviceCommissioner, PaseClient, PaseServer, SessionManager } from "@matter/protocol";
import { Status, StatusResponseError } from "@matter/types";
import { AdministratorCommissioning } from "@matter/types/clusters/administrator-commissioning";
import { GeneralCommissioning } from "@matter/types/clusters/general-commissioning";
import { MockServerNode } from "../../../node/mock-server-node.js";
import { MockSite } from "../../../node/mock-site.js";
import { subscribedPeer } from "../../../node/node-helpers.js";

const { WindowNotOpen, BasicWindowOpen, EnhancedWindowOpen } = AdministratorCommissioning.CommissioningWindowStatus;

const BasicCapableRootEndpoint = MockServerNode.RootEndpoint.with(AdministratorCommissioningServer.with("Basic"));

/** Sends OpenCommissioningWindow as is, without the pre-emptive revoke of {@link ClientNode.openEnhancedCommissioningWindow}. */
async function sendOpenCommissioningWindow(peer: ClientNode, commissioningTimeout = 180) {
    const crypto = peer.env.get(Crypto);
    const salt = crypto.randomBytes(32);
    const iterations = CRYPTO_PBKDF_ITERATIONS_MIN;
    const pakePasscodeVerifier = await PaseClient.generatePakePasscodeVerifier(crypto, 20202021, {
        iterations,
        salt,
    });
    await peer.act(agent =>
        agent.get(AdministratorCommissioningClient).openCommissioningWindow({
            commissioningTimeout,
            pakePasscodeVerifier,
            discriminator: 1234,
            iterations,
            salt,
        }),
    );
}

async function openCommissioningWindow(peer: ClientNode) {
    await MockTime.resolve(sendOpenCommissioningWindow(peer));
}

function expectBusy(error: unknown) {
    expect(StatusResponseError.is(error, Status.Failure)).true;
    expect(StatusResponseError.of(error)?.clusterCode).equals(AdministratorCommissioning.StatusCode.Busy);
}

function windowStatusOf(device: ServerNode) {
    return device.env.get(DeviceCommissioner).windowStatus;
}

async function elapse(duration: Duration) {
    await MockTime.advance(duration);
    await MockTime.macrotasks;
}

async function openOwnWindow(device: ServerNode) {
    await MockTime.resolve(device.act(agent => agent.get(CommissioningServer).enterCommissionableMode()));
}

describe("Commissioning window lifetime", () => {
    before(() => {
        MockTime.init();
    });

    it("closes the window of an uncommissioned node after 48 hours", async () => {
        await using site = new MockSite();
        const device = await site.addDevice();
        expect(windowStatusOf(device)).equals(BasicWindowOpen);

        await elapse(Millis(Hours(48) - Seconds(1)));
        expect(windowStatusOf(device)).equals(BasicWindowOpen);

        await elapse(Seconds(2));
        expect(windowStatusOf(device)).equals(WindowNotOpen);
    });

    it("closes a window a commissioned node opens itself after 15 minutes", async () => {
        await using site = new MockSite();
        const { device } = await site.addCommissionedPair();

        await openOwnWindow(device);
        expect(windowStatusOf(device)).equals(BasicWindowOpen);

        await elapse(Millis(Minutes(15) - Seconds(1)));
        expect(windowStatusOf(device)).equals(BasicWindowOpen);

        await elapse(Seconds(2));
        expect(windowStatusOf(device)).equals(WindowNotOpen);
    });

    it("restarts a window the node opened itself when the node opens it again", async () => {
        await using site = new MockSite();
        const { device } = await site.addCommissionedPair();

        await openOwnWindow(device);
        await elapse(Minutes(10));
        await openOwnWindow(device);

        await elapse(Millis(Minutes(15) - Seconds(1)));
        expect(windowStatusOf(device)).equals(BasicWindowOpen);

        await elapse(Seconds(2));
        expect(windowStatusOf(device)).equals(WindowNotOpen);
    });

    it("keeps a window the node restarted while the timer of the one it replaced fired", async () => {
        await using site = new MockSite();
        const { device } = await site.addCommissionedPair();
        await openOwnWindow(device);
        await elapse(Millis(Minutes(15) - Millis(50)));

        const restart = device.act(agent => agent.get(CommissioningServer).enterCommissionableMode());
        await elapse(Millis(100));
        await MockTime.resolve(restart);

        expect(windowStatusOf(device)).equals(BasicWindowOpen);
    });

    it("replaces a window the node opened itself with an administrator's enhanced window", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        await openOwnWindow(device);
        expect(device.stateOf(AdministratorCommissioningServer).windowStatus).equals(WindowNotOpen);

        await openCommissioningWindow(peer);
        expect(windowStatusOf(device)).equals(EnhancedWindowOpen);
        expect(device.stateOf(AdministratorCommissioningServer).windowStatus).equals(EnhancedWindowOpen);

        // The administrator's window closes after its own timeout, after which the cluster accepts the next one
        await elapse(Seconds(181));
        expect(windowStatusOf(device)).equals(WindowNotOpen);
        expect(device.stateOf(AdministratorCommissioningServer).windowStatus).equals(WindowNotOpen);

        await openCommissioningWindow(peer);
        expect(windowStatusOf(device)).equals(EnhancedWindowOpen);
    });

    it("replaces a window the node opened itself with an administrator's basic window", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({ device: { type: BasicCapableRootEndpoint } });
        const peer = await subscribedPeer(controller, "peer1");

        await openOwnWindow(device);
        await MockTime.resolve(
            peer.act(agent =>
                agent.get(AdministratorCommissioningClient).openBasicCommissioningWindow({ commissioningTimeout: 180 }),
            ),
        );

        expect(windowStatusOf(device)).equals(BasicWindowOpen);
        expect(device.env.get(DeviceCommissioner).isAdministratorWindowOpen).true;
        expect(device.stateOf(AdministratorCommissioningServer).windowStatus).equals(BasicWindowOpen);

        await elapse(Seconds(181));
        expect(windowStatusOf(device)).equals(WindowNotOpen);
    });

    it("answers Busy while an administrator's window is open", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        await openCommissioningWindow(peer);

        expectBusy(
            await openCommissioningWindow(peer).then(
                () => undefined,
                (error: unknown) => error,
            ),
        );
    });

    it("answers Busy to a second window opened while the first is still opening", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        // Replacing the node's own window makes the first open wait before its window is in place
        await openOwnWindow(device);
        const [first, second] = await MockTime.resolve(
            Promise.allSettled([sendOpenCommissioningWindow(peer), sendOpenCommissioningWindow(peer)]),
        );

        const outcomes = [first, second];
        expect(outcomes.filter(({ status }) => status === "fulfilled")).length(1);
        const rejected = outcomes.find(outcome => outcome.status === "rejected");
        expectBusy(rejected?.reason);
    });

    it("refuses a window the node opens while an administrator's window is still opening", async () => {
        await using site = new MockSite();
        const { device } = await site.addCommissionedPair();
        await openOwnWindow(device);

        const crypto = device.env.get(Crypto);
        const salt = crypto.randomBytes(32);
        const iterations = CRYPTO_PBKDF_ITERATIONS_MIN;
        const verifier = await PaseClient.generatePakePasscodeVerifier(crypto, 20202021, { iterations, salt });
        const paseServer = PaseServer.fromVerificationValue(device.env.get(SessionManager), verifier, {
            iterations,
            salt,
        });

        const commissioner = device.env.get(DeviceCommissioner);
        const [administrator, node] = await MockTime.resolve(
            Promise.allSettled([
                commissioner.allowEnhancedCommissioning(1234, paseServer, { byAdministrator: true }),
                commissioner.allowBasicCommissioning(),
            ]),
        );

        expect(administrator.status).equals("fulfilled");
        expect(node.status === "rejected" && node.reason instanceof MatterFlowError).true;
        expect(windowStatusOf(device)).equals(EnhancedWindowOpen);
    });

    it("opens no window once the commissioner closes during the open", async () => {
        await using site = new MockSite();
        const { device } = await site.addCommissionedPair();
        await openOwnWindow(device);

        const commissioner = device.env.get(DeviceCommissioner);
        const [open] = await MockTime.resolve(
            Promise.allSettled([commissioner.allowBasicCommissioning({ byAdministrator: true }), commissioner.close()]),
        );

        expect(open.status === "rejected" && open.reason instanceof MatterFlowError).true;
        expect(commissioner.windowStatus).equals(WindowNotOpen);
    });

    it("refuses to arm the fail-safe over CASE while a window the node opened itself is open", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        await openOwnWindow(device);
        const response = await MockTime.resolve(
            peer.act(agent =>
                agent.get(GeneralCommissioningClient).armFailSafe({ expiryLengthSeconds: 60, breadcrumb: 1 }),
            ),
        );

        expect(response.errorCode).equals(GeneralCommissioning.CommissioningError.BusyWithOtherAdmin);
    });

    it("lets a close callback open the next window", async () => {
        await using site = new MockSite();
        const { device } = await site.addCommissionedPair();
        const commissioner = device.env.get(DeviceCommissioner);

        await MockTime.resolve(
            commissioner.allowBasicCommissioning({
                timeout: Minutes(3),
                onClose: async () => {
                    await commissioner.endCommissioning();
                    await commissioner.allowBasicCommissioning();
                },
            }),
        );
        await MockTime.resolve(commissioner.endCommissioning());

        expect(windowStatusOf(device)).equals(BasicWindowOpen);
    });

    it("ignores a close after the commissioner closed", async () => {
        await using site = new MockSite();
        const { device } = await site.addCommissionedPair();
        const commissioner = device.env.get(DeviceCommissioner);

        await MockTime.resolve(commissioner.close());
        await MockTime.resolve(commissioner.endCommissioning());
        await MockTime.resolve(commissioner.close());
        await expect(MockTime.resolve(commissioner.allowBasicCommissioning())).rejectedWith(MatterFlowError);
    });

    it("resets the attributes when an administrator's window is revoked", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        await openCommissioningWindow(peer);
        expect(device.stateOf(AdministratorCommissioningServer).adminFabricIndex).not.equals(null);

        await MockTime.resolve(peer.act(agent => agent.get(AdministratorCommissioningClient).revokeCommissioning()));

        const { windowStatus, adminFabricIndex, adminVendorId } = device.stateOf(AdministratorCommissioningServer);
        expect(windowStatus).equals(WindowNotOpen);
        expect(adminFabricIndex).equals(null);
        expect(adminVendorId).equals(null);
    });

    it("closes a window the node opened itself on revoke", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        await openOwnWindow(device);
        await MockTime.resolve(peer.act(agent => agent.get(AdministratorCommissioningClient).revokeCommissioning()));

        expect(windowStatusOf(device)).equals(WindowNotOpen);
    });

    it("keeps an administrator's window when the node tries to open its own", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer = await subscribedPeer(controller, "peer1");

        await openCommissioningWindow(peer);

        await expect(openOwnWindow(device)).rejectedWith(MatterFlowError);
        expect(windowStatusOf(device)).equals(EnhancedWindowOpen);
    });
});
