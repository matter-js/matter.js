/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import { Datasource } from "#behavior/state/managed/Datasource.js";
import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { ClientCacheBuffer } from "#storage/client/ClientCacheBuffer.js";
import { DatasourceCache } from "#storage/client/DatasourceCache.js";
import { RemoteWriteParticipant } from "#storage/client/RemoteWriteParticipant.js";
import type { RemoteWriter } from "#storage/client/RemoteWriter.js";
import { StoreClosedError } from "#storage/StoreLifecycle.js";
import {
    Duration,
    Instant,
    InternalError,
    Lifetime,
    LogLevel,
    MemoryStorageDriver,
    MockCrypto,
    Seconds,
    StorageDriver,
    StorageError,
    Transaction,
} from "@matter/general";
import { AttributeElement, ClusterModel, DataModelPath } from "@matter/model";
import { Val, WriteError } from "@matter/protocol";
import { AttributeId, ClusterId, EndpointNumber, Status, StatusResponseError } from "@matter/types";
import { captureAllLogOf, captureWarningsOf } from "../endpoint/validation/validation-helpers.js";
import {
    attrs,
    createCache,
    gatedWriter,
    preparedWrite,
    recordingConsumer,
    sendingWriter,
    trackingWriter,
} from "./cache-test-helpers.js";

const PATH = new DataModelPath("peer1");

/** A localWriter that always throws */
function failingWriter(message = "persist failure") {
    return {
        persistInTransaction: async () => {
            throw new Error(message);
        },
    };
}

/** A localWriter whose store ended */
function endedWriter() {
    return {
        persistInTransaction: async () => {
            throw new StoreClosedError("Store ended for test");
        },
    };
}

/** A buffer that records the caches it is asked to persist instead of persisting them */
class DirtyRecordingBuffer extends ClientCacheBuffer {
    constructor(readonly dirty: DatasourceCache[]) {
        super(MemoryStorageDriver.create(), Instant);
    }

    override async persist(cache: DatasourceCache) {
        this.dirty.push(cache);
        return undefined;
    }

    override async clear(clear: () => Promise<void>) {
        await clear();
    }
}

const buffers = new Array<ClientCacheBuffer>();

/** A buffer that the hook of {@link closeBuffers} closes after the test, which stops its timer */
function newBuffer(driver: StorageDriver, interval: Duration) {
    const buffer = new ClientCacheBuffer(driver, interval);
    buffers.push(buffer);
    return buffer;
}

async function closeBuffers() {
    await Promise.all(buffers.splice(0).map(buffer => buffer.close()));
}

/** A memory driver that refuses a second open transaction, like a driver with one transaction per connection */
class SingleTransactionDriver extends MemoryStorageDriver {
    #open = false;

    override begin() {
        if (this.#open) {
            throw new StorageError("Transaction is in progress.");
        }
        this.#open = true;
        const ended = () => (this.#open = false);
        return new (class extends StorageDriver.Transaction {
            override async [Symbol.asyncDispose]() {
                await super[Symbol.asyncDispose]();
                ended();
            }
        })(this);
    }
}

/**
 * A memory driver whose next commit fails once {@link failNext} is called, and whose rollback fails too if
 * {@link failRollback} is set
 */
class FailingCommitDriver extends MemoryStorageDriver {
    #fail = false;
    failRollback = false;

    failNext() {
        this.#fail = true;
    }

    override begin() {
        const driver = this;
        return new (class extends StorageDriver.Transaction {
            override commit() {
                if (driver.#fail) {
                    driver.#fail = false;
                    throw new StorageError("Simulated commit failure");
                }
                return super.commit();
            }

            protected override rollback() {
                if (driver.failRollback) {
                    throw new StorageError("Simulated rollback failure");
                }
            }
        })(this);
    }
}

describe("DatasourceCache error handling", () => {
    afterEach(closeBuffers);

    describe("externalSet guard", () => {
        it("blocks after erase", async () => {
            const dirty: DatasourceCache[] = [];
            const buffer = new DirtyRecordingBuffer(dirty);
            const cache = createCache({ buffer });

            await cache.externalSet(attrs({ onOff: true }));
            expect(dirty).length(1);

            dirty.length = 0;
            await cache.erase();
            await cache.externalSet(attrs({ onOff: false }));
            expect(dirty).length(0);
        });

        it("blocks after reclaimValues but re-enables on consumer assignment", async () => {
            const dirty: DatasourceCache[] = [];
            const buffer = new DirtyRecordingBuffer(dirty);
            const cache = createCache({ buffer });

            await cache.externalSet(attrs({ onOff: true }));
            expect(dirty).length(1);

            dirty.length = 0;
            const mockConsumer = {
                releaseValues: () => ({}),
                readValues: () => ({}),
                integrate: () => undefined,
            } as any;
            cache.consumer = mockConsumer;
            cache.reclaimValues();

            // Blocked after reclaim
            await cache.externalSet(attrs({ onOff: false }));
            expect(dirty).length(0);

            // Re-enabled after new consumer
            cache.consumer = {
                releaseValues: () => ({}),
                readValues: () => ({}),
                integrate: () => undefined,
            } as any;
            await cache.externalSet(attrs({ onOff: true }));
            expect(dirty).length(1);
        });
    });

    describe("flush", () => {
        it("persists a report that carried nothing but a new version", async () => {
            const localWriter = trackingWriter();
            const buffer = newBuffer(MemoryStorageDriver.create(), Seconds(60));
            const cache = createCache({ buffer, localWriter });
            cache.consumer = {
                readValues: () => ({}),
                snapshot: () => ({}),
                releaseValues: () => ({}),
                integrate: () => undefined,
            } satisfies Datasource.ExternallyMutableStore.Consumer;

            await cache.externalSet(attrs({ __version__: 5 }));
            await buffer.flush();

            expect(localWriter.persisted).deep.equals([{ __version__: 5 }]);
        });

        // The cache marks dirty the keys its caller supplies and asks the consumer for those same keys at flush.  A
        // consumer that stores a value under a different key than it was given leaves nothing to persist
        it("persists a value the consumer stores under the key it was given", async () => {
            const localWriter = trackingWriter();
            const buffer = newBuffer(MemoryStorageDriver.create(), Seconds(60));
            const cache = createCache({ buffer, localWriter });

            const stored = {} as Val.Struct;
            cache.consumer = {
                readValues: (keys: Set<string>) => {
                    const result = {} as Val.Struct;
                    for (const key of keys) {
                        if (key in stored) {
                            result[key] = stored[key];
                        }
                    }
                    return result;
                },
                snapshot: () => ({ ...stored }),
                releaseValues: () => ({ ...stored }),
                integrate: values => {
                    for (const [key, value] of values) {
                        stored[String(key)] = value;
                    }
                    return undefined;
                },
            } satisfies Datasource.ExternallyMutableStore.Consumer;

            await cache.externalSet(attrs({ "1": 42 }));
            await buffer.flush();

            expect(localWriter.persisted).deep.equals([{ "1": 42, __version__: -1 }]);
        });
    });

    describe("forgetVersion", () => {
        function versionOnly(): Datasource.ExternallyMutableStore.Consumer {
            return {
                readValues: () => ({}),
                snapshot: () => ({}),
                releaseValues: () => ({}),
                integrate: () => undefined,
            };
        }

        it("persists the unknown version after a running flush that took the old version", async () => {
            const writes = new Array<string>();
            let releaseFlush!: () => void;
            const flushReleased = new Promise<void>(resolve => (releaseFlush = resolve));
            let flushStarted!: () => void;
            const flushing = new Promise<void>(resolve => (flushStarted = resolve));
            const localWriter = {
                persistInTransaction: async (_tx: unknown, _ep: unknown, _bid: unknown, values: Val.Struct) => {
                    flushStarted();
                    await flushReleased;
                    writes.push(`flushed ${values.__version__}`);
                },
            };
            const buffer = newBuffer(MemoryStorageDriver.create(), Seconds(60));
            const cache = createCache({ buffer, localWriter });
            cache.consumer = versionOnly();
            await cache.externalSet(attrs({ __version__: 5 }));

            const flushed = buffer.flush();
            await flushing;
            const forgotten = cache.forgetVersion();
            releaseFlush();
            await Promise.all([flushed, forgotten]);

            expect(writes).deep.equals(["flushed 5", `flushed ${Datasource.UNKNOWN_VERSION}`]);
        });

        it("persists nothing once erased", async () => {
            const localWriter = trackingWriter();
            const cache = createCache({ localWriter });
            await cache.erase();

            await cache.forgetVersion();

            expect(localWriter.persisted).deep.equals([]);
        });
    });

    describe("restoreDirtyKeys", () => {
        it("is a no-op after erase", async () => {
            const cache = createCache();
            await cache.erase();
            cache.restoreDirtyKeys(new Set(["onOff"]));

            const result = await cache.flush(await MemoryStorageDriver.create().begin());
            expect(result).undefined;
        });
    });

    describe("remote write participants", () => {
        it("registers same-named peers of different controllers in one transaction", async () => {
            const transaction = Transaction.open("test", Lifetime.mock, "rw");
            await createCache().prepare({ onOff: true }, PATH)(transaction);
            await createCache().prepare({ onOff: false }, PATH)(transaction);

            expect([...transaction.participants]).length(2);

            await transaction.resolve(undefined);
        });

        it("reuses one participant for the same peer", async () => {
            const writer = sendingWriter([]);
            const cacheFor = (behaviorId: string) =>
                new DatasourceCache({ writer, nodeId: "peer1", endpointNumber: EndpointNumber(1), behaviorId });

            const transaction = Transaction.open("test", Lifetime.mock, "rw");
            await cacheFor("6").prepare({ onOff: true }, PATH)(transaction);
            await cacheFor("8").prepare({ currentLevel: 1 }, PATH)(transaction);

            expect([...transaction.participants]).length(1);

            await transaction.resolve(undefined);
        });
    });
});

describe("settlement errors", () => {
    afterEach(closeBuffers);

    it("runs every release at conclusion and logs one that fails", async () => {
        const participant = new RemoteWriteParticipant(
            sendingWriter([
                {
                    kind: "attr-status",
                    path: { endpointId: EndpointNumber(1), clusterId: ClusterId(6), attributeId: AttributeId(0) },
                    status: Status.Success,
                },
                {
                    kind: "attr-status",
                    path: { endpointId: EndpointNumber(1), clusterId: ClusterId(8), attributeId: AttributeId(0) },
                    status: Status.Success,
                },
            ]),
            "peer1",
        );
        const released = new Array<string>();
        const receiver = (name: string, fail: boolean) => ({
            settleAccepted: async () => ({
                release: async () => {
                    if (fail) {
                        throw new Error(`${name} release failure`);
                    }
                    released.push(name);
                },
                persistFailure: undefined,
            }),
        });
        participant.set(preparedWrite(EndpointNumber(1), "6", { "0": true }), receiver("first", true), 0);
        participant.set(preparedWrite(EndpointNumber(1), "8", { "0": 1 }), receiver("second", false), 0);

        await participant.commit1();
        const warnings = await captureWarningsOf(() => participant.conclusion());

        expect(released).deep.equals(["second"]);
        expect(warnings.map(({ text }) => text).join("\n")).contains("first release failure");
    });

    it("applies a report whose persist failed and lets it outrank an older write", async () => {
        const cache = createCache({
            localWriter: {
                persistInTransaction: async () => {
                    throw new Error("persist failure");
                },
            },
        });
        const { integrated, consumer } = recordingConsumer();
        cache.consumer = consumer;

        const { persistFailure } = await cache.externalSet(attrs({ "1": "reported" }));
        expect(persistFailure).instanceOf(Error);
        await cache.settleAccepted({ "1": "accepted" }, 0);

        expect(integrated).deep.equals([{ "1": "reported" }]);
    });

    it("applies and announces an accepted value whose persist failed, and reports the failure", async () => {
        const cache = createCache({
            localWriter: {
                persistInTransaction: async () => {
                    throw new Error("persist failure");
                },
            },
        });
        const { values, announced, consumer } = recordingConsumer();
        cache.consumer = consumer;

        const { release, persistFailure } = await cache.settleAccepted({ "1": "accepted" }, 0);
        await release();

        expect(values).deep.equals({ "1": "accepted" });
        expect(announced).deep.equals([{ "1": "accepted" }]);
        expect(persistFailure).instanceOf(Error);
    });

    it("persists a settlement queued behind one whose persist failed", async () => {
        let failing = true;
        const persisted = new Array<Val.Struct>();
        const cache = createCache({
            localWriter: {
                persistInTransaction: async (_tx: unknown, _ep: unknown, _bid: unknown, values: Val.Struct) => {
                    if (failing) {
                        failing = false;
                        throw new Error("persist failure");
                    }
                    persisted.push(values);
                },
            },
        });
        const { integrated, consumer } = recordingConsumer();
        cache.consumer = consumer;

        expect((await cache.externalSet(attrs({ "1": "first" }))).persistFailure).instanceOf(Error);
        await cache.externalSet(attrs({ "1": "second" }));

        expect(persisted).deep.equals([{ "1": "second", __version__: Datasource.UNKNOWN_VERSION }]);
        expect(integrated).deep.equals([{ "1": "first" }, { "1": "second" }]);
    });

    it("does not persist a settlement queued behind another once the cache is discarded", async () => {
        const writer = gatedWriter();
        const cache = createCache({ localWriter: writer });
        cache.consumer = recordingConsumer().consumer;

        const first = cache.externalSet(attrs({ "1": "first" }));
        await writer.started(1);
        const second = cache.externalSet(attrs({ "1": "second" }));
        cache.discard();
        writer.pending[0].finish();
        await Promise.all([first, second]);

        expect(writer.pending).length(1);
        expect(writer.stored).deep.equals({ "1": "first", __version__: Datasource.UNKNOWN_VERSION });
    });

    it("keeps a report in memory while it persists and after persisting it fails", async () => {
        const writer = gatedWriter();
        const cache = createCache({ localWriter: writer });
        const { values, consumer } = recordingConsumer();
        cache.consumer = consumer;

        const report = cache.externalSet(attrs({ "1": "reported" }));
        await MockTime.yield();

        expect(values).deep.equals({ "1": "reported" });

        writer.pending[0].fail(new Error("persist failure"));
        const { persistFailure } = await report;

        expect(persistFailure).instanceOf(Error);
        expect(values).deep.equals({ "1": "reported" });
        expect(writer.stored).deep.equals({});
    });

    it("applies but does not announce a value when the cache is discarded while persisting it", async () => {
        let cache: DatasourceCache | undefined;
        cache = createCache({
            localWriter: {
                persistInTransaction: async () => {
                    cache?.discard();
                },
            },
        });
        const { integrated, announced, consumer } = recordingConsumer();
        cache.consumer = consumer;

        await cache.externalSet(attrs({ "1": "reported" }));

        expect(integrated).deep.equals([{ "1": "reported" }]);
        expect(announced).deep.equals([]);
    });

    it("erases its stored values after a flush that writes them", async () => {
        const writer = gatedWriter();
        let storedAtErase: Val.Struct | undefined;
        const cache = createCache({
            localWriter: {
                ...writer,
                erase: async () => {
                    storedAtErase = { ...writer.stored };
                },
            },
        });
        cache.consumer = recordingConsumer().consumer;

        const report = cache.externalSet(attrs({ "1": "reported" }));
        await writer.started(1);
        const erasing = cache.erase();
        await MockTime.yield();
        writer.pending[0].finish();
        await Promise.all([report, erasing]);

        expect(storedAtErase?.["1"]).equals("reported");
    });

    it("reports a transaction that fails to begin as the persist failure and persists at the next flush", async () => {
        const driver = MemoryStorageDriver.create();
        const begin = driver.begin.bind(driver);
        driver.begin = () => {
            driver.begin = begin;
            throw new StorageError("begin failure");
        };
        const writer = trackingWriter();
        const buffer = newBuffer(driver, Instant);
        const cache = createCache({ buffer, localWriter: writer });
        cache.consumer = recordingConsumer().consumer;

        const { persistFailure } = await cache.externalSet(attrs({ "1": "reported" }));
        await buffer.flush();

        expect(persistFailure).property("message", "begin failure");
        expect(writer.persisted).deep.equals([{ "1": "reported", __version__: Datasource.UNKNOWN_VERSION }]);
    });

    it("persists only the settled cache at once with an instant interval and leaves a failed one to its own retry", async () => {
        const buffer = newBuffer(MemoryStorageDriver.create(), Instant);
        let failingCalls = 0;
        const failing = createCache({
            buffer,
            localWriter: {
                persistInTransaction: async () => {
                    failingCalls++;
                    throw new StorageError("persist failure");
                },
            },
        });
        const healthyWriter = trackingWriter();
        const healthy = createCache({ buffer, localWriter: healthyWriter });
        failing.consumer = recordingConsumer().consumer;
        healthy.consumer = recordingConsumer().consumer;

        const warnings = await captureWarningsOf(async () => {
            const { persistFailure } = await failing.externalSet(attrs({ "1": "failing" }));
            expect(persistFailure).property("message", "persist failure");
            expect((await healthy.externalSet(attrs({ "1": "healthy" }))).persistFailure).undefined;
        });

        expect(failingCalls).equals(1);
        expect(healthyWriter.persisted).length(1);
        expect(warnings).deep.equals([]);

        const flushWarnings = await captureWarningsOf(() => buffer.flush());
        expect(failingCalls).equals(2);
        expect(flushWarnings.map(({ text }) => text)).length(1);
    });

    describe("a storage failure that lasts", () => {
        function toggledFailure() {
            const writer = {
                failing: true,
                persistInTransaction: async () => {
                    if (writer.failing) {
                        throw new StorageError("Storage refused for test");
                    }
                },
            };
            const buffer = newBuffer(MemoryStorageDriver.create(), Seconds(60));
            const cache = createCache({ buffer, localWriter: writer });
            cache.consumer = recordingConsumer().consumer;
            return { writer, buffer, cache };
        }

        it("warns once when each resubscribe retries the flush", async () => {
            const { buffer, cache } = toggledFailure();
            await cache.externalSet(attrs({ "1": "reported" }));

            const warnings = await captureWarningsOf(async () => {
                buffer.initiateFlush();
                buffer.initiateFlush();
                await buffer.flush();
            });

            expect(warnings.map(({ text }) => text)).length(1);
        });

        it("warns again once a flush ended without failure", async () => {
            const { writer, buffer, cache } = toggledFailure();
            await cache.externalSet(attrs({ "1": "reported" }));

            const warnings = await captureWarningsOf(async () => {
                await buffer.flush();
                writer.failing = false;
                await buffer.flush();
                writer.failing = true;
                await cache.externalSet(attrs({ "1": "reported again" }));
                await buffer.flush();
            });

            expect(warnings.map(({ text }) => text)).length(2);
        });
    });

    it("queues the settlement of one cache behind the running persist of another without a second transaction", async () => {
        const driver = new SingleTransactionDriver();
        driver.initialize();
        const buffer = newBuffer(driver, Instant);
        const slowWriter = gatedWriter();
        const slow = createCache({ buffer, localWriter: slowWriter });
        slow.consumer = recordingConsumer().consumer;
        const fastWriter = trackingWriter();
        const fast = createCache({ buffer, localWriter: fastWriter });
        fast.consumer = recordingConsumer().consumer;

        const slowSettling = slow.externalSet(attrs({ "1": "slow" }));
        await slowWriter.started(1);
        const fastSettling = fast.externalSet(attrs({ "1": "fast" }));
        for (let i = 0; i < 10; i++) {
            await MockTime.yield();
        }

        expect(fastWriter.persisted).length(0);
        slowWriter.pending[0].finish();
        const [slowSettled, fastSettled] = await Promise.all([slowSettling, fastSettling]);

        expect(slowSettled.persistFailure).undefined;
        expect(fastSettled.persistFailure).undefined;
        expect(fastWriter.persisted).length(1);
    });

    it("persists the settlements of one cache in the order they arrive", async () => {
        const buffer = newBuffer(MemoryStorageDriver.create(), Instant);
        const writer = gatedWriter();
        const cache = createCache({ buffer, localWriter: writer });
        cache.consumer = recordingConsumer().consumer;

        const first = cache.externalSet(attrs({ "1": "first" }));
        await writer.started(1);
        const second = cache.externalSet(attrs({ "1": "second" }));
        for (let i = 0; i < 10; i++) {
            await MockTime.yield();
        }

        expect(writer.pending).length(1);
        await writer.finishUntil(Promise.all([first, second]));
        expect(writer.stored).deep.equals({ "1": "second", __version__: Datasource.UNKNOWN_VERSION });
    });

    it("clears after every persist queued before the clear", async () => {
        const buffer = newBuffer(MemoryStorageDriver.create(), Instant);
        const writer = gatedWriter();
        let storedAtClear: Val.Struct | undefined;
        const cache = createCache({ buffer, localWriter: writer });
        cache.consumer = recordingConsumer().consumer;

        const first = cache.externalSet(attrs({ "1": "first" }));
        await writer.started(1);
        const second = cache.externalSet(attrs({ "1": "second" }));
        const clearing = buffer.clear(async () => {
            storedAtClear = { ...writer.stored };
        });
        await writer.finishUntil(Promise.all([first, second, clearing]));

        expect(storedAtClear?.["1"]).equals("second");
    });

    // Characterization: the dirty set drops a discarded cache at the next job either way; this pins that it writes
    // nothing
    it("does not flush a cache again that was discarded while its commit failed", async () => {
        const driver = new FailingCommitDriver();
        driver.initialize();
        const buffer = newBuffer(driver, Seconds(60));
        const writer = trackingWriter();
        let cache: DatasourceCache | undefined;
        cache = createCache({
            buffer,
            localWriter: {
                persistInTransaction: async (...args: Parameters<typeof writer.persistInTransaction>) => {
                    await writer.persistInTransaction(...args);
                    cache?.discard();
                },
            },
        });
        cache.consumer = recordingConsumer().consumer;
        await cache.externalSet(attrs({ "1": "reported" }));

        driver.failNext();
        await captureWarningsOf(() => buffer.flush());
        await buffer.flush();

        expect(writer.persisted).length(1);
        expect(cache.isDirty).equals(false);
    });

    it("keeps a cache discarded after it was buffered out of later flushes", async () => {
        const buffer = newBuffer(MemoryStorageDriver.create(), Seconds(60));
        const cache = createCache({ buffer, localWriter: trackingWriter() });
        cache.consumer = recordingConsumer().consumer;
        let flushes = 0;
        const flush = cache.flush.bind(cache);
        cache.flush = tx => {
            flushes++;
            return flush(tx);
        };
        await cache.externalSet(attrs({ "1": "reported" }));
        cache.discard();

        await buffer.flush();
        await buffer.flush();

        expect(flushes).equals(1);
    });

    it("reports a failed commit whose rollback fails too and logs the rollback failure as a warning", async () => {
        const driver = new FailingCommitDriver();
        driver.initialize();
        driver.failRollback = true;
        const buffer = newBuffer(driver, Instant);
        const cache = createCache({ buffer, localWriter: trackingWriter() });
        cache.consumer = recordingConsumer().consumer;

        driver.failNext();
        let persistFailure: unknown;
        const log = await captureAllLogOf(async () => {
            ({ persistFailure } = await cache.externalSet(attrs({ "1": "reported" })));
        });

        expect(persistFailure).property("message", "Simulated commit failure");
        expect(
            log.filter(({ text }) => text.includes("Simulated rollback failure")).map(({ level }) => level),
        ).deep.equals([LogLevel.WARN]);
    });

    it("clears after the final flush when it closes meanwhile", async () => {
        const writer = gatedWriter();
        const buffer = newBuffer(MemoryStorageDriver.create(), Seconds(60));
        const cache = createCache({ buffer, localWriter: writer });
        cache.consumer = recordingConsumer().consumer;
        await cache.externalSet(attrs({ "1": "buffered" }));

        const closing = buffer.close();
        await writer.started(1);
        let storedAtClear: Val.Struct | undefined;
        const clearing = buffer.clear(async () => {
            storedAtClear = { ...writer.stored };
        });
        await writer.finishUntil(Promise.all([closing, clearing]));

        expect(storedAtClear?.["1"]).equals("buffered");
    });

    it("flushes a cache again whose values were not readable at the earlier flush", async () => {
        const writer = trackingWriter();
        const buffer = newBuffer(MemoryStorageDriver.create(), Seconds(60));
        const cache = createCache({ buffer, localWriter: writer });
        const recording = recordingConsumer();
        let readable = false;
        cache.consumer = {
            ...recording.consumer,
            readValues: keys => (readable ? recording.consumer.readValues(keys) : {}),
        };
        await cache.externalSet(attrs({ "1": "reported" }));

        await buffer.flush();
        readable = true;
        await buffer.flush();

        expect(writer.persisted).deep.equals([{ "1": "reported", __version__: Datasource.UNKNOWN_VERSION }]);
    });

    it("retries a failed commit with the next persist of the cache", async () => {
        const driver = new FailingCommitDriver();
        driver.initialize();
        const buffer = newBuffer(driver, Instant);
        const writer = trackingWriter();
        const cache = createCache({ buffer, localWriter: writer });
        cache.consumer = recordingConsumer().consumer;

        driver.failNext();
        const { persistFailure } = await cache.externalSet(attrs({ "1": "first" }));
        await cache.externalSet(attrs({ "2": "second" }));

        expect(persistFailure).property("message", "Simulated commit failure");
        expect(writer.persisted.at(-1)).deep.equals({
            "1": "first",
            "2": "second",
            __version__: Datasource.UNKNOWN_VERSION,
        });
    });

    it("persists the values still buffered when it closes", async () => {
        const buffer = newBuffer(MemoryStorageDriver.create(), Seconds(60));
        const writer = trackingWriter();
        const cache = createCache({ buffer, localWriter: writer });
        cache.consumer = recordingConsumer().consumer;
        await cache.externalSet(attrs({ "1": "buffered" }));

        expect(writer.persisted).deep.equals([]);
        await buffer.close();

        expect(writer.persisted).deep.equals([{ "1": "buffered", __version__: Datasource.UNKNOWN_VERSION }]);
    });

    for (const [mode, interval] of [
        ["instant", Instant],
        ["timer", Seconds(60)],
    ] as const) {
        it(`drops a settlement and a forgotten version after the buffer closed (${mode} interval)`, async () => {
            const buffer = newBuffer(MemoryStorageDriver.create(), interval);
            const writer = trackingWriter();
            const cache = createCache({ buffer, localWriter: writer });
            cache.consumer = recordingConsumer().consumer;
            await buffer.close();

            const log = await captureAllLogOf(async () => {
                const { persistFailure } = await cache.externalSet(attrs({ "1": "reported" }));
                expect(persistFailure).undefined;
            });
            await cache.forgetVersion();
            buffer.initiateFlush();
            await buffer.flush();

            expect(writer.persisted).deep.equals([]);
            expect(
                log.map(({ level, text }) => ({ level, dropped: text.includes("cache buffer closed") })),
            ).deep.equals([{ level: LogLevel.DEBUG, dropped: true }]);
        });
    }

    it("rejects a forgotten version it fails to persist", async () => {
        const cache = createCache({ localWriter: failingWriter("persist failure") });
        cache.consumer = recordingConsumer().consumer;

        await expect(cache.forgetVersion()).rejectedWith("persist failure");
    });

    it("sends nothing it held before a rollback", async () => {
        const sent = new Array<RemoteWriter.PreparedWrite[]>();
        const participant = new RemoteWriteParticipant(
            {
                assertWritable: () => {},
                prepare: ({ number, behaviorId, values }) => preparedWrite(number, behaviorId, values),
                send: async writes => {
                    sent.push(writes);
                    return [];
                },
            },
            "peer1",
        );
        const receiver = { settleAccepted: async () => ({ release: async () => {} }) };
        participant.set(preparedWrite(EndpointNumber(1), "6", { "0": true }), receiver, 0);

        participant.rollback();
        await participant.commit1();

        expect(sent).deep.equals([]);
    });

    it("refuses a second write of the same cluster in one commit", () => {
        const participant = new RemoteWriteParticipant(sendingWriter([]), "peer1");
        const receiver = { settleAccepted: async () => ({ release: async () => {} }) };
        participant.set(preparedWrite(EndpointNumber(1), "6", { "0": true }), receiver, 0);

        expect(() => participant.set(preparedWrite(EndpointNumber(1), "6", { "0": false }), receiver, 0)).throws(
            InternalError,
        );
    });

    it("logs a value it failed to settle and still fails a declined write", async () => {
        const participant = new RemoteWriteParticipant(
            sendingWriter([
                {
                    kind: "attr-status",
                    path: { endpointId: EndpointNumber(1), clusterId: ClusterId(6), attributeId: AttributeId(0) },
                    status: Status.Success,
                },
                {
                    kind: "attr-status",
                    path: { endpointId: EndpointNumber(1), clusterId: ClusterId(8), attributeId: AttributeId(0) },
                    status: Status.ConstraintError,
                },
            ]),
            "peer1",
        );
        const settled = new Array<Val.Struct>();
        participant.set(
            preparedWrite(EndpointNumber(1), "6", { "0": true }),
            {
                settleAccepted: async () => {
                    throw new Error("settle failure");
                },
            },
            0,
        );
        participant.set(
            preparedWrite(EndpointNumber(1), "8", { "0": 1 }),
            {
                settleAccepted: async values => {
                    settled.push(values);
                    return { release: async () => {} };
                },
            },
            0,
        );

        let caught: unknown;
        const warnings = await captureWarningsOf(async () => {
            caught = await participant.commit1().then(
                () => undefined,
                (e: unknown) => e,
            );
        });

        expect(caught).instanceOf(StatusResponseError);
        expect(settled).deep.equals([{}]);
        expect(warnings.map(({ text }) => text).join("\n")).contains("settle failure");
    });

    it("logs an accepted value it failed to persist and still succeeds", async () => {
        const participant = new RemoteWriteParticipant(
            sendingWriter([
                {
                    kind: "attr-status",
                    path: { endpointId: EndpointNumber(1), clusterId: ClusterId(6), attributeId: AttributeId(0) },
                    status: Status.Success,
                },
            ]),
            "peer1",
        );
        participant.set(
            preparedWrite(EndpointNumber(1), "6", { "0": true }),
            {
                settleAccepted: async () => ({
                    release: async () => {},
                    persistFailure: new Error("persist failure"),
                }),
            },
            0,
        );

        const warnings = await captureWarningsOf(() => participant.commit1());

        expect(warnings.map(({ text }) => text).join("\n")).contains("persist failure");
    });
});

describe("remote write preparation", () => {
    class PreparedState {
        foo?: number;
    }

    const supervisor = RootSupervisor.for(
        new ClusterModel({
            id: 0xfff1_fc98,
            name: "Prepared",
            children: [AttributeElement({ id: 1, name: "Foo", type: "uint8", access: "RW" })],
        }),
    );

    /**
     * The mirror of one cluster of a peer, whose writer refuses with {@link refusal} if given and records what it
     * sends.
     */
    function mirrorOf(name: string, refusal?: Error) {
        const sent = new Array<RemoteWriter.PreparedWrite[]>();
        const writer: RemoteWriter = {
            assertWritable: () => {},
            prepare: ({ number, behaviorId, values }) => {
                if (refusal !== undefined) {
                    throw refusal;
                }
                return preparedWrite(number, behaviorId, values);
            },
            send: async writes => {
                sent.push(writes);
                return [];
            },
        };
        const datasource = Datasource({
            entropy: MockCrypto(),
            type: PreparedState,
            supervisor,
            location: { endpoint: EndpointNumber(1), path: new DataModelPath(name) },
            primaryKey: "id",
            store: new DatasourceCache({ writer, nodeId: name, endpointNumber: EndpointNumber(1), behaviorId: "1" }),
        });
        return { name, sent, datasource };
    }

    for (const refusedFirst of [false, true]) {
        const order = refusedFirst ? "first" : "last";

        it(`sends nothing to any peer when one refuses, with the refusing peer ${order}`, async () => {
            const refusal = new WriteError({ path: "refused" }, "refused by the peer's writer", Status.ConstraintError);
            const accepting = mirrorOf("accepting");
            const refusing = mirrorOf("refusing", refusal);

            let caught: unknown;
            try {
                await LocalActorContext.act("two peers", context => {
                    for (const { datasource } of refusedFirst ? [refusing, accepting] : [accepting, refusing]) {
                        datasource.reference(context).foo = 1;
                    }
                });
            } catch (e) {
                caught = e;
            }

            expect(caught).equals(refusal);
            expect(accepting.sent).deep.equals([]);
            expect(refusing.sent).deep.equals([]);
        });
    }

    it("sends to every peer when none refuses", async () => {
        const mirrors = [mirrorOf("first"), mirrorOf("second")];

        await LocalActorContext.act("two peers", context => {
            for (const { datasource } of mirrors) {
                datasource.reference(context).foo = 1;
            }
        });

        expect(mirrors.map(({ sent }) => sent)).deep.equals([
            [[{ number: 1, behaviorId: "1", values: { 1: 1 }, attributes: [], declined: [] }]],
            [[{ number: 1, behaviorId: "1", values: { 1: 1 }, attributes: [], declined: [] }]],
        ]);
    });
});

describe("ClientCacheBuffer error handling", () => {
    afterEach(closeBuffers);

    it("drops a cache whose store ended without failing the batch", async () => {
        const driver = MemoryStorageDriver.create();
        const buffer = newBuffer(driver, Seconds(60));

        const healthy = trackingWriter();
        const healthyCache = createCache({ buffer, localWriter: healthy });

        const erasedCache = createCache({ buffer, localWriter: endedWriter() });

        // Mark both dirty with initial values so flush has data to write
        healthyCache.initialValues = { onOff: true };
        await healthyCache.externalSet(attrs({ onOff: true }));

        erasedCache.initialValues = { level: 50 };
        await erasedCache.externalSet(attrs({ level: 50 }));

        const failures = await captureWarningsOf(() => buffer.flush());

        expect(healthy.persisted).length(1);
        expect(failures).deep.equals([]);
    });

    it("restores dirty keys on commit failure", async () => {
        let commitShouldFail = false;

        const driver = MemoryStorageDriver.create();
        const originalBegin = driver.begin.bind(driver);
        driver.begin = () => {
            const tx = originalBegin() as StorageDriver.Transaction;
            const originalCommit = tx.commit.bind(tx);
            tx.commit = () => {
                if (commitShouldFail) {
                    throw new Error("Simulated commit failure");
                }
                return originalCommit();
            };
            return tx;
        };

        const writer = trackingWriter();
        const buffer = newBuffer(driver, Seconds(60));
        const cache = createCache({ buffer, localWriter: writer });

        cache.initialValues = { onOff: false };
        await cache.externalSet(attrs({ onOff: true }));

        // First flush with commit failure
        commitShouldFail = true;
        try {
            await buffer.flush();
        } catch {
            // Expected
        }

        // Writer was called but commit failed
        expect(writer.persisted).length(1);

        // Retry should work because dirty keys were restored
        commitShouldFail = false;
        writer.persisted.length = 0;
        await buffer.flush();

        // Writer called again on retry
        expect(writer.persisted).length(1);
    });

    it("drops a cache whose store ended after a failed commit at the next flush", async () => {
        let commitShouldFail = true;

        const driver = MemoryStorageDriver.create();
        const originalBegin = driver.begin.bind(driver);
        driver.begin = () => {
            const tx = originalBegin() as StorageDriver.Transaction;
            const originalCommit = tx.commit.bind(tx);
            tx.commit = () => {
                if (commitShouldFail) {
                    throw new Error("Simulated commit failure");
                }
                return originalCommit();
            };
            return tx;
        };

        let ended = false;
        const persisted = new Array<Val.Struct>();
        const buffer = newBuffer(driver, Seconds(60));
        const cache = createCache({
            buffer,
            localWriter: {
                persistInTransaction: async (_tx, _ep, _bid, values: Val.Struct) => {
                    if (ended) {
                        throw new StoreClosedError("Store ended for test");
                    }
                    persisted.push(values);
                },
            },
        });
        cache.initialValues = { onOff: false };
        await cache.externalSet(attrs({ onOff: true }));
        await captureWarningsOf(() => buffer.flush());
        commitShouldFail = false;
        ended = true;

        const failures = await captureWarningsOf(() => buffer.flush());
        ended = false;
        await buffer.flush();

        expect(failures).deep.equals([]);
        expect(persisted).length(1);
    });
});
