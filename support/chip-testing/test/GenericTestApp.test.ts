/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandPipe } from "@matter/testing";
import {
    DeviceTestInstance,
    DeviceTestInstanceConfig,
    TestInstance,
    TestInstanceConfig,
} from "../src/GenericTestApp.js";

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

class StubCommandPipe extends CommandPipe {
    closed = false;

    async initialize() {}

    async close() {
        this.closed = true;
    }
}

class StubDeviceTestInstance extends DeviceTestInstance {
    static override id = `stub-device-test-instance-${Math.random().toString(36).slice(2)}`;

    async initialize() {
        await this.activateCommandPipe("stub");
    }
    async start() {}
    async close() {}
}

function deviceStub(commandPipeFactory: DeviceTestInstanceConfig["commandPipeFactory"]) {
    return new StubDeviceTestInstance({ commandPipeFactory });
}

describe("DeviceTestInstance command pipe", () => {
    it("creates a new pipe on initialize after stop", async () => {
        const pipes = new Array<StubCommandPipe>();
        const instance = deviceStub(async (app, name) => {
            const pipe = new StubCommandPipe(app, CommandPipe.filenameFor(name));
            pipes.push(pipe);
            return pipe;
        });

        await instance.initialize();
        await instance.initialize();
        expect(pipes.length).equal(1);

        await instance.stop();
        await instance.initialize();

        expect(pipes.length).equal(2);
        expect(pipes[0].closed).true;
        expect(pipes[1].closed).false;
    });

    it("calls a factory that returns no pipe on every initialize", async () => {
        let calls = 0;
        const instance = deviceStub(async () => {
            calls++;
        });

        await instance.initialize();
        await instance.stop();
        await instance.initialize();

        expect(calls).equal(2);
    });
});
