/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, Millis } from "@matter/general";
import { Endpoint, ServerNode } from "@matter/main";
import { AdministratorCommissioningServer } from "@matter/main/behaviors/administrator-commissioning";
import { NetworkCommissioningServer } from "@matter/main/behaviors/network-commissioning";
import { OtaSoftwareUpdateRequestorServer } from "@matter/main/behaviors/ota-software-update-requestor";
import { AdministratorCommissioning, NetworkCommissioning } from "@matter/main/clusters";
import { OtaRequestorEndpoint } from "@matter/main/endpoints/ota-requestor";
import type { OtaImageHeader, PersistedFileDesignator } from "@matter/main/protocol";
import { OtaImageError, OtaImageReader } from "@matter/main/protocol";
import { DeviceTypeId } from "@matter/main/types";
import { NodeTestInstance } from "./NodeTestInstance.js";
import {
    isOtaTestSoftwareVersionString,
    OTA_TEST_CURRENT_SOFTWARE_VERSION,
    OTA_TEST_PAYLOAD_SIZE,
    OTA_TEST_PRODUCT_ID,
    OTA_TEST_VENDOR_ID,
    otaTestBasicIdentity,
    otaTestPayload,
} from "./OtaTestIdentity.js";

const ENDPOINT = {
    otaRequestor: 1,
} as const;

/** See {@link CertOtaRequestorServer.announcedUpdateQueryDelay}. */
const ANNOUNCED_QUERY_DELAY = Millis(250);

/**
 * Establishes that a transferred OTA file is the image that was staged for this device.
 *
 * `OtaSoftwareUpdateRequestorServer.validateUpdateFile()` already rejects a file whose header, payload
 * digest or declared size do not hold together, so what remains for a subject to establish is that the
 * *intended* image arrived: the version the provider announced, and the bytes that were staged. Bytes are
 * only checkable for an image {@link OtaProviderTestInstance} staged, which says so in its
 * `softwareVersionString` and whose payload is a pure function of offset; a foreign provider (a chip
 * `ota-provider-app` serving a file from `ota_image_tool.py`) carries a payload this process cannot
 * predict, and its header vendor/product need not match this device either.
 *
 * @returns the header of the verified file
 */
export async function verifyOtaTestTransfer(
    crypto: Crypto,
    blob: Blob,
    announcedSoftwareVersion: number,
): Promise<OtaImageHeader> {
    const payloadChunks = new Array<Uint8Array>();
    const payloadWriter = new WritableStream<Bytes>({
        write(chunk) {
            payloadChunks.push(Bytes.of(chunk));
        },
    }).getWriter();

    const header = await OtaImageReader.extractPayload(blob.stream().getReader(), payloadWriter, crypto, blob.size);

    if (header.softwareVersion !== announcedSoftwareVersion) {
        throw new OtaImageError(
            `Transferred OTA image is version ${header.softwareVersion} but the provider announced ${announcedSoftwareVersion}`,
        );
    }

    const payload = Bytes.concat(...payloadChunks);
    if (payload.byteLength === 0) {
        throw new OtaImageError("Transferred OTA image carries no payload");
    }

    if (isOtaTestSoftwareVersionString(header.softwareVersionString)) {
        if (payload.byteLength !== OTA_TEST_PAYLOAD_SIZE) {
            throw new OtaImageError(
                `Transferred OTA image "${header.softwareVersionString}" carries ${payload.byteLength} payload bytes, expected ${OTA_TEST_PAYLOAD_SIZE}`,
            );
        }
        if (!Bytes.areEqual(payload, otaTestPayload(payload.byteLength))) {
            throw new OtaImageError(
                `Transferred OTA image "${header.softwareVersionString}" does not carry the staged payload`,
            );
        }
    }

    return header;
}

/**
 * Accepts an update the way a real device's firmware would, after establishing that what BDX delivered is
 * what was staged (see {@link verifyOtaTestTransfer}); a mismatch throws rather than reporting success.
 *
 * A cert run never actually reboots this process, so unlike a real device this does not advance
 * `BasicInformation.softwareVersion`. The cluster's own `updateState` and its `StateTransition` event are
 * what an observer reads to see that the update was applied.
 */
class CertOtaRequestorServer extends OtaSoftwareUpdateRequestorServer {
    /**
     * A cert run is one requestor with one provider, so the specified random window — up to ten
     * minutes — only makes the run's own duration unpredictable; its purpose, spreading a fabric's
     * queries, has nothing to spread here. chip's `ota-requestor-app` is configurable the same way
     * and ships with the delay at zero.
     */
    protected override announcedUpdateQueryDelay() {
        return ANNOUNCED_QUERY_DELAY;
    }

    protected override async applyUpdate(newSoftwareVersion: number, fileDesignator: PersistedFileDesignator) {
        const blob = await fileDesignator.openBlob();
        await verifyOtaTestTransfer(this.env.get(Crypto), blob, newSoftwareVersion);
    }

    protected override requestUserConsent() {
        return true;
    }
}

/**
 * A commissionable device exposing {@link OtaSoftwareUpdateRequestorServer} on an
 * {@link OtaRequestorEndpoint}, so a controller acting as OTA provider can announce itself to it and
 * serve it an image over BDX.
 */
export class OtaRequestorTestInstance extends NodeTestInstance {
    static override id = "ota-requestor-6100";

    async setupServer(): Promise<ServerNode> {
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
                    deviceType: DeviceTypeId(OtaRequestorEndpoint.deviceType),
                },
                basicInformation: {
                    vendorName: "Matterjs Test Vendor",
                    vendorId: OTA_TEST_VENDOR_ID,
                    nodeLabel: "",
                    productName: "OTA Requestor",
                    productLabel: "OTA Requestor",
                    productId: OTA_TEST_PRODUCT_ID,
                    softwareVersion: OTA_TEST_CURRENT_SOFTWARE_VERSION,
                    softwareVersionString: `${OTA_TEST_CURRENT_SOFTWARE_VERSION}.0.0`,
                    ...otaTestBasicIdentity("requestor", this.id),
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
            new Endpoint(OtaRequestorEndpoint.with(CertOtaRequestorServer), {
                id: "ota-requestor",
                number: ENDPOINT.otaRequestor,
            }),
        );

        return serverNode;
    }
}
