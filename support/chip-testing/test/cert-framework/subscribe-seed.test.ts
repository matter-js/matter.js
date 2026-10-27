/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttributeId, ClusterId, EndpointNumber, UnexpectedDataError } from "@matter/main";
import { ReadResult } from "@matter/main/protocol";
import { Status, StatusResponseError, TlvBoolean } from "@matter/main/types";
import { concreteSubscribeSeed } from "../../src/cert/subscribe-seed.js";

const PATH = { endpoint: 1, cluster: 6, attribute: 0 };
const CONCRETE = { endpointId: EndpointNumber(1), clusterId: ClusterId(6), attributeId: AttributeId(0) };

const value: ReadResult.AttributeValue = {
    kind: "attr-value",
    path: CONCRETE,
    value: true,
    version: 1,
    tlv: TlvBoolean,
};

const refused: ReadResult.AttributeStatus = {
    kind: "attr-status",
    path: CONCRETE,
    status: Status.UnsupportedAttribute,
    received: true,
};

describe("concreteSubscribeSeed", () => {
    it("returns the primed value", () => {
        expect(concreteSubscribeSeed(PATH, [value], [])).equals(true);
    });

    it("rejects when the priming report has no entry for the path", () => {
        expect(() => concreteSubscribeSeed(PATH, [], [])).throws(UnexpectedDataError, /neither a value nor a status/);
    });

    it("rejects with the device's status when the path was refused", () => {
        expect(() => concreteSubscribeSeed(PATH, [], [refused])).throws(StatusResponseError, /subscribe .* failed/);
    });
});
