/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NODE_MANAGER_PACKAGE } from "#placeholder.js";

describe("@matter/node-manager", () => {
    it("package is wired", () => {
        expect(NODE_MANAGER_PACKAGE).equals("@matter/node-manager");
    });
});
