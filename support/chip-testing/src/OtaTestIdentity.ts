/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VendorId } from "@matter/main/types";

/**
 * Vendor/product id shared by {@link OtaRequestorTestInstance} and {@link OtaProviderTestInstance}, so a
 * staged test image is applicable to a requestor peer without either side needing to learn the other's
 * identity at runtime.
 *
 * chip's Linux `ota-provider-app` and `ota-requestor-app` declare no identity of their own, so they take
 * `CHIP_DEVICE_CONFIG_DEVICE_PRODUCT_ID`'s default of 0x8001 under test vendor 0xfff1. A chip provider
 * driven from a candidate list answers `NotAvailable` with no further diagnostic when a `QueryImage`'s
 * vendor/product match no candidate, so a cross-flavor run against a subject that disagrees with that
 * default is indistinguishable from one with nothing staged.
 */
export const OTA_TEST_VENDOR_ID = VendorId(0xfff1);
export const OTA_TEST_PRODUCT_ID = 0x8001;

/** `softwareVersion` of the image {@link OtaProviderTestInstance} stages. */
export const OTA_TEST_SOFTWARE_VERSION = 2;

/** `softwareVersion` {@link OtaRequestorTestInstance} reports, one older than the staged image. */
export const OTA_TEST_CURRENT_SOFTWARE_VERSION = OTA_TEST_SOFTWARE_VERSION - 1;

/** Size of the payload {@link OtaProviderTestInstance} stages. */
export const OTA_TEST_PAYLOAD_SIZE = 64 * 1024;

/**
 * The payload {@link OtaProviderTestInstance} stages, as a pure function of offset so
 * {@link OtaRequestorTestInstance} can recompute it and compare byte for byte against what BDX delivered.
 */
export function otaTestPayload(size = OTA_TEST_PAYLOAD_SIZE, seed = 0x42): Uint8Array {
    const payload = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
        payload[i] = (i ^ seed) & 0xff;
    }
    return payload;
}

const OTA_TEST_SOFTWARE_VERSION_STRING_PREFIX = "matterjs-ota-test";

/**
 * Software version string of an image staged by {@link OtaProviderTestInstance}, carrying `marker` so a
 * reader can tell which instance staged it.
 *
 * `DclOtaUpdateService` keys a stored image on vendor/product/mode/version alone and the service is a
 * process-wide singleton, so every provider instance in a process stages over the same entry; the marker
 * is the only thing that says whose staging survived.
 */
export function otaTestSoftwareVersionString(marker: string) {
    return `${OTA_TEST_SOFTWARE_VERSION_STRING_PREFIX}-${marker}`;
}

/** True for a software version string {@link otaTestSoftwareVersionString} produced. */
export function isOtaTestSoftwareVersionString(softwareVersionString: string) {
    return softwareVersionString.startsWith(`${OTA_TEST_SOFTWARE_VERSION_STRING_PREFIX}-`);
}

/**
 * `BasicInformation` identity for one OTA subject instance.
 *
 * A run may commission more than one OTA subject onto one fabric, and a controller (or a test step reading
 * `BasicInformation` to tell the roles apart) can only distinguish them by what they report. `instanceId`
 * is unique per instance within a process and stable across a backchannel reboot, so deriving from it
 * keeps both properties. `uniqueId` must differ from `serialNumber` per the Basic Information cluster, and
 * both are capped at 32 characters, hence the tail: the instance-distinguishing suffix lives at the end.
 */
export function otaTestBasicIdentity(role: "provider" | "requestor", instanceId: string) {
    const suffix = instanceId.slice(-20);

    return {
        serialNumber: `SN-${suffix}`,
        uniqueId: `UID-OTA-${role === "provider" ? "P" : "R"}-${suffix}`,
    };
}
