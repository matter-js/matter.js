/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessagingState } from "#groups/MessagingState.js";
import { type Crypto, ImplementationError, InternalError, type StorageContext } from "@matter/general";
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
});
