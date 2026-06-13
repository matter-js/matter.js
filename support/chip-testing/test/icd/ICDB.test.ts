/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LitIcdApp } from "../support.js";

describe("ICDB", () => {
    // Only the 1.x cases run against the pre-commissioned docker subject. The master-only 2.x/3.x cases
    // self-commission in setup_class (get_setup_payload_info_config), which is incompatible with this harness's
    // pre-commission model; they run on the python-repl path (chip-tool-tests.yml) instead.
    chip("ICDB/1.1", "ICDB/1.2").subject(LitIcdApp);
});
