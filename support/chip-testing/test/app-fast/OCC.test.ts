/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("OCC", () => {
    // OCC 3.1 and 3.2 need a SetOccupancy backchannel command and the OccupancyEvent feature on the test devices
    chip("OCC/2.*");
});
