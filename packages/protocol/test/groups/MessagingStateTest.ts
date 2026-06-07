/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessagingState } from "#groups/MessagingState.js";
import {
    ImplementationError,
    InternalError,
    MemoryStorageDriver,
    StorageManager,
    type Crypto,
    type StorageContext,
} from "@matter/general";
import { NodeId } from "@matter/types";

const crypto = {} as Crypto;
const storage = {} as StorageContext;
const key = new Uint8Array([1, 2, 3]);

describe("MessagingState", () => {
    describe("storage", () => {
        it("allows setting storage once when constructed without it", () => {
            const state = new MessagingState(crypto);
            expect(() => (state.storage = storage)).not.throws();
        });

        it("rejects setting storage a second time", () => {
            const state = new MessagingState(crypto, storage);
            expect(() => (state.storage = storage)).throws(InternalError, "only be set once");
        });
    });

    describe("counterFor", () => {
        it("throws without a storage context", () => {
            const state = new MessagingState(crypto);
            expect(() => state.counterFor(key)).throws(ImplementationError, "without storage context");
        });
    });

    describe("receptionStateFor", () => {
        it("returns a stable instance per (source node, key)", () => {
            const state = new MessagingState(crypto);

            const first = state.receptionStateFor(NodeId(1n), key);

            expect(state.receptionStateFor(NodeId(1n), key)).equal(first);
            expect(state.receptionStateFor(NodeId(2n), key)).not.equal(first);
        });
    });

    describe("legacy group data counter migration", () => {
        async function realStorage() {
            const driver = new MemoryStorageDriver();
            const manager = new StorageManager(driver);
            await manager.initialize();
            return manager.createContext("fabric-1");
        }

        it("returns the max across legacy *-data entries, ignoring others", async () => {
            const ctx = await realStorage();
            await ctx.set(`${"a".repeat(32)}-data`, 100);
            await ctx.set(`${"b".repeat(32)}-data`, 4242);
            await ctx.set("resumptionRecords", 7);
            const state = new MessagingState({} as Crypto, ctx);

            expect(await state.legacyGroupDataCounterMax()).equal(4242);
        });

        it("returns undefined when there are no legacy entries", async () => {
            const ctx = await realStorage();
            const state = new MessagingState({} as Crypto, ctx);

            expect(await state.legacyGroupDataCounterMax()).undefined;
        });

        it("clears only the legacy *-data entries", async () => {
            const ctx = await realStorage();
            const dataKey = `${"c".repeat(32)}-data`;
            await ctx.set(dataKey, 5);
            await ctx.set("keep", 1);
            const state = new MessagingState({} as Crypto, ctx);

            await state.clearLegacyGroupDataCounters();

            expect(await ctx.has(dataKey)).equal(false);
            expect(await ctx.has("keep")).equal(true);
        });
    });
});
