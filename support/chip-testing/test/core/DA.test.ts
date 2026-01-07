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
