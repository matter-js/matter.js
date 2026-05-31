/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NamedHandler } from "#util/NamedHandler.js";

interface Handlers {
    greet(name: string): string;
    farewell(): void;
}

describe("NamedHandler", () => {
    it("registers and reports handlers", () => {
        const handlers = new NamedHandler<Handlers>();
        expect(handlers.hasHandler("greet")).equal(false);

        handlers.addHandler("greet", name => `hi ${name}`);

        expect(handlers.hasHandler("greet")).equal(true);
    });

    it("executes a handler with arguments and returns its result", async () => {
        const handlers = new NamedHandler<Handlers>();
        handlers.addHandler("greet", name => `hi ${name}`);

        expect(await handlers.executeHandler("greet", "bob")).equal("hi bob");
    });

    it("returns undefined when no handler matches", async () => {
        const handlers = new NamedHandler<Handlers>();

        expect(await handlers.executeHandler("greet", "bob")).undefined;
    });

    it("removes a handler", () => {
        const handlers = new NamedHandler<Handlers>();
        const handler = (name: string) => `hi ${name}`;
        handlers.addHandler("greet", handler);

        handlers.removeHandler("greet", handler);

        expect(handlers.hasHandler("greet")).equal(false);
    });
});
