/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    OtaSoftwareUpdateProviderClient,
    OtaSoftwareUpdateProviderServer,
} from "@matter/main/behaviors/ota-software-update-provider";
import { FabricManager, PeerAddress } from "@matter/main/protocol";
import { EndpointNumber, NodeId } from "@matter/main/types";
import { DclBehavior } from "@matter/node/behaviors/system/dcl";
import { SoftwareUpdateManager } from "@matter/node/behaviors/system/software-update";
import type { CertNodeRef } from "@matter/testing";
import { AccessControl } from "@matter/types/clusters/access-control";
import { OtaSoftwareUpdateProvider } from "@matter/types/clusters/ota-software-update-provider";
import { expect } from "chai";
import { InProcessControllerAdapter } from "../../src/cert/InProcessControllerAdapter.js";
import { OtaProviderTestInstance } from "../../src/OtaProviderTestInstance.js";
import { OtaRequestorTestInstance } from "../../src/OtaRequestorTestInstance.js";
import { OTA_TEST_PRODUCT_ID, OTA_TEST_SOFTWARE_VERSION, OTA_TEST_VENDOR_ID } from "../../src/OtaTestIdentity.js";
import { runCleanups } from "../cert/tc-support.js";

/** The endpoint {@link OtaProviderTestInstance} assigns its OTA Provider device type. */
const OTA_PROVIDER_ENDPOINT = 1;

/** Kept clear of the 5540 every other subject defaults to, so a start here cannot lose a port race. */
const PROVIDER_PORT = 5561;
const PEER_PORT = 5562;
const PROVIDER_DISCRIMINATOR = 3861;
const PEER_DISCRIMINATOR = 3862;
const PROVIDER_PASSCODE = 20202021;
const PEER_PASSCODE = 20202022;

/** `FabricAccessControl` (packages/protocol/src/interaction/FabricAccessControl.ts) treats both the same. */
function admitsAnySubject(subjects: AccessControl.AccessControlEntry["subjects"]): boolean {
    return subjects === null || subjects?.length === 0;
}

describe("OtaProviderTestInstance", () => {
    it("exposes OtaSoftwareUpdateProviderServer on its own endpoint, with test images allowed and a test image staged", async () => {
        const instance = new OtaProviderTestInstance({ commandPipeFactory: async () => {} });
        await instance.initialize();
        try {
            const endpoint = instance.node.parts.get("ota-provider");
            expect(endpoint, "the subject adds an ota-provider part").not.undefined;
            expect(endpoint!.number).equal(OTA_PROVIDER_ENDPOINT);
            expect(endpoint!.behaviors.has(OtaSoftwareUpdateProviderServer)).equal(true);

            expect(endpoint!.stateOf(SoftwareUpdateManager).allowTestOtaImages, "allowTestOtaImages").equal(true);

            const { otaUpdateService } = await instance.node.act(agent => agent.load(DclBehavior));
            const staged = await otaUpdateService.find({
                vendorId: OTA_TEST_VENDOR_ID,
                productId: OTA_TEST_PRODUCT_ID,
                mode: "test",
            });
            expect(staged, "the fixed test image is staged at setup").length.greaterThan(0);
            // The catalog is process-wide, so only the marker this instance stages says the entry is
            // this instance's own rather than one an earlier instance left behind
            expect(
                staged.some(
                    entry =>
                        entry.softwareVersion === OTA_TEST_SOFTWARE_VERSION &&
                        entry.softwareVersionString === instance.stagedSoftwareVersionString,
                ),
                "at the expected version, staged by this instance",
            ).equal(true);
        } finally {
            await instance.close();
        }
    });

    it("shares one image catalog with a provider alive beside it, so the last to stage wins", async () => {
        // Characterization of DclOtaUpdateService's process-wide singleton, which is why a subject cannot
        // rely on a catalog entry being its own — see OtaProviderTestInstance.setupServer()
        const one = new OtaProviderTestInstance({ domain: "shared-catalog-one", commandPipeFactory: async () => {} });
        await one.initialize();
        try {
            const two = new OtaProviderTestInstance({
                domain: "shared-catalog-two",
                commandPipeFactory: async () => {},
            });
            await two.initialize();
            try {
                const { otaUpdateService } = await one.node.act(agent => agent.load(DclBehavior));
                const staged = await otaUpdateService.find({
                    vendorId: OTA_TEST_VENDOR_ID,
                    productId: OTA_TEST_PRODUCT_ID,
                    mode: "test",
                });

                expect(staged.map(entry => entry.softwareVersionString)).deep.equal([two.stagedSoftwareVersionString]);
                expect(one.stagedSoftwareVersionString).not.equal(two.stagedSoftwareVersionString);
            } finally {
                await two.close();
            }
        } finally {
            await one.close();
        }
    });

    it("lets the commissioner grant a fabric member other than itself access to QueryImage, without losing its own Administer entry", async function () {
        this.timeout(60_000);

        // A second commissioned device, standing in for "a fabric member other than the commissioner": the
        // commissioner's default ACL entry is scoped to its own CASE identity, so this device's own NodeId
        // cannot match it even though `adapter` commissions both onto the same fabric. Only the grant this
        // case writes can admit it.
        const provider = new OtaProviderTestInstance({
            domain: `ota-provider-test-${Math.random().toString(36).slice(2)}`,
            commandPipeFactory: async () => {},
            discriminator: PROVIDER_DISCRIMINATOR,
            passcode: PROVIDER_PASSCODE,
            port: PROVIDER_PORT,
        });
        await provider.initialize();
        await provider.start();

        // NodeTestInstance.start() logs a start failure and returns normally, so without this a port
        // already in use would surface a minute later as a commissioning timeout blaming mDNS.
        expect(provider.node.lifecycle.isOnline, "the provider is listening after start()").equal(true);

        const peer = new OtaRequestorTestInstance({
            domain: `ota-provider-test-peer-${Math.random().toString(36).slice(2)}`,
            commandPipeFactory: async () => {},
            discriminator: PEER_DISCRIMINATOR,
            passcode: PEER_PASSCODE,
            port: PEER_PORT,
        });
        await peer.initialize();
        await peer.start();

        expect(peer.node.lifecycle.isOnline, "the peer is listening after start()").equal(true);

        const adapter = new InProcessControllerAdapter("ota-provider-dut");
        await adapter.start();

        // Cleanup runs regardless of what happens in the body, and in every case below: a ref may be
        // set but its decommission fails, or never get set at all because commissioning itself failed.
        let providerRef: CertNodeRef | undefined;
        let peerRef: CertNodeRef | undefined;
        let bodyFailure: unknown;
        try {
            providerRef = await adapter.commission({
                passcode: PROVIDER_PASSCODE,
                discriminator: PROVIDER_DISCRIMINATOR,
            });
            peerRef = await adapter.commission({ passcode: PEER_PASSCODE, discriminator: PEER_DISCRIMINATOR });

            const providerNode = adapter.node(providerRef);

            const endpoints = await providerNode.clientEndpoints();
            const providerEndpoint = endpoints.find(entry => entry.endpoint === OTA_PROVIDER_ENDPOINT);
            expect(providerEndpoint, "the peer reports its OTA provider endpoint").not.undefined;

            const aclPath = {
                endpoint: 0,
                cluster: AccessControl.Cluster.id,
                attribute: AccessControl.Cluster.attributes.acl.id,
            };

            const acl = (await providerNode.readAttribute(aclPath)) as AccessControl.AccessControlEntry[];
            const administerEntry = acl.find(
                entry =>
                    entry.privilege === AccessControl.AccessControlEntryPrivilege.Administer &&
                    entry.authMode === AccessControl.AccessControlEntryAuthMode.Case,
            );
            expect(administerEntry, "commissioning installs the commissioner's own default Administer entry").not
                .undefined;
            expect(
                acl.some(entry => admitsAnySubject(entry.subjects)),
                "the subject grants itself no fabric-wide entry on commissioning; only the commissioner installs one",
            ).equal(false);

            // TC-SU-2.3's Test Setup assigns this to the commissioner: "install necessary ACL entries at
            // commissioning time or later to enable processing of QueryImage commands". The write replaces
            // the whole fabric-scoped list, so the existing entries — including the commissioner's own
            // Administer grant — are read back and kept rather than clobbered.
            await providerNode.writeAttribute(aclPath, [
                ...acl,
                {
                    privilege: AccessControl.AccessControlEntryPrivilege.Operate,
                    authMode: AccessControl.AccessControlEntryAuthMode.Case,
                    subjects: [],
                    targets: [
                        {
                            endpoint: OTA_PROVIDER_ENDPOINT,
                            cluster: OtaSoftwareUpdateProvider.Cluster.id,
                            deviceType: null,
                        },
                    ],
                },
            ]);

            const aclAfterWrite = (await providerNode.readAttribute(aclPath)) as AccessControl.AccessControlEntry[];
            expect(aclAfterWrite, "the commissioner's own Administer entry survives the write").deep.include(
                administerEntry,
            );
            const grant = aclAfterWrite.find(
                entry =>
                    entry.privilege === AccessControl.AccessControlEntryPrivilege.Operate &&
                    entry.authMode === AccessControl.AccessControlEntryAuthMode.Case &&
                    admitsAnySubject(entry.subjects) &&
                    entry.targets?.some(
                        target =>
                            target.endpoint === OTA_PROVIDER_ENDPOINT &&
                            target.cluster === OtaSoftwareUpdateProvider.Cluster.id,
                    ),
            );
            expect(grant, "an anyone-in-fabric Operate grant exists for the OTA provider cluster").not.undefined;

            // `peer` invokes through its own ServerNode's peer connection, under its own NodeId and NOC —
            // never through `adapter`'s commissioner session — so a success here is evidence of the grant
            // just written, not of the commissioner's own Administer privilege.
            const peerFabric = peer.node.env.get(FabricManager).fabrics[0];
            const providerAddress = PeerAddress({
                nodeId: NodeId(providerRef),
                fabricIndex: peerFabric.fabricIndex,
            });
            const providerFromPeer = await peer.node.peers.forAddress(providerAddress);
            const providerEndpointFromPeer = providerFromPeer.endpoints.require(EndpointNumber(OTA_PROVIDER_ENDPOINT));
            providerEndpointFromPeer.behaviors.require(OtaSoftwareUpdateProviderClient);

            const response = await providerEndpointFromPeer.commandsOf(OtaSoftwareUpdateProviderClient).queryImage({
                vendorId: OTA_TEST_VENDOR_ID,
                productId: OTA_TEST_PRODUCT_ID,
                softwareVersion: 1,
                protocolsSupported: [OtaSoftwareUpdateProvider.DownloadProtocol.BdxSynchronous],
                requestorCanConsent: true,
            });

            expect(response.status).equal(OtaSoftwareUpdateProvider.Status.UpdateAvailable);
            expect(response.softwareVersion).equal(OTA_TEST_SOFTWARE_VERSION);
            // Answered from this provider's own staging, not from an entry an earlier instance in this
            // process left in the shared catalog
            expect(response.softwareVersionString).equal(provider.stagedSoftwareVersionString);
        } catch (error) {
            bodyFailure = error;
        }

        // Every cleanup runs, in teardown order, even if an earlier one throws. A cleanup failure
        // replaces a passing body's result, but never a failing one — the body's own error is the
        // actual defect under test, and a cleanup failure on top of it is logged instead of thrown.
        try {
            await runCleanups(
                () => (peerRef === undefined ? Promise.resolve() : adapter.node(peerRef).decommission()),
                () => (providerRef === undefined ? Promise.resolve() : adapter.node(providerRef).decommission()),
                () => adapter.close(),
                () => peer.close(),
                () => provider.close(),
            );
        } catch (cleanupFailure) {
            if (bodyFailure === undefined) {
                throw cleanupFailure;
            }
            console.warn("OtaProviderTestInstance cleanup failed after the test body already failed:", cleanupFailure);
        }

        if (bodyFailure !== undefined) {
            throw bodyFailure;
        }
    });
});
