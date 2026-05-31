/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReadScope } from "#action/client/ReadScope.js";
import { Read } from "#action/request/Read.js";
import { AttributeId, ClusterId, EndpointNumber } from "@matter/types";

describe("ReadScope", () => {
    it("treats an empty read as out of scope", () => {
        const scope = ReadScope(Read({}));

        expect(scope.isRelevant(EndpointNumber(1), ClusterId(6))).equal(false);
        expect(scope.isWildcard(EndpointNumber(1), ClusterId(6))).equal(false);
    });

    it("treats a full wildcard read as always in scope", () => {
        const scope = ReadScope(Read({ attributes: [{}] }));

        expect(scope.isRelevant(EndpointNumber(2), ClusterId(8))).equal(true);
        expect(scope.isWildcard(EndpointNumber(2), ClusterId(8))).equal(true);
    });

    it("scopes a wildcard cluster across all endpoints", () => {
        const scope = ReadScope(Read({ attributes: [{ clusterId: ClusterId(6) }] }));

        expect(scope.isRelevant(EndpointNumber(1), ClusterId(6))).equal(true);
        expect(scope.isRelevant(EndpointNumber(9), ClusterId(6))).equal(true);
        expect(scope.isRelevant(EndpointNumber(1), ClusterId(8))).equal(false);
    });

    it("scopes a specific endpoint and cluster", () => {
        const scope = ReadScope(Read({ attributes: [{ endpointId: EndpointNumber(1), clusterId: ClusterId(6) }] }));

        expect(scope.isRelevant(EndpointNumber(1), ClusterId(6))).equal(true);
        expect(scope.isRelevant(EndpointNumber(2), ClusterId(6))).equal(false);
        expect(scope.isWildcard(EndpointNumber(1), ClusterId(6))).equal(true);
    });

    it("does not scope a read that targets only a specific attribute", () => {
        const scope = ReadScope(
            Read({
                attributes: [{ endpointId: EndpointNumber(1), clusterId: ClusterId(6), attributeId: AttributeId(0) }],
            }),
        );

        // A concrete-attribute path is registered for neither relevance nor wildcard scope
        expect(scope.isRelevant(EndpointNumber(1), ClusterId(6))).equal(false);
        expect(scope.isWildcard(EndpointNumber(1), ClusterId(6))).equal(false);
    });

    it("exposes the fabric filter flag", () => {
        expect(ReadScope(Read({ attributes: [{}] })).isFabricFiltered).equal(true);
        expect(ReadScope(Read({ attributes: [{}], fabricFilter: false })).isFabricFiltered).equal(false);
    });
});
