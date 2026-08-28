/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EndpointBehaviorsError } from "#endpoint/errors.js";
import type { ServerNode } from "#node/ServerNode.js";
import { Crypto, Lifecycle, LogDestination, Logger, LogFormat, LogLevel, MockCrypto, Seconds } from "@matter/general";
import { MockSite } from "@matter/node/testing";
import { FabricNotFoundError } from "@matter/protocol";

interface CapturedMessage {
    level: LogLevel;
    text: string;
}

/**
 * Collect log messages emitted while {@link actor} runs.
 */
async function captureLog<T>(messages: CapturedMessage[], actor: () => Promise<T>) {
    Logger.destinations.capture = LogDestination({
        format: LogFormat.formats.plain,
        write(text, message) {
            messages.push({ level: message.level, text });
        },
    });
    try {
        return await actor();
    } finally {
        delete Logger.destinations.capture;
    }
}

/**
 * Collect promise rejections that escape unhandled.  Supports node and the browser.
 */
function trackUnhandledRejections() {
    const rejections = new Array<unknown>();

    if (typeof process !== "undefined" && typeof process.on === "function") {
        const handler = (reason: unknown) => rejections.push(reason);
        process.on("unhandledRejection", handler);
        return { rejections, [Symbol.dispose]: () => void process.removeListener("unhandledRejection", handler) };
    }

    const handler = (event: PromiseRejectionEvent) => {
        rejections.push(event.reason);
        event.preventDefault();
    };
    globalThis.addEventListener("unhandledrejection", handler);
    return { rejections, [Symbol.dispose]: () => globalThis.removeEventListener("unhandledrejection", handler) };
}

/**
 * Commission an additional device into an existing controller's fabric.
 */
async function commissionAdditionalDevice(site: MockSite, controller: ServerNode) {
    const device = await site.addDevice();

    const controllerCrypto = controller.env.get(Crypto) as MockCrypto;
    const deviceCrypto = device.env.get(Crypto) as MockCrypto;
    controllerCrypto.entropic = deviceCrypto.entropic = true;

    const { passcode, discriminator } = device.state.commissioning;
    await MockTime.resolve(controller.peers.commission({ passcode, discriminator, timeout: Seconds(90) }), {
        macrotasks: true,
    });

    controllerCrypto.entropic = deviceCrypto.entropic = false;

    return device;
}

/**
 * Point a persisted peer at a fabric the controller does not have.  This is what a peer store and a fabric store
 * restored from different backups look like.
 */
function orphanPeerFromFabric(storage: Record<string, any>, peerId: string) {
    const key = `nodes.${peerId}.endpoints.0.commissioning`;
    const commissioning = storage[key];
    storage[key] = { ...commissioning, peerAddress: { ...commissioning.peerAddress, fabricIndex: 9 } };
}

/**
 * Restart a node against the storage it left behind.
 */
async function reboot(site: MockSite, id: string) {
    return site.addNode(undefined, { id, device: undefined, commissioning: { enabled: false }, online: false });
}

describe("Peers load failures", () => {
    before(() => {
        MockTime.init();
    });

    it("keeps the fabric's other peers usable when one peer cannot load", async () => {
        using tracker = trackUnhandledRejections();
        await using site = new MockSite();

        const { controller } = await site.addCommissionedPair();
        await commissionAdditionalDevice(site, controller);

        const id = controller.id;
        const storage = site.storageFor(id);
        expect([...controller.peers].map(peer => peer.id)).deep.equals(["peer1", "peer2"]);

        await controller.close();
        orphanPeerFromFabric(storage, "peer1");

        const messages = new Array<CapturedMessage>();
        const { rebooted, broken, healthy } = await captureLog(messages, async () => {
            const rebooted = await reboot(site, id);

            expect([...rebooted.peers].map(peer => peer.id)).deep.equals(["peer1", "peer2"]);

            const broken = rebooted.peers.get("peer1")!;
            const healthy = rebooted.peers.get("peer2")!;
            await expect(broken.construction).rejected;
            return { rebooted, broken, healthy };
        });

        expect(healthy.construction.status).equals(Lifecycle.Status.Active);
        expect(healthy.lifecycle.isCommissioned).true;
        expect(rebooted.peers.commissioned).deep.equals([healthy]);

        // The failure must name the peer's actual problem rather than the internal synchronous-initialization contract
        // it violates as a side effect
        const error = broken.construction.error;
        expect(error).instanceOf(EndpointBehaviorsError);
        expect(
            error instanceof EndpointBehaviorsError &&
                error.errors.some(cause => cause.cause instanceof FabricNotFoundError),
        ).true;
        expect(messages.filter(({ text }) => text.includes("Unsupported async initialization"))).deep.equals([]);

        const warnings = messages.filter(
            ({ level, text }) => level === LogLevel.WARN && text.includes("peer1") && text.includes("failed to load"),
        );
        expect(warnings.length).equals(1);

        await MockTime.resolve(Promise.resolve(), { macrotasks: true });
        expect(tracker.rejections.filter(reason => `${reason}`.includes("Behaviors have errors"))).deep.equals([]);
    });
});
