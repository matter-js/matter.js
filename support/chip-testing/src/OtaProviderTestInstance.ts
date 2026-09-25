/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Filesystem, MockFilesystem, StandardCrypto } from "@matter/general";
import { Endpoint, Node, ServerNode } from "@matter/main";
import { AdministratorCommissioningServer } from "@matter/main/behaviors/administrator-commissioning";
import { NetworkCommissioningServer } from "@matter/main/behaviors/network-commissioning";
import { OtaSoftwareUpdateProviderServer } from "@matter/main/behaviors/ota-software-update-provider";
import { AdministratorCommissioning, NetworkCommissioning } from "@matter/main/clusters";
import { OtaProviderEndpoint } from "@matter/main/endpoints/ota-provider";
import type { PeerAddress } from "@matter/main/protocol";
import { FileDesignator, OtaImageWriter } from "@matter/main/protocol";
import { DeviceTypeId } from "@matter/main/types";
import { DclBehavior } from "@matter/node/behaviors/system/dcl";
import { SoftwareUpdateManager, type OtaUpdateAvailableDetails } from "@matter/node/behaviors/system/software-update";
import { OtaSoftwareUpdateProvider } from "@matter/types/clusters/ota-software-update-provider";
import { NodeTestInstance } from "./NodeTestInstance.js";
import {
    OTA_TEST_CURRENT_SOFTWARE_VERSION,
    OTA_TEST_PRODUCT_ID,
    OTA_TEST_SOFTWARE_VERSION,
    OTA_TEST_VENDOR_ID,
    otaTestBasicIdentity,
    otaTestPayload,
    otaTestSoftwareVersionString,
} from "./OtaTestIdentity.js";

const ENDPOINT = {
    otaProvider: 1,
} as const;

/**
 * `SoftwareUpdateManager.updateExistsFor()`'s default candidate lookup only answers a caller it already
 * tracks as a `ClientNode` peer with matching `BasicInformation` (`#validatePeerDetails`) — sound for a
 * controller, which populates that tracking by commissioning every device it might update, but this
 * subject is commissioned as a device and never independently discovers whoever calls it, so that
 * check always fails and every `QueryImage` reads `NotAvailable` regardless of staging. This overrides
 * the documented extension point to answer directly from the request's own claimed vendor/product/
 * version against what is staged, which is the trust model a cert subject actually needs — nothing here
 * has a reason to spoof those fields.
 */
class CertOtaProviderServer extends OtaSoftwareUpdateProviderServer {
    protected override async checkUpdateAvailable(
        request: OtaSoftwareUpdateProvider.QueryImageRequest,
        _peerAddress: PeerAddress,
    ): Promise<OtaUpdateAvailableDetails | undefined> {
        const { vendorId, productId, softwareVersion } = request;

        // DclOtaUpdateService has no Environmental.create factory of its own; it is created as a side
        // effect of loading DclBehavior (the same door SoftwareUpdateManager.initialize() uses), which
        // lives on the root endpoint rather than this one.
        const rootNode = Node.forEndpoint(this.endpoint) as ServerNode;
        const { otaUpdateService } = rootNode.agentFor(this.context).get(DclBehavior);
        const allowTestOtaImages = this.agent.get(SoftwareUpdateManager).state.allowTestOtaImages;

        const candidate = (await otaUpdateService.find({ vendorId, productId }))
            .filter(
                ({
                    softwareVersion: candidateVersion,
                    minApplicableSoftwareVersion = 0,
                    maxApplicableSoftwareVersion = softwareVersion,
                    mode,
                }) =>
                    softwareVersion < candidateVersion &&
                    softwareVersion >= minApplicableSoftwareVersion &&
                    softwareVersion <= maxApplicableSoftwareVersion &&
                    (mode === "prod" || allowTestOtaImages),
            )
            .sort((a, b) => b.softwareVersion - a.softwareVersion)[0];
        if (candidate === undefined) {
            return undefined;
        }

        return {
            newSoftwareVersion: candidate.softwareVersion,
            newSoftwareVersionString: candidate.softwareVersionString,
            fileDesignator: new FileDesignator(`ota/${candidate.filename}`),
            consentRequired: false,
        };
    }
}

/**
 * A commissionable device exposing {@link OtaSoftwareUpdateProviderServer} on an
 * {@link OtaProviderEndpoint}, with a staged test OTA image ready to serve over BDX.
 *
 * `OtaSoftwareUpdateProviderServer`'s own fabric-wide ACL grant only fires for a fabric this node's
 * own `CertificateAuthority` issued (`FabricAuthority.fabrics` means "fabrics this node controls", not
 * "fabrics this node belongs to"). This subject is commissioned as a plain device by an external
 * commissioner instead, so that grant never happens here: the commissioner must install the ACL entry
 * that lets a peer other than itself invoke `QueryImage` (TC-SU-2.3's Test Setup assigns exactly this
 * to the commissioner). See {@link CertOtaProviderServer} for the independent reason
 * `checkUpdateAvailable` is overridden: the default implementation's peer-tracking requirement can
 * never be satisfied by a device-mode subject either.
 */
export class OtaProviderTestInstance extends NodeTestInstance {
    static override id = "ota-provider-6100";

    /**
     * `softwareVersionString` of the image this instance stages.
     *
     * The image catalog is process-wide (see {@link setupServer}), so this is what says whether a
     * `QueryImage` answer or a catalog entry came from this instance's staging or from another's.
     */
    get stagedSoftwareVersionString() {
        return otaTestSoftwareVersionString(this.id.slice(-20));
    }

    async setupServer(): Promise<ServerNode> {
        // MockStorageService overrides only KV storage, not blob storage: `openBlobStorage` still detects
        // an existing driver from a real `driver.json` under the inherited `Filesystem` service, which
        // without this override is the developer's real `~/.matter/ota` — a directory any earlier real OTA
        // usage on this machine may have already populated.
        //
        // This only takes effect for the first node in a process to resolve DclOtaUpdateService.  The
        // service registers itself in `Environment.root`, which for every NodeTestInstance is the process's
        // `Environment.default`, so a node started while another is still live reuses that node's service
        // and with it its Filesystem and image catalog.  `stagedSoftwareVersionString` exists because of
        // that: staging is keyed on vendor/product/mode/version, so the last instance to stage wins and
        // only the marker says whose image the shared catalog holds.
        if (!this.env.owns(Filesystem)) {
            this.env.set(Filesystem, new MockFilesystem());
        }

        const networkId = new Uint8Array(32);

        const serverNode = await ServerNode.create(
            ServerNode.RootEndpoint.with(
                AdministratorCommissioningServer.with("Basic"),
                NetworkCommissioningServer.with("EthernetNetworkInterface"),
            ),
            {
                id: this.id,
                environment: this.env,
                network: {
                    port: this.config.port ?? 5540,
                    tcp: true,
                    transportPreference: process.env.TEST_PREFER_TCP === "1" ? "tcp" : "udp",
                },
                commissioning: {
                    passcode: this.config.passcode ?? 20202021,
                    discriminator: this.config.discriminator ?? 3840,
                },
                productDescription: {
                    name: this.appName,
                    deviceType: DeviceTypeId(OtaProviderEndpoint.deviceType),
                },
                basicInformation: {
                    vendorName: "Matterjs Test Vendor",
                    vendorId: OTA_TEST_VENDOR_ID,
                    nodeLabel: "",
                    productName: "OTA Provider",
                    productLabel: "OTA Provider",
                    productId: OTA_TEST_PRODUCT_ID,
                    ...otaTestBasicIdentity("provider", this.id),
                    manufacturingDate: "20200101",
                    partNumber: "123456",
                    productUrl: "https://test.com",
                    localConfigDisabled: false,
                    reachable: true,
                },
                administratorCommissioning: {
                    windowStatus: AdministratorCommissioning.CommissioningWindowStatus.WindowNotOpen,
                },
                groupKeyManagement: {
                    maxGroupsPerFabric: 50,
                },
                networkCommissioning: {
                    maxNetworks: 1,
                    interfaceEnabled: true,
                    lastConnectErrorValue: 0,
                    lastNetworkId: networkId,
                    lastNetworkingStatus: NetworkCommissioning.NetworkCommissioningStatus.Success,
                    networks: [{ networkId: networkId, connected: true }],
                },
            },
        );

        await serverNode.add(
            new Endpoint(OtaProviderEndpoint.with(CertOtaProviderServer), {
                id: "ota-provider",
                number: ENDPOINT.otaProvider,
            }),
        );

        await serverNode.parts.get("ota-provider")!.act(agent => {
            agent.get(SoftwareUpdateManager).state.allowTestOtaImages = true;
        });

        await this.#stageTestOtaImage(serverNode);

        return serverNode;
    }

    /**
     * Stages a fixed test image at setup time rather than through a backchannel command: applicability
     * depends only on constants this subject and {@link OtaRequestorTestInstance} both fix at compile
     * time, not on anything only known once a specific peer connects.
     */
    async #stageTestOtaImage(serverNode: ServerNode) {
        const crypto = new StandardCrypto();
        const payload = otaTestPayload();
        const softwareVersionString = this.stagedSoftwareVersionString;

        const { image } = await OtaImageWriter.create(crypto, {
            vendorId: OTA_TEST_VENDOR_ID,
            productId: OTA_TEST_PRODUCT_ID,
            softwareVersion: OTA_TEST_SOFTWARE_VERSION,
            softwareVersionString,
            minApplicableSoftwareVersion: 0,
            maxApplicableSoftwareVersion: OTA_TEST_CURRENT_SOFTWARE_VERSION,
            payload,
        });

        // Same door as CertOtaProviderServer.checkUpdateAvailable() — see the note there:
        // DclOtaUpdateService has no Environmental.create of its own.
        const { otaUpdateService } = await serverNode.act(agent => agent.load(DclBehavior));
        await otaUpdateService.construction;

        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(Bytes.of(image));
                controller.close();
            },
        });

        await otaUpdateService.store(
            stream,
            {
                vid: OTA_TEST_VENDOR_ID,
                pid: OTA_TEST_PRODUCT_ID,
                softwareVersion: OTA_TEST_SOFTWARE_VERSION,
                softwareVersionString,
                minApplicableSoftwareVersion: 0,
                maxApplicableSoftwareVersion: OTA_TEST_CURRENT_SOFTWARE_VERSION,
                cdVersionNumber: 1,
                softwareVersionValid: true,
                schemaVersion: 0,
                source: "dcl-test",
            },
            "test",
        );
    }
}
