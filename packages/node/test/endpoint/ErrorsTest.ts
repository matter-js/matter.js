/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttributeNotPresentError,
    EndpointBehaviorNotPresentError,
    EndpointReadFailedError,
} from "#endpoint/errors.js";
import { AttributeId, ClusterId, EndpointNumber, Status } from "@matter/types";

describe("EndpointBehaviorNotPresentError", () => {
    it("names the missing behavior", () => {
        const err = new EndpointBehaviorNotPresentError("doesNotExist");
        expect(err.message).to.match(/doesNotExist/);
    });
});

describe("AttributeNotPresentError", () => {
    it("names the missing attribute and its behavior", () => {
        const err = new AttributeNotPresentError("basicInformation", "ghost");
        expect(err.message).to.match(/basicInformation/);
        expect(err.message).to.match(/ghost/);
    });
});

describe("EndpointReadFailedError", () => {
    it("carries failed paths and the partial slice", () => {
        const failed = [
            {
                path: { endpointId: EndpointNumber(1), clusterId: ClusterId(0x28), attributeId: AttributeId(0x01) },
                status: Status.UnsupportedAttribute,
            },
        ];
        const partial = { basicInformation: {} };
        const err = new EndpointReadFailedError({ failed, partial });
        expect(err.failed).to.equal(failed);
        expect(err.partial).to.equal(partial);
        expect(err.message).to.match(/1 path/);
    });
});
