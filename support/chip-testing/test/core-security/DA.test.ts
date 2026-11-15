/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("DA", () => {
    chip("DA/*")
        .exclude(
            // We don't support DAC revocation
            "DA/1.9",

            // Assert the PQCDA feature unconditionally rather than gating on PICS.  matter.js implements Matter 1.6,
            // where OperationalCredentials has no PQC device attestation
            "DA/1.10/*",
            "DA/1.12/*",

            // Starts the app with another vendor's DAC (--vendor-id, --product-id, --dac_provider), which the matter.js
            // all-devices app does not support
            "DA/1.1/run4",
        )
        .args(
            // We commission separately but at least TC_DA_1_7.py requires passcode and discriminator for recommissioning
            "--passcode",
            20202021,

            "--discriminator",
            3840,

            // TC_DA_1_2.py looks for certs in a relative path by default
            "--string-arg=cd_cert_dir:/credentials/development/cd-certs",
        );
});
