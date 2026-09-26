/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("OPCREDS", () => {
    chip("OPCREDS/*").exclude(
        // Asserts the PQCDA feature unconditionally rather than gating on PICS.  matter.js implements Matter 1.6,
        // where OperationalCredentials has no PQC device attestation
        "OPCREDS/3.9",
    );
});
