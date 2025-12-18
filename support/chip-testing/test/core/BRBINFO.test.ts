/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BridgeApp } from "../support.js";

describe("BRBINFO", () => {
    chip("BRBINFO/*").subject(BridgeApp).exclude(
        // Exclude ICD; test doesn't specify PICS
        "BRBINFO/4.1",

        // This guy needs extra arguments that the test doesn't specify
        "BRBINFO/3.1",
    );

    chip("BRBINFO/3.1").subject(BridgeApp).args("--endpoint", "3");
});
