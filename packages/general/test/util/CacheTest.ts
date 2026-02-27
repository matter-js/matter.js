/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Cache, AsyncCache } from "#util/Cache.js";
import { Seconds } from "#time/TimeUnit.js";

describe("Cache", () => {
    beforeEach(() => MockTime.reset());

    describe("get", () => {
        it("generates value on cache miss", () => {
            let callCount = 0;
            const cache = new Cache("test", () => {
                callCount++;
                return "generated";
            }, Seconds(10));

            const result = cache.get();

            expect(result).equal("generated");
            expect(callCount).equal(1);
        });

        it("returns cached value on cache hit", () => {
            let callCount = 0;
            const cache = new Cache("test", () => {
                callCount++;
                return "generated";
            }, Seconds(10));

            const result1 = cache.get();
            const result2 = cache.get();

            expect(result1).equal("generated");
            expect(result2).equal("generated");
            expect(callCount).equal(1);
        });

        it("supports parameterized cache keys", () => {
            let callCount = 0;
            const cache = new Cache("test", (a: number, b: string) => {
                callCount++;
                return `${a}-${b}`;
            }, Seconds(10));

            const result1 = cache.get(1, "foo");
            const result2 = cache.get(2, "bar");
            const result3 = cache.get(1, "foo");

            expect(result1).equal("1-foo");
            expect(result2).equal("2-bar");
            expect(result3).equal("1-foo");
            expect(callCount).equal(2);
        });

        it("updates timestamp on cache hit", async () => {
            let callCount = 0;
            const cache = new Cache("test", () => {
                callCount++;
                return "value";
            }, Seconds(10));

            cache.get();
            await MockTime.advance(Seconds(5));
            cache.get(); // Should update timestamp
            await MockTime.advance(Seconds(6)); // Total: 11s from first get, 6s from second get

            // Should still have the value (not expired because timestamp was updated)
            const result = cache.get();

            expect(result).equal("value");
            expect(callCount).equal(1);
        });
    });

    describe("expiration", () => {
        it("expires entries after TTL", async () => {
            let callCount = 0;
            const cache = new Cache("test", () => {
                callCount++;
                return `value-${callCount}`;
            }, Seconds(10));

            const result1 = cache.get();
            expect(result1).equal("value-1");

            // Advance past expiration
            await MockTime.advance(Seconds(11));

            const result2 = cache.get();
            expect(result2).equal("value-2");
            expect(callCount).equal(2);
        });

        it("calls expireCallback when entry expires", async () => {
            const expired: Array<{ key: string; value: string }> = [];

            const cache = new Cache("test", (id: number) => `value-${id}`, Seconds(10), async (key, value) => {
                expired.push({ key, value });
            });

            cache.get(1);
            cache.get(2);

            await MockTime.advance(Seconds(11));

            await MockTime.yield(); // Allow async expiration to process

            expect(expired).length(2);
            expect(expired[0]).deep.equal({ key: "1", value: "value-1" });
            expect(expired[1]).deep.equal({ key: "2", value: "value-2" });
        });

        it("only expires entries past TTL, not newer ones", async () => {
            let callCount = 0;
            const cache = new Cache("test", (_id: number) => {
                callCount++;
                return `value-${callCount}`;
            }, Seconds(10));

            cache.get(1);
            await MockTime.advance(Seconds(5));
            cache.get(2);
            await MockTime.advance(Seconds(6)); // Entry 1: 11s old, Entry 2: 6s old

            // Entry 1 should be expired, Entry 2 should not
            const result1 = cache.get(1); // Should regenerate (now callCount becomes 3)
            const result2 = cache.get(2); // Should be cached

            expect(result1).equal("value-3"); // Regenerated (new value)
            expect(result2).equal("value-2"); // Still cached (old value)
            expect(callCount).equal(3);
        });
    });

    describe("delete", () => {
        it("removes entry from cache", async () => {
            let callCount = 0;
            const cache = new Cache("test", () => {
                callCount++;
                return `value-${callCount}`;
            }, Seconds(10));

            cache.get();
            await cache.delete("");

            const result = cache.get();

            expect(result).equal("value-2");
            expect(callCount).equal(2);
        });

        it("calls expireCallback when deleting", async () => {
            const expired: Array<{ key: string; value: string }> = [];

            const cache = new Cache("test", (id: number) => `value-${id}`, Seconds(10), async (key, value) => {
                expired.push({ key, value });
            });

            cache.get(1);
            await cache.delete("1");

            expect(expired).length(1);
            expect(expired[0]).deep.equal({ key: "1", value: "value-1" });
        });

        it("does nothing if key does not exist", async () => {
            const cache = new Cache("test", () => "value", Seconds(10));

            await cache.delete("nonexistent");

            // Should not throw, test passes if we get here
            expect(true).equal(true);
        });
    });

    describe("clear", () => {
        it("removes all entries", async () => {
            let callCount = 0;
            const cache = new Cache("test", (_id: number) => {
                callCount++;
                return `value-${callCount}`;
            }, Seconds(10));

            cache.get(1);
            cache.get(2);
            cache.get(3);

            await cache.clear();

            const result = cache.get(1);

            // After clear, getting key "1" should regenerate it as the 4th call
            expect(result).equal("value-4");
            expect(callCount).equal(4);
        });

        it("calls expireCallback for all entries", async () => {
            const expired: Array<{ key: string; value: string }> = [];

            const cache = new Cache("test", (id: number) => `value-${id}`, Seconds(10), async (key, value) => {
                expired.push({ key, value });
            });

            cache.get(1);
            cache.get(2);

            await cache.clear();

            expect(expired).length(2);
            expect(expired[0]).deep.equal({ key: "1", value: "value-1" });
            expect(expired[1]).deep.equal({ key: "2", value: "value-2" });
        });
    });

    describe("keys", () => {
        it("returns all known keys", () => {
            const cache = new Cache("test", (id: number) => `value-${id}`, Seconds(10));

            cache.get(1);
            cache.get(2);
            cache.get(3);

            const keys = cache.keys();

            expect(keys).deep.equal(["1", "2", "3"]);
        });

        it("includes expired keys until expiration runs", () => {
            const cache = new Cache("test", (id: number) => `value-${id}`, Seconds(10));

            cache.get(1);
            MockTime.advance(Seconds(11));

            const keys = cache.keys();

            expect(keys).deep.equal(["1"]);
        });
    });

    describe("close", () => {
        it("clears all entries and stops timer", async () => {
            let callCount = 0;
            const cache = new Cache("test", (id: number) => {
                callCount++;
                return `value-${id}`;
            }, Seconds(10));

            cache.get(1);
            cache.get(2);

            await cache.close();

            const keys = cache.keys();
            expect(keys).deep.equal([]);

            // Timer should be stopped, no expiration should run
            await MockTime.advance(Seconds(11));
            expect(callCount).equal(2);
        });

        it("calls expireCallback for all entries", async () => {
            const expired: Array<{ key: string; value: string }> = [];

            const cache = new Cache("test", (id: number) => `value-${id}`, Seconds(10), async (key, value) => {
                expired.push({ key, value });
            });

            cache.get(1);
            cache.get(2);

            await cache.close();

            expect(expired).length(2);
        });
    });
});

describe("AsyncCache", () => {
    beforeEach(() => MockTime.reset());

    describe("get", () => {
        it("generates value asynchronously on cache miss", async () => {
            let callCount = 0;
            const cache = new AsyncCache("test", async () => {
                callCount++;
                await new Promise(resolve => setTimeout(resolve, 1));
                return "generated";
            }, Seconds(10));

            const result = await cache.get();

            expect(result).equal("generated");
            expect(callCount).equal(1);
        });

        it("returns cached value on cache hit", async () => {
            let callCount = 0;
            const cache = new AsyncCache("test", async () => {
                callCount++;
                return "generated";
            }, Seconds(10));

            const result1 = await cache.get();
            const result2 = await cache.get();

            expect(result1).equal("generated");
            expect(result2).equal("generated");
            expect(callCount).equal(1);
        });

        it("supports parameterized cache keys", async () => {
            let callCount = 0;
            const cache = new AsyncCache("test", async (a: number, b: string) => {
                callCount++;
                return `${a}-${b}`;
            }, Seconds(10));

            const result1 = await cache.get(1, "foo");
            const result2 = await cache.get(2, "bar");
            const result3 = await cache.get(1, "foo");

            expect(result1).equal("1-foo");
            expect(result2).equal("2-bar");
            expect(result3).equal("1-foo");
            expect(callCount).equal(2);
        });

        it("updates timestamp on cache hit", async () => {
            let callCount = 0;
            const cache = new AsyncCache("test", async () => {
                callCount++;
                return "value";
            }, Seconds(10));

            await cache.get();
            await MockTime.advance(Seconds(5));
            await cache.get(); // Should update timestamp
            await MockTime.advance(Seconds(6)); // Total: 11s from first get, 6s from second get

            const result = await cache.get();

            expect(result).equal("value");
            expect(callCount).equal(1);
        });
    });

    describe("expiration", () => {
        it("expires entries after TTL", async () => {
            let callCount = 0;
            const cache = new AsyncCache("test", async () => {
                callCount++;
                return `value-${callCount}`;
            }, Seconds(10));

            const result1 = await cache.get();
            expect(result1).equal("value-1");

            await MockTime.advance(Seconds(11));

            const result2 = await cache.get();
            expect(result2).equal("value-2");
            expect(callCount).equal(2);
        });
    });
});
