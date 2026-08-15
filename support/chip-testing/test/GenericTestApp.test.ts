/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TestInstance, TestInstanceConfig } from "../src/GenericTestApp.js";

class StubTestInstance extends TestInstance {
    static override id = `stub-test-instance-${Math.random().toString(36).slice(2)}`;

    async initialize() {}
    async start() {}
    async stop() {}
    async close() {}
}

function stub(config: TestInstanceConfig = {}) {
    return new StubTestInstance(config);
}

describe("TestInstance id allocation", () => {
    it("gives two instances sharing a domain distinct ids", () => {
        const domain = `domain-${Math.random().toString(36).slice(2)}`;

        const first = stub({ domain });
        const second = stub({ domain });
        const third = stub({ domain });

        expect(first.id).equal(`${StubTestInstance.id}-${domain}`);
        expect(new Set([first.id, second.id, third.id]).size).equal(3);
    });

    it("leaves distinct domains untouched by collision resolution", () => {
        const domain = `domain-${Math.random().toString(36).slice(2)}`;

        const first = stub({ domain });
        const second = stub({ domain: `${domain}-other` });

        expect(first.id).equal(`${StubTestInstance.id}-${domain}`);
        expect(second.id).equal(`${StubTestInstance.id}-${domain}-other`);
    });
});
