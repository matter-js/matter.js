/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AclCapacityExceededError,
    CapacityExceededError,
    NodeManagerError,
} from "#behavior/system/desired-state/errors.js";
import { MatterError } from "@matter/general";

describe("desired-state errors", () => {
    it("CapacityExceededError carries the limit detail and message", () => {
        const err = new AclCapacityExceededError("acl", 3, 3, 1);
        expect(err).instanceOf(CapacityExceededError);
        expect(err).instanceOf(NodeManagerError);
        expect(err).instanceOf(MatterError);
        expect(err.kind).equals("acl");
        expect(err.limit).equals(3);
        expect(err.used).equals(3);
        expect(err.requested).equals(1);
        expect(err.message).contains("acl");
        expect(err.message).contains("3");
    });
});
