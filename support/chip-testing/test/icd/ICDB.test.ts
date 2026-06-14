/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LitIcdApp } from "../support.js";

describe("ICDB", () => {
    // The 2.x state-machine cases self-commission in setup_class (get_setup_payload_info_config), so they must run
    // factory-fresh rather than against the pre-commissioned subject. 1.x/3.x use the default (pre-commissioned) flow.
    const selfCommissioned = ["ICDB/2.1", "ICDB/2.2", "ICDB/2.3", "ICDB/2.4"];

    chip("ICDB/*")
        .subject(LitIcdApp)
        .exclude(...selfCommissioned);
    chip(...selfCommissioned)
        .subject(LitIcdApp)
        .uncommissioned();
});
