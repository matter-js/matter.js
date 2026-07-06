/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThreadNetworkNameMismatchError, resolveThreadNetworkName } from "#peer/ControllerCommissioningFlow.js";

// MeshCoP dataset carrying only a NETWORK_NAME TLV (type 3) = "MyNet".
const DATASET_MYNET = "03054d794e6574";
// Dataset carrying only a PANID TLV (type 1) — no NETWORK_NAME present.
const DATASET_NO_NAME = "01021234";
// Truncated TLV: header claims 5 bytes of value but none follow.
const DATASET_MALFORMED = "0305";

describe("resolveThreadNetworkName", () => {
    it("derives the name from the dataset when none is supplied", () => {
        expect(resolveThreadNetworkName({ operationalDataset: DATASET_MYNET })).to.equal("MyNet");
    });

    it("treats an empty-string name as absent and derives", () => {
        expect(resolveThreadNetworkName({ networkName: "", operationalDataset: DATASET_MYNET })).to.equal("MyNet");
    });

    it("returns the supplied name when it matches the dataset", () => {
        expect(resolveThreadNetworkName({ networkName: "MyNet", operationalDataset: DATASET_MYNET })).to.equal("MyNet");
    });

    it("declines with a typed error when the supplied name mismatches the dataset", () => {
        expect(() => resolveThreadNetworkName({ networkName: "OtherNet", operationalDataset: DATASET_MYNET })).to.throw(
            ThreadNetworkNameMismatchError,
            /OtherNet.*MyNet/,
        );
    });

    it("keeps the supplied name when the dataset carries no network name", () => {
        expect(resolveThreadNetworkName({ networkName: "MyNet", operationalDataset: DATASET_NO_NAME })).to.equal(
            "MyNet",
        );
    });

    it("returns undefined when neither the params nor the dataset carry a name", () => {
        expect(resolveThreadNetworkName({ operationalDataset: DATASET_NO_NAME })).to.equal(undefined);
    });

    it("falls back to the supplied name and does not throw when the dataset cannot be decoded", () => {
        expect(resolveThreadNetworkName({ networkName: "MyNet", operationalDataset: DATASET_MALFORMED })).to.equal(
            "MyNet",
        );
    });
});
