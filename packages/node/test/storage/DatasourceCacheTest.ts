/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Datasource } from "#behavior/state/managed/Datasource.js";
import { DatasourceCache } from "#storage/client/DatasourceCache.js";
import { createPromise } from "@matter/general";
import { Val } from "@matter/protocol";
import { EndpointNumber } from "@matter/types";
import { attrs, createCache, gatedWriter, recordingConsumer, trackingWriter } from "./cache-test-helpers.js";

describe("DatasourceCache settlement order", () => {
    it("does not let a write answered later override one accepted since it was queued", async () => {
        const cache = createCache();
        const { integrated, consumer } = recordingConsumer();
        cache.consumer = consumer;

        // Both queued at epoch 0; the later write is answered first
        await cache.settleAccepted({ "1": "later" }, 0);
        await cache.settleAccepted({ "1": "earlier" }, 0);

        expect(integrated).deep.equals([{ "1": "later" }]);
    });

    it("applies an accepted value at once and announces it, and what follows, on release", async () => {
        const cache = createCache();
        const { values, announced, consumer } = recordingConsumer();
        cache.consumer = consumer;

        const { release } = await cache.settleAccepted({ "1": "accepted" }, 0);
        await cache.externalSet(attrs({ "1": "reported" }));

        expect(values).deep.equals({ "1": "reported" });
        expect(announced).deep.equals([]);

        await release();

        expect(announced).deep.equals([{ "1": "accepted" }, { "1": "reported" }]);
    });

    it("keeps a report still persisting over an older write answered meanwhile", async () => {
        const writer = gatedWriter();
        const cache = createCache({ localWriter: writer });
        const { integrated, consumer } = recordingConsumer();
        cache.consumer = consumer;

        const report = cache.externalSet(attrs({ "1": "reported" }));
        await cache.settleAccepted({ "1": "accepted" }, 0);
        writer.pending[0].finish();
        await report;

        expect(writer.pending).length(1);
        expect(integrated).deep.equals([{ "1": "reported" }]);
    });

    it("keeps a report that arrives while an accepted value persists", async () => {
        const writer = gatedWriter();
        const cache = createCache({ localWriter: writer });
        const { integrated, consumer } = recordingConsumer();
        cache.consumer = consumer;

        const accepted = cache.settleAccepted({ "1": "accepted" }, 0);
        const report = cache.externalSet(attrs({ "1": "reported" }));
        await MockTime.yield();
        writer.pending[0].finish();
        await accepted;
        await MockTime.yield();
        writer.pending[1].finish();
        await report;

        expect(integrated).deep.equals([{ "1": "reported" }]);
    });

    it("stores the latest settlement of a key when an older one would finish persisting last", async () => {
        const writer = gatedWriter();
        const cache = createCache({ localWriter: writer });
        cache.consumer = recordingConsumer().consumer;

        const accepted = cache.settleAccepted({ "1": "accepted" }, 0);
        const report = cache.externalSet(attrs({ "1": "reported" }));

        await writer.finishNewestFirst(2);
        await Promise.all([accepted, report]);

        const restarted = new DatasourceCache({
            writer: async () => [],
            nodeId: "test-peer",
            endpointNumber: EndpointNumber(1),
            behaviorId: "test",
            initialValues: { ...writer.stored },
        });
        expect(restarted.initialValues?.["1"]).equals("reported");
    });

    it("persists nothing when the device accepted nothing", async () => {
        const writer = trackingWriter();
        const cache = createCache({ localWriter: writer });
        cache.consumer = recordingConsumer().consumer;

        await cache.settleAccepted({}, 0);

        expect(writer.persisted).deep.equals([]);
    });

    it("settles an accepted value into the seed while no consumer is attached", async () => {
        const cache = createCache();

        const { release } = await cache.settleAccepted({ "1": "accepted" }, 0);
        await release();

        expect(cache.initialValues).deep.equals({ "1": "accepted" });
    });

    it("announces one change at a time when settlements arrive during an announcement", async () => {
        const cache = createCache();
        const log = new Array<string>();
        const { promise: firstHeld, resolver: releaseFirst } = createPromise<void>();
        cache.consumer = {
            readValues: () => ({}),
            snapshot: () => ({}),
            releaseValues: () => ({}),
            integrate: (changes: Val.StructMap) => {
                const value = String(changes.get("1"));
                return async () => {
                    log.push(`start ${value}`);
                    if (value === "first") {
                        await firstHeld;
                    }
                    log.push(`end ${value}`);
                };
            },
        } satisfies Datasource.ExternallyMutableStore.Consumer;

        const first = cache.externalSet(attrs({ "1": "first" }));
        await MockTime.yield();
        const second = cache.externalSet(attrs({ "1": "second" }));
        await MockTime.yield();
        releaseFirst();
        await Promise.all([first, second]);

        expect(log).deep.equals(["start first", "end first", "start second", "end second"]);
    });

    it("stores a forgotten version after a settlement that arrived before", async () => {
        const writer = gatedWriter();
        const cache = createCache({ localWriter: writer });
        cache.consumer = recordingConsumer().consumer;

        const report = cache.externalSet(attrs({ "1": "reported", __version__: 5 }));
        const forgotten = cache.forgetVersion();
        await writer.finishNewestFirst(2);
        await Promise.all([report, forgotten]);

        expect(writer.stored[DatasourceCache.VERSION_KEY]).equals(-1);
    });

    it("resolves a release while an earlier announcement still runs, and announces in settlement order", async () => {
        const cache = createCache();
        const announced = new Array<string>();
        const { promise: held, resolver: lift } = createPromise<void>();
        cache.consumer = {
            readValues: () => ({}),
            snapshot: () => ({}),
            releaseValues: () => ({}),
            integrate: (changes: Val.StructMap) => {
                const value = String(changes.get("1"));
                return async () => {
                    if (value === "reported") {
                        await held;
                    }
                    announced.push(value);
                };
            },
        } satisfies Datasource.ExternallyMutableStore.Consumer;

        const report = cache.externalSet(attrs({ "1": "reported" }));
        await MockTime.yield();
        const { release } = await cache.settleAccepted({ "1": "accepted" }, 1);
        await release();

        expect(announced).deep.equals([]);

        lift();
        await report;

        expect(announced).deep.equals(["reported", "accepted"]);
    });

    it("announces later settlements after an announcement that throws", async () => {
        const cache = createCache();
        const announced = new Array<string>();
        cache.consumer = {
            readValues: () => ({}),
            snapshot: () => ({}),
            releaseValues: () => ({}),
            integrate: (changes: Val.StructMap) => {
                const value = String(changes.get("1"));
                return () => {
                    if (value === "first") {
                        throw new Error("announcement failure");
                    }
                    announced.push(value);
                };
            },
        } satisfies Datasource.ExternallyMutableStore.Consumer;

        const { release } = await cache.settleAccepted({ "1": "first" }, 0);
        const report = cache.externalSet(attrs({ "1": "second" }));
        await report;
        await release();
        await cache.externalSet(attrs({ "1": "third" }));

        expect(announced).deep.equals(["second", "third"]);
    });

    it("does not hold a new consumer's reports behind an announcement of the reclaimed one", async () => {
        const cache = createCache();
        cache.consumer = recordingConsumer().consumer;
        await cache.settleAccepted({ "1": "accepted" }, 0);

        cache.reclaimValues();
        const { announced, consumer } = recordingConsumer();
        cache.consumer = consumer;
        await cache.externalSet(attrs({ "1": "reported" }));

        expect(announced).deep.equals([{ "1": "reported" }]);
    });
});
