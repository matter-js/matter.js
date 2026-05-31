/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "#MatterError.js";
import { Time } from "#time/Time.js";
import { Timestamp } from "#time/Timestamp.js";
import { createPromise } from "#util/Promises.js";
import { Scheduler } from "#util/Scheduler.js";

interface Work {
    at: Timestamp;
    id: number;
}

describe("Scheduler", () => {
    before(() => MockTime.enable());

    it("runs due workers in scheduled-time order", async () => {
        const ran = new Array<number>();
        const { promise, resolver } = createPromise<void>();

        const scheduler = new Scheduler<Work>({
            timeOf: work => work.at,
            run: work => {
                ran.push(work.id);
                if (ran.length === 2) {
                    resolver();
                }
            },
        });

        const now = Time.nowMs;
        scheduler.add({ at: (now + 50) as Timestamp, id: 2 });
        scheduler.add({ at: (now + 10) as Timestamp, id: 1 });

        await MockTime.resolve(promise);
        await MockTime.resolve(scheduler.close());

        expect(ran).deep.equal([1, 2]);
    });

    it("throws when scheduling after close", async () => {
        const scheduler = new Scheduler<Work>({
            timeOf: work => work.at,
            run: () => {},
        });

        await MockTime.resolve(scheduler.close());

        expect(() => scheduler.add({ at: Time.nowMs, id: 1 })).throws(ImplementationError, "closed");
    });
});
