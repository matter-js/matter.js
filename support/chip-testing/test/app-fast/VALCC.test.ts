/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AllDevicesApp } from "../support.js";

describe("VALCC", () => {
    // A python test with a single run does not select its app, so these name the subject.  The all-clusters runs are
    // left out because our all-clusters app has no valve
    chip("VALCC/3.1", "VALCC/3.2", "VALCC/4.1", "VALCC/4.2", "VALCC/4.5").subject(AllDevicesApp);
    chip("VALCC/*/run2");
});
