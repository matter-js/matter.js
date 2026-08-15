/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AdministratorCommissioningClient,
    AdministratorCommissioningServer,
} from "#behaviors/administrator-commissioning";
import type { ClientNode } from "#node/ClientNode.js";
import { Bytes, ImplementationError } from "@matter/general";
import { QrPairingCodeCodec } from "@matter/types";
import { AdministratorCommissioning } from "@matter/types/clusters/administrator-commissioning";
import { MockServerNode } from "../../../node/mock-server-node.js";
import { MockSite } from "../../../node/mock-site.js";
import { subscribedPeer } from "../../../node/node-helpers.js";

/**
 * Replace `openCommissioningWindow` on the runtime prototype of the peer's AdministratorCommissioningClient facade,
 * capturing every call and delegating to the original implementation so the device's window still actually opens.
 */
async function spyOnOpenCommissioningWindow(peer: ClientNode) {
    const proto = await peer.act(agent => Object.getPrototypeOf(agent.get(AdministratorCommissioningClient)));
    const original = proto.openCommissioningWindow;
    const calls = new Array<AdministratorCommissioning.OpenCommissioningWindowRequest>();
    proto.openCommissioningWindow = async function (
        this: unknown,
        request: AdministratorCommissioning.OpenCommissioningWindowRequest,
    ) {
        calls.push(request);
        return original.call(this, request);
    };
    return {
        calls,
        restore: () => {
            proto.openCommissioningWindow = original;
        },
    };
}

/** Same as {@link spyOnOpenCommissioningWindow} but for `openBasicCommissioningWindow`. */
async function spyOnOpenBasicCommissioningWindow(peer: ClientNode) {
    const proto = await peer.act(agent => Object.getPrototypeOf(agent.get(AdministratorCommissioningClient)));
    const original = proto.openBasicCommissioningWindow;
    const calls = new Array<AdministratorCommissioning.OpenBasicCommissioningWindowRequest>();
    proto.openBasicCommissioningWindow = async function (
        this: unknown,
        request: AdministratorCommissioning.OpenBasicCommissioningWindowRequest,
    ) {
        calls.push(request);
        return original.call(this, request);
    };
    return {
        calls,
        restore: () => {
            proto.openBasicCommissioningWindow = original;
        },
    };
}

/** Root endpoint type for a device that advertises the Basic Commissioning feature. */
const BasicCapableRootEndpoint = MockServerNode.RootEndpoint.with(AdministratorCommissioningServer.with("Basic"));

describe("CommissioningClient commissioning-window helpers", () => {
    before(() => {
        MockTime.init();
    });

    describe("openEnhancedCommissioningWindow", () => {
        it("opens a window with a generated verifier and returns pairing codes", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");

            const spy = await spyOnOpenCommissioningWindow(peer);
            try {
                const result = await MockTime.resolve(peer.openEnhancedCommissioningWindow());

                expect(typeof result.manualPairingCode).equals("string");
                expect(typeof result.qrPairingCode).equals("string");

                expect(spy.calls.length).equals(1);
                const [request] = spy.calls;
                expect(Bytes.of(request.pakePasscodeVerifier).length).greaterThan(0);
                expect(Bytes.of(request.salt).length).greaterThan(0);

                // The QR code preserves the full discriminator (the manual code only carries a truncated form), so
                // decode it to confirm the command was invoked with the same generated discriminator we return.
                const [decodedQrData] = QrPairingCodeCodec.decode(result.qrPairingCode);
                expect(decodedQrData.discriminator).equals(request.discriminator);
            } finally {
                spy.restore();
            }
        });

        it("tolerates a WindowNotOpen error on the pre-emptive revoke", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");

            // No window has ever been opened, so the device rejects the pre-emptive revoke with WindowNotOpen. This
            // exercises the tolerance path without needing to fake the error.
            await MockTime.resolve(peer.openEnhancedCommissioningWindow());
        });
    });

    describe("openBasicCommissioningWindow", () => {
        it("throws ImplementationError when the peer does not support the basic feature", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair();
            const peer = await subscribedPeer(controller, "peer1");

            await expect(MockTime.resolve(peer.openBasicCommissioningWindow())).rejectedWith(ImplementationError);
        });

        it("invokes openBasicCommissioningWindow when the peer supports the basic feature", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({ device: { type: BasicCapableRootEndpoint } });
            const peer = await subscribedPeer(controller, "peer1");

            const spy = await spyOnOpenBasicCommissioningWindow(peer);
            try {
                await MockTime.resolve(peer.openBasicCommissioningWindow());
                expect(spy.calls.length).equals(1);
                expect(spy.calls[0].commissioningTimeout).equals(900);
            } finally {
                spy.restore();
            }
        });

        it("tolerates a WindowNotOpen error on the pre-emptive revoke", async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({ device: { type: BasicCapableRootEndpoint } });
            const peer = await subscribedPeer(controller, "peer1");

            await MockTime.resolve(peer.openBasicCommissioningWindow());
        });
    });
});
