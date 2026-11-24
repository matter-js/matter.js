/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TlvWriteRequest } from "#protocol/messages/TlvWriteRequest.js";
import { TlvAttributeData } from "#protocol/types/TlvAttributeData.js";
import { TlvArray } from "#tlv/TlvArray.js";
import { TlvField, TlvObject } from "#tlv/TlvObject.js";

describe("TlvWriteRequest", () => {
    it("decodes a request that leaves out SuppressResponse and TimedRequest", () => {
        const encoded = TlvObject({ writeRequests: TlvField(2, TlvArray(TlvAttributeData)) }).encode({
            writeRequests: [],
        });

        const decoded = TlvWriteRequest.decode(encoded);

        expect(decoded.suppressResponse).undefined;
        expect(decoded.timedRequest).undefined;
        expect(decoded.writeRequests).deep.equals([]);
    });
});
