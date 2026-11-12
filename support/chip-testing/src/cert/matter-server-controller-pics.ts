/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PicsValues } from "@matter/testing";
import { MATTERJS_SERVER_PICS } from "./matter-server-pics.js";

/**
 * The MCORE keys of the declaration that describe the server as a controller. Every other MCORE key describes it as a
 * device (for example transports, advertisement, the server side of IDM, bridging, and the commissionee and OTA
 * requestor roles), and in a run the TH answers those.
 * `MCORE.DD.DISCOVERY_*` belongs to the device side as well: in this suite it names what the TH advertises.
 */
const CONTROLLER_MCORE_KEYS = [
    /^MCORE\.IDM\.C(\.|$)/,
    /^MCORE\.ROLE\.(COMMISSIONER|CONTROLLER)$/,
    /^MCORE\.(DT_SW_COMP|ACL\.Administrator|BRIDGECLIENT)$/,
    /^MCORE\.(DEVLIST|BDX)\./,
    /^MCORE\.OTA\.(Provider|HTTPS|VendorSpecific)$/,
    /^MCORE\.DD\.(QR_COMMISSIONING|MANUAL_PC_COMMISSIONING|11_MANUAL_PC|21_MANUAL_PC|SCAN_QR_CODE|SCAN_NFC)$/,
    /^MCORE\.DD\.(CTRL_CONCATENATED_QR_CODE_1|CTRL_CONCATENATED_QR_CODE_2)$/,
    /^MCORE\.DD\.(STANDARD|USER_INTENT|CUSTOM)_COMM_FLOW$/,
];

/** The server clusters the server hosts as part of its controller role: the OTA provider and the WebRTC requestor. */
const CONTROLLER_HOSTED_SERVER_CLUSTERS = new Set(["OTAP", "WEBRTCR"]);

/**
 * Whether a key of the server's certification declaration describes the server as a controller. A run uses only these
 * keys from the declaration; the device file answers the rest for the TH.
 */
export function describesController(key: string) {
    const [prefix, side] = key.split(".");
    if (prefix === "MCORE") {
        return CONTROLLER_MCORE_KEYS.some(pattern => pattern.test(key));
    }
    return side === "C" || (side === "S" && CONTROLLER_HOSTED_SERVER_CLUSTERS.has(prefix));
}

/** Where the server leg answers otherwise than the declaration. */
const DEVIATIONS: PicsValues = {
    // Declared 0. `commission_with_code` takes a scanned `MT:…` payload.
    "MCORE.DD.SCAN_QR_CODE": 1,

    // Declared 1. The server's OTA provider hands out images over BDX only, with no HTTPS download.
    "MCORE.OTA.HTTPS": 0,

    // Declared 0. The server answers QueryImage with UserConsentNeeded when an update needs consent and the requestor
    // can give it.
    "OTAP.S.M.UserConsentNeeded": 1,

    // The declaration answers these 0 under the names `CADMIN.C.M.*`; the test cases and CHIP's file use `CADMIN.M.*`.
    "CADMIN.M.UserInterfaceDisplay": 0,
    "CADMIN.M.AudioInterface": 0,
};

/**
 * What this controller claims about itself, overlaying the device's PICS for a run (see `controllerPicsOverridesFor`):
 * the controller side of the server's certification declaration ({@link MATTERJS_SERVER_PICS}, see
 * {@link describesController}), with a few deviations, each with its reason.
 *
 * Where the adapter cannot do what the declaration claims, the step settles as a capability gap
 * (`MATTERJS_SERVER_CAPABILITY_GAPS`). A key is never set to 0 for that reason, because a 0 hides the declared feature
 * from the coverage report.
 */
export const MATTERJS_SERVER_CONTROLLER_PICS: PicsValues = {
    ...Object.fromEntries(Object.entries(MATTERJS_SERVER_PICS).filter(([key]) => describesController(key))),
    ...DEVIATIONS,
};
