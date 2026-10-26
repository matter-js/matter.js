/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StoreClosedError, StoreLifecycle } from "#storage/StoreLifecycle.js";
import { createPromise, ImplementationError } from "@matter/general";

const store = { toString: () => "test store" };

describe("StoreLifecycle", () => {
    it("refuses an erase that comes while it closes, once the close ended", async () => {
        const lifecycle = new StoreLifecycle(store);
        const finish = createPromise<void>();
        const closing = lifecycle.close(() => finish.promise);

        let erased: unknown;
        const erasing = lifecycle.erase(async () => {}).catch(error => (erased = error));
        await MockTime.yield();
        expect(erased).undefined;

        finish.resolver();
        await Promise.all([closing, erasing]);
        expect(erased).instanceOf(StoreClosedError);
    });

    it("resolves an erase that joins a running erase only once the wipe ends", async () => {
        const lifecycle = new StoreLifecycle(store);
        const wipe = createPromise<void>();
        const first = lifecycle.erase(() => wipe.promise);

        let joined = false;
        const second = lifecycle.erase(async () => {}).then(() => (joined = true));
        await MockTime.yield();
        await MockTime.yield();
        expect(joined).false;

        wipe.resolver();
        await Promise.all([first, second]);
        expect(joined).true;
    });

    it("rejects an erase that joins a failing erase with its failure", async () => {
        const lifecycle = new StoreLifecycle(store);
        const wipe = createPromise<void>();
        const first = lifecycle.erase(() => wipe.promise);
        const second = lifecycle.erase(async () => {});

        wipe.rejecter(new ImplementationError("Wipe refused for test"));

        await expect(first).rejectedWith("Wipe refused for test");
        await expect(second).rejectedWith("Wipe refused for test");
    });

    it("resolves a close that waits for a failing erase", async () => {
        const lifecycle = new StoreLifecycle(store);
        const wipe = createPromise<void>();
        const erasing = lifecycle.erase(() => wipe.promise);
        const closing = lifecycle.close();

        wipe.rejecter(new ImplementationError("Wipe refused for test"));

        await expect(erasing).rejectedWith("Wipe refused for test");
        await closing;
        expect(lifecycle.state).equals("erased");
    });

    it("ends erased after a failed wipe and refuses a later write", async () => {
        const lifecycle = new StoreLifecycle(store);

        await expect(
            lifecycle.erase(async () => {
                throw new ImplementationError("Wipe refused for test");
            }),
        ).rejectedWith("Wipe refused for test");

        expect(lifecycle.state).equals("erased");
        let wrote = false;
        await expect(lifecycle.write(async () => (wrote = true))).rejectedWith(StoreClosedError);
        expect(wrote).false;
    });

    it("waits for a running write before it wipes", async () => {
        const lifecycle = new StoreLifecycle(store);
        const write = createPromise<void>();
        const order = new Array<string>();
        const writing = lifecycle.write(async () => {
            await write.promise;
            order.push("write");
        });

        const erasing = lifecycle.erase(async () => {
            order.push("wipe");
        });
        await MockTime.yield();
        write.resolver();
        await Promise.all([writing, erasing]);

        expect(order).deep.equals(["write", "wipe"]);
    });
});
