/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("commissioning", () => {
    // OperationalCredentialsCluster belongs here only once OperationalCredentials reaches ClusterRevision 3, which
    // requires PQC device attestation
    chip(
        "AddNewFabricFromExistingFabric",
        "ArmFailSafe",
        "CommissionerNodeId",
        "CommissioningWindow",
        "FabricRemovalWhileSubscribed",
        "GeneralCommissioning",
        "MultiAdmin",
        "SelfFabricRemoval",
    );
});
