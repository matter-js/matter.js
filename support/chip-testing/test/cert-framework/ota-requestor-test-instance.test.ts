/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    createPromise,
    Millis,
    PromiseTimeoutError,
    Seconds,
    StandardCrypto,
    Time,
    withTimeout,
} from "@matter/general";
import { OtaSoftwareUpdateRequestorServer } from "@matter/main/behaviors/ota-software-update-requestor";
import { OtaImageWriter } from "@matter/main/protocol";
import { NodeId, VendorId } from "@matter/main/types";
import type { CertNodeRef } from "@matter/testing";
import { OtaSoftwareUpdateRequestor } from "@matter/types/clusters/ota-software-update-requestor";
import { expect } from "chai";
import { InProcessControllerAdapter } from "../../src/cert/InProcessControllerAdapter.js";
import {
    OtaRequestorTestInstance,
    REBOOT_AFTER_APPLY_ARG,
    SPEC_INTERVALS_ARG,
    verifyOtaTestTransfer,
} from "../../src/OtaRequestorTestInstance.js";
import {
    OTA_TEST_PAYLOAD_SIZE,
    OTA_TEST_PRODUCT_ID,
    OTA_TEST_SOFTWARE_VERSION,
    OTA_TEST_VENDOR_ID,
    otaTestPayload,
    otaTestSoftwareVersionString,
} from "../../src/OtaTestIdentity.js";
import { runCleanups } from "../cert/tc-support.js";

/** The endpoint {@link OtaRequestorTestInstance} assigns its OTA Requestor device type. */
const OTA_REQUESTOR_ENDPOINT = 1;

const OTA_REQUESTOR_CLUSTER_ID = OtaSoftwareUpdateRequestor.Cluster.id;
const STATE_TRANSITION_EVENT_ID = OtaSoftwareUpdateRequestor.Cluster.events.stateTransition.id;
const UPDATE_STATE_ATTRIBUTE_ID = OtaSoftwareUpdateRequestor.Cluster.attributes.updateState.id;

/** The name `UpdateState` gives a reported state, for a failure message. */
function stateName(state: unknown) {
    return typeof state === "number" ? (OtaSoftwareUpdateRequestor.UpdateState[state] ?? `${state}`) : String(state);
}

/** `QueryStatus` Busy (Matter Core § 11.20.6.5.2). */
const OTA_STATUS_BUSY = 1;

/** Kept clear of the 5540 every other subject defaults to, so a start here cannot lose a port race. */
const REQUESTOR_PORT = 5560;
const REQUESTOR_DISCRIMINATOR = 3860;
const REQUESTOR_PASSCODE = 20202021;

const crypto = new StandardCrypto();

/** An OTA file as {@link OtaProviderTestInstance} stages it, unless an option overrides part of it. */
async function testOtaImage(
    options: { softwareVersionString?: string; payload?: Uint8Array; softwareVersion?: number } = {},
) {
    const {
        softwareVersion = OTA_TEST_SOFTWARE_VERSION,
        softwareVersionString = otaTestSoftwareVersionString("spec"),
        payload = otaTestPayload(),
    } = options;

    const { image } = await OtaImageWriter.create(crypto, {
        vendorId: OTA_TEST_VENDOR_ID,
        productId: OTA_TEST_PRODUCT_ID,
        softwareVersion,
        softwareVersionString,
        minApplicableSoftwareVersion: 0,
        maxApplicableSoftwareVersion: softwareVersion - 1,
        payload,
    });

    return Bytes.of(image);
}

/** The copy re-types the view onto a plain `ArrayBuffer`, which `BlobPart` requires. */
function blobOf(bytes: Uint8Array) {
    return new Blob([new Uint8Array(bytes)]);
}

describe("verifyOtaTestTransfer", () => {
    it("accepts the image OtaProviderTestInstance stages", async () => {
        const header = await verifyOtaTestTransfer(crypto, blobOf(await testOtaImage()), OTA_TEST_SOFTWARE_VERSION);

        expect(header.softwareVersion).equal(OTA_TEST_SOFTWARE_VERSION);
        expect(Number(header.payloadSize)).equal(OTA_TEST_PAYLOAD_SIZE);
    });

    it("rejects a payload with a single byte altered", async () => {
        const image = await testOtaImage();

        // Past the header, so the digest the header carries no longer describes the payload
        image[image.byteLength - 1] ^= 0xff;

        await expect(verifyOtaTestTransfer(crypto, blobOf(image), OTA_TEST_SOFTWARE_VERSION)).to.be.rejectedWith(
            /digest mismatch/,
        );
    });

    it("rejects a truncated transfer", async () => {
        const image = await testOtaImage();

        await expect(
            verifyOtaTestTransfer(
                crypto,
                blobOf(image.subarray(0, image.byteLength - 1024)),
                OTA_TEST_SOFTWARE_VERSION,
            ),
        ).to.be.rejectedWith(/size mismatch/);
    });

    it("rejects an all-zero payload of the right length", async () => {
        const image = await testOtaImage({ payload: new Uint8Array(OTA_TEST_PAYLOAD_SIZE) });

        await expect(verifyOtaTestTransfer(crypto, blobOf(image), OTA_TEST_SOFTWARE_VERSION)).to.be.rejectedWith(
            /does not carry the staged payload/,
        );
    });

    it("rejects a payload of the wrong length", async () => {
        const image = await testOtaImage({ payload: otaTestPayload(1024) });

        await expect(verifyOtaTestTransfer(crypto, blobOf(image), OTA_TEST_SOFTWARE_VERSION)).to.be.rejectedWith(
            /carries 1024 payload bytes, expected/,
        );
    });

    it("rejects an image that is not the version the provider announced", async () => {
        const image = await testOtaImage();

        await expect(verifyOtaTestTransfer(crypto, blobOf(image), OTA_TEST_SOFTWARE_VERSION + 1)).to.be.rejectedWith(
            /but the provider announced/,
        );
    });

    it("accepts a foreign provider's image, whose payload this process cannot predict", async () => {
        const payload = new Uint8Array(2048);
        payload.fill(0xa5);
        const image = await testOtaImage({ softwareVersionString: "chip-ota-test-image", payload });

        const header = await verifyOtaTestTransfer(crypto, blobOf(image), OTA_TEST_SOFTWARE_VERSION);

        expect(header.softwareVersionString).equal("chip-ota-test-image");
    });

    it("rejects a foreign provider's image with no payload", async () => {
        const image = await testOtaImage({ softwareVersionString: "chip-ota-test-image", payload: new Uint8Array(0) });

        await expect(verifyOtaTestTransfer(crypto, blobOf(image), OTA_TEST_SOFTWARE_VERSION)).to.be.rejectedWith(
            /carries no payload/,
        );
    });
});

describe("OtaRequestorTestInstance", () => {
    it("exposes OtaSoftwareUpdateRequestorServer on its own endpoint, below the root", async () => {
        const instance = new OtaRequestorTestInstance({ commandPipeFactory: async () => {} });
        await instance.initialize();
        try {
            const endpoint = instance.node.parts.get("ota-requestor");
            expect(endpoint, "the subject adds an ota-requestor part").not.undefined;
            expect(endpoint!.number).equal(OTA_REQUESTOR_ENDPOINT);
            expect(endpoint!.behaviors.has(OtaSoftwareUpdateRequestorServer)).equal(true);
        } finally {
            await instance.close();
        }
    });

    it("reports an identity that tells it apart from another subject on the same fabric", async () => {
        const one = new OtaRequestorTestInstance({ domain: "identity-one", commandPipeFactory: async () => {} });
        const two = new OtaRequestorTestInstance({ domain: "identity-two", commandPipeFactory: async () => {} });
        await one.initialize();
        try {
            await two.initialize();
            try {
                const first = one.node.state.basicInformation;
                const second = two.node.state.basicInformation;

                expect(first.uniqueId).not.equal(second.uniqueId);
                expect(first.serialNumber).not.equal(second.serialNumber);

                // The Basic Information cluster requires the two to differ
                expect(first.uniqueId).not.equal(first.serialNumber);
            } finally {
                await two.close();
            }
        } finally {
            await one.close();
        }
    });

    it("commissions, comes online, and accepts an OTA provider announcement", async function () {
        this.timeout(30_000);

        // Setup is inside the guarded scope, not before it: a node this test started and then failed to
        // commission still holds its port, and the next test blames mDNS for it.
        let device: OtaRequestorTestInstance | undefined;
        let adapter: InProcessControllerAdapter | undefined;
        let ref: CertNodeRef | undefined;
        let bodyFailure: unknown;
        try {
            device = new OtaRequestorTestInstance({
                domain: `ota-requestor-test-${Math.random().toString(36).slice(2)}`,
                commandPipeFactory: async () => {},
                discriminator: REQUESTOR_DISCRIMINATOR,
                passcode: REQUESTOR_PASSCODE,
                port: REQUESTOR_PORT,
            });
            await device.initialize();
            await device.start();

            // NodeTestInstance.start() logs a start failure and returns normally, so without this a port
            // already in use would surface a minute later as a commissioning timeout blaming mDNS.
            expect(device.node.lifecycle.isOnline, "the subject is listening after start()").equal(true);

            adapter = new InProcessControllerAdapter("ota-requestor-dut");
            await adapter.start();

            ref = await adapter.commission({ passcode: REQUESTOR_PASSCODE, discriminator: REQUESTOR_DISCRIMINATOR });
            const node = adapter.node(ref);

            const endpoints = await node.clientEndpoints();
            const requestorEndpoint = endpoints.find(entry => entry.endpoint === OTA_REQUESTOR_ENDPOINT);
            expect(requestorEndpoint, "the peer reports its OTA requestor endpoint").not.undefined;

            // The command is Administer-scoped, so the commissioner (which already holds Administer on the
            // fabric it just created) can invoke it directly without any additional access grant — unlike
            // OtaProviderTestInstance's QueryImage, which a non-admin peer must also be able to reach.
            await node.invoke(
                "OtaSoftwareUpdateRequestor",
                "announceOtaProvider",
                {
                    providerNodeId: NodeId(1),
                    vendorId: VendorId(0xfff1),
                    announcementReason: OtaSoftwareUpdateRequestor.AnnouncementReason.SimpleAnnouncement,
                    endpoint: 1,
                },
                OTA_REQUESTOR_ENDPOINT,
            );
        } catch (error) {
            bodyFailure = error;
        }

        // Every cleanup runs, in teardown order, even if an earlier one throws. A cleanup failure
        // replaces a passing body's result, but never a failing one — the body's own error is the
        // actual defect under test, and a cleanup failure on top of it is logged instead of thrown.
        try {
            await runCleanups(
                () =>
                    ref === undefined || adapter === undefined ? Promise.resolve() : adapter.node(ref).decommission(),
                () => adapter?.close() ?? Promise.resolve(),
                () => device?.close() ?? Promise.resolve(),
            );
        } catch (cleanupFailure) {
            if (bodyFailure === undefined) {
                throw cleanupFailure;
            }
            console.warn("OtaRequestorTestInstance cleanup failed after the test body already failed:", cleanupFailure);
        }

        if (bodyFailure !== undefined) {
            throw bodyFailure;
        }
    });

    // A provider that answers Busy asks the requestor to come back, and the requestor schedules that retry.
    // UpdateState has to say so: reporting Idle describes a requestor with nothing outstanding.
    it("stays DelayedOnQuery while it waits out a Busy answer", async function () {
        this.timeout(45_000);

        let device: OtaRequestorTestInstance | undefined;
        let adapter: InProcessControllerAdapter | undefined;
        let ref: CertNodeRef | undefined;
        let bodyFailure: unknown;
        try {
            device = new OtaRequestorTestInstance({
                domain: `ota-requestor-test-${Math.random().toString(36).slice(2)}`,
                commandPipeFactory: async () => {},
                discriminator: REQUESTOR_DISCRIMINATOR,
                passcode: REQUESTOR_PASSCODE,
                port: REQUESTOR_PORT,

                // The wait is the point: a run that shortens the requestor's floors re-queries within a
                // second, is answered for real, and is back to Idle before the read below
                appArgs: [SPEC_INTERVALS_ARG],
            });
            await device.initialize();
            await device.start();
            expect(device.node.lifecycle.isOnline, "the subject is listening after start()").equal(true);

            adapter = new InProcessControllerAdapter("ota-requestor-dut");
            await adapter.start();

            ref = await adapter.commission({ passcode: REQUESTOR_PASSCODE, discriminator: REQUESTOR_DISCRIMINATOR });
            const node = adapter.node(ref);

            // announceOtaProvider returns once the provider recorded its answer, before the requestor handled
            // it. The event says the requestor did; it is recorded before the requestor's transaction commits,
            // so the attribute is read until the commit makes the state visible.
            const states = new Array<unknown>();
            const delayed = createPromise<void>();
            await node.observeEvents([{ cluster: OTA_REQUESTOR_CLUSTER_ID, event: STATE_TRANSITION_EVENT_ID }], {
                onUpdate: ({ value }) => {
                    const newState =
                        typeof value === "object" && value !== null && "newState" in value ? value.newState : undefined;
                    states.push(newState);
                    if (newState === OtaSoftwareUpdateRequestor.UpdateState.DelayedOnQuery) {
                        delayed.resolver();
                    }
                },
            });

            await node.scriptOtaProvider({ queryImage: [{ status: OTA_STATUS_BUSY, delayedActionTime: 60 }] });
            await node.announceOtaProvider({ timeoutMs: 20_000 });
            await withTimeout(Seconds(10), delayed.promise, () => {
                throw new PromiseTimeoutError(
                    `No StateTransition into DelayedOnQuery after a Busy answer; states reported: ${states.map(stateName).join(", ")}`,
                );
            });

            const readUpdateState = async () =>
                (
                    await node.readAttributes([
                        { cluster: OTA_REQUESTOR_CLUSTER_ID, attribute: UPDATE_STATE_ATTRIBUTE_ID },
                    ])
                ).map(({ value }) => value);
            const deadline = Time.nowUs + Seconds(5);
            let updateState = await readUpdateState();
            while (updateState[0] !== OtaSoftwareUpdateRequestor.UpdateState.DelayedOnQuery && Time.nowUs < deadline) {
                await Time.sleep("UpdateState commit", Millis(100));
                updateState = await readUpdateState();
            }
            expect(updateState, "UpdateState after a Busy answer").to.deep.equal([
                OtaSoftwareUpdateRequestor.UpdateState.DelayedOnQuery,
            ]);
        } catch (error) {
            bodyFailure = error;
        }

        try {
            await runCleanups(
                () =>
                    ref === undefined || adapter === undefined ? Promise.resolve() : adapter.node(ref).decommission(),
                () => adapter?.close() ?? Promise.resolve(),
                () => device?.close() ?? Promise.resolve(),
            );
        } catch (cleanupFailure) {
            if (bodyFailure === undefined) {
                throw cleanupFailure;
            }
            console.warn("OtaRequestorTestInstance cleanup failed after the test body already failed:", cleanupFailure);
        }

        if (bodyFailure !== undefined) {
            throw bodyFailure;
        }
    });

    // The regression `CertNodeApi.observeEvents` exists for: a requestor enters Applying and then restarts
    // into the version it applied, and a controller drops every session to a peer that reports ShutDown
    // while that peer is still flushing. An observation on a subscription of its own loses the states
    // reported from there on; one on the subscription the controller sustains does not.
    it("reports the states an applying requestor passes through as it shuts down", async function () {
        this.timeout(60_000);

        let device: OtaRequestorTestInstance | undefined;
        let adapter: InProcessControllerAdapter | undefined;
        let ref: CertNodeRef | undefined;
        let bodyFailure: unknown;
        try {
            device = new OtaRequestorTestInstance({
                domain: `ota-requestor-test-${Math.random().toString(36).slice(2)}`,
                commandPipeFactory: async () => {},
                discriminator: REQUESTOR_DISCRIMINATOR,
                passcode: REQUESTOR_PASSCODE,
                port: REQUESTOR_PORT,
                appArgs: [REBOOT_AFTER_APPLY_ARG],
            });
            await device.initialize();
            await device.start();
            expect(device.node.lifecycle.isOnline, "the subject is listening after start()").equal(true);

            adapter = new InProcessControllerAdapter("ota-requestor-dut");
            await adapter.start();

            ref = await adapter.commission({ passcode: REQUESTOR_PASSCODE, discriminator: REQUESTOR_DISCRIMINATOR });
            const node = adapter.node(ref);

            const states = new Array<number>();
            await node.observeEvents([{ cluster: OTA_REQUESTOR_CLUSTER_ID, event: STATE_TRANSITION_EVENT_ID }], {
                onUpdate: event => {
                    const value = event.value;
                    if (typeof value === "object" && value !== null && "newState" in value) {
                        states.push(Number((value as { newState: unknown }).newState));
                    }
                },
            });

            await node.serveOtaUpdate({ expectApply: true, notifyAppliedTimeoutMs: 30_000 });

            // Applying is the last state the requestor reports before it tears down to restart, so it is
            // the one an observation on its own session never receives
            expect(states, "the states the subscriber was told of").to.include(
                OtaSoftwareUpdateRequestor.UpdateState.Applying,
            );
        } catch (error) {
            bodyFailure = error;
        }

        try {
            await runCleanups(
                () =>
                    ref === undefined || adapter === undefined ? Promise.resolve() : adapter.node(ref).decommission(),
                () => adapter?.close() ?? Promise.resolve(),
                () => device?.close() ?? Promise.resolve(),
            );
        } catch (cleanupFailure) {
            if (bodyFailure === undefined) {
                throw cleanupFailure;
            }
            console.warn("OtaRequestorTestInstance cleanup failed after the test body already failed:", cleanupFailure);
        }

        if (bodyFailure !== undefined) {
            throw bodyFailure;
        }
    });

    it("watches a window after the announced query, and reports it", async function () {
        this.timeout(30_000);

        let device: OtaRequestorTestInstance | undefined;
        let adapter: InProcessControllerAdapter | undefined;
        let ref: CertNodeRef | undefined;
        let bodyFailure: unknown;
        try {
            device = new OtaRequestorTestInstance({
                domain: `ota-requestor-observe-${Math.random().toString(36).slice(2)}`,
                commandPipeFactory: async () => {},
                discriminator: REQUESTOR_DISCRIMINATOR,
                passcode: REQUESTOR_PASSCODE,
                port: REQUESTOR_PORT,
            });
            await device.initialize();
            await device.start();
            expect(device.node.lifecycle.isOnline, "the subject is listening after start()").equal(true);

            adapter = new InProcessControllerAdapter("ota-requestor-observe");
            await adapter.start();
            ref = await adapter.commission({ passcode: REQUESTOR_PASSCODE, discriminator: REQUESTOR_DISCRIMINATOR });
            const node = adapter.node(ref);

            const observeMs = 500;
            const before = Time.nowUs;
            const observed = await node.announceOtaProvider({ observeMs });
            const after = Time.nowUs;
            expect(observed.observedMs).least(observeMs);
            expect(observed.exchanges.queryImage).length(1);
            expect(observed.exchanges.queryImage[0].receivedAtMs).within(before, after);

            // Nothing is waited for without an expected query, whatever the requestor does with it
            const unobserved = await node.announceOtaProvider({ expectQuery: false });
            expect(unobserved.observedMs).equal(0);
        } catch (error) {
            bodyFailure = error;
        }

        try {
            await runCleanups(
                () =>
                    ref === undefined || adapter === undefined ? Promise.resolve() : adapter.node(ref).decommission(),
                () => adapter?.close() ?? Promise.resolve(),
                () => device?.close() ?? Promise.resolve(),
            );
        } catch (cleanupFailure) {
            if (bodyFailure === undefined) {
                throw cleanupFailure;
            }
            console.warn("OtaRequestorTestInstance cleanup failed after the test body already failed:", cleanupFailure);
        }

        if (bodyFailure !== undefined) {
            throw bodyFailure;
        }
    });
});
