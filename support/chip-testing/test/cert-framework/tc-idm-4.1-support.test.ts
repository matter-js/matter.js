/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Millis, Seconds } from "@matter/main";
import { ImplementationError } from "@matter/main";
import type {
    CertDevice,
    CertNodeApi,
    CertStepContext,
    CheckRecord,
    ControllerAdapter,
    DeviceExitInfo,
    DeviceFlavor,
    Subject,
} from "@matter/testing";
import { LineQueue, LogFollower, PicsFile } from "@matter/testing";
import { env } from "node:process";
import type { SubscribeAndModifyTimeouts } from "../cert/tc-idm-4.1-support.js";
import { subscribeAndModify } from "../cert/tc-idm-4.1-support.js";
import { CertCheckFailedError } from "../cert/tc-support.js";

const SUBSCRIPTION_ID = 0x2a;

// Two other live subscriptions' ids. TC-IDM-4.1 keeps every subscription it establishes, so from its
// step 3 onward the TH reports to several at once; on chip-tool they even share one command object,
// which is what makes one attribute change arrive as several reports.
const UNACKED_SIBLING_ID = 0x99;
const ACKED_SIBLING_ID = 0x77;

const PATH = { endpoint: 0, cluster: 0x28, attribute: 0x10 };
const VALUES = [true, false, true];

const TIMEOUTS: SubscribeAndModifyTimeouts = { establish: Seconds(5), report: Seconds(5) };

// Only for the cases that assert a wait giving up: long enough for the follower's async pump, short
// enough that the failure lands inside a normal mocha timeout.
const IMPATIENT: SubscribeAndModifyTimeouts = { establish: Seconds(5), report: Millis(400) };

function subscribeRequestLines(path: { endpoint: number; cluster: number; attribute: number }): string[] {
    const attribute = path.attribute.toString(16).toUpperCase().padStart(8, "0");
    return [
        "[DMG] SubscribeRequestMessage =",
        "[DMG] {",
        "[DMG] AttributePathIB =",
        "[DMG] {",
        `[DMG] Endpoint = 0x${path.endpoint.toString(16)},`,
        `[DMG] Cluster = 0x${path.cluster.toString(16)},`,
        `[DMG] Attribute = 0x${attribute.slice(0, 4)}_${attribute.slice(4)},`,
        "[DMG] }",
    ];
}

function subscribeResponseLines(subscriptionId: number): string[] {
    return ["[DMG] SubscribeResponseMessage =", "[DMG] {", `[DMG] SubscriptionId = 0x${subscriptionId.toString(16)},`];
}

function stubSubject(): Subject {
    return {
        id: "stub",
        app: "all-clusters",
        commissioning: { kind: "on-network", passcode: 20202021, discriminator: 3840, qrPairingCode: "" },
        pics: new PicsFile([]),
        async initialize() {},
        async start() {},
        async stop() {},
        async close() {},
        async snapshot() {
            return {};
        },
        async restore() {},
        async backchannel() {},
    };
}

/**
 * Drives {@link subscribeAndModify} against a hand-fed TH log and a {@link CertNodeApi} that reports
 * whatever `onWrite` tells it to, so what a write's confirmation actually depends on is observable.
 */
class Fixture {
    readonly checks = new Array<CheckRecord>();
    readonly cx: CertStepContext;
    readonly #source = new LineQueue();
    readonly #log: LogFollower;
    #onUpdate: ((value: unknown) => void) | undefined;
    #writes = 0;
    #exchange = 0;

    constructor(
        flavor: DeviceFlavor,
        readonly onWrite: (fixture: Fixture, index: number, value: unknown) => void,
        readonly onSubscribe: (fixture: Fixture) => void = () => {},
    ) {
        this.#log = new LogFollower(this.#source, "th");

        const unused = () => Promise.reject(new InternalError("not used by these tests"));
        const node: CertNodeApi = {
            invoke: unused,
            invokeBatch: unused,
            readAttribute: unused,
            readAttributes: unused,
            writeAttributes: unused,
            readEvents: unused,
            subscribeEvents: unused,
            openCommissioningWindow: unused,
            operationalMdnsInstanceName: unused,
            decommission: unused,
            subscribe: async (_path, opts) => {
                this.#onUpdate = opts.onUpdate;
                this.push(...subscribeRequestLines(PATH), ...subscribeResponseLines(SUBSCRIPTION_ID));
                if (this.primingCarriesData) {
                    this.pushReport(SUBSCRIPTION_ID);
                } else {
                    this.pushKeepalive(SUBSCRIPTION_ID);
                }
                this.onSubscribe(this);
                // Every line pushed so far is in the log before the helper takes its first per-write
                // mark, which is what makes "this report predates the write" deterministic here.
                await new Promise(resolve => setImmediate(resolve));
                return undefined;
            },
            writeAttribute: async (_path, value) => {
                this.onWrite(this, this.#writes++, value);
            },
        };

        const device: CertDevice = {
            ...stubSubject(),
            flavor,
            log: this.#log,
            exit: new Promise<DeviceExitInfo>(() => {}),
        };

        const controller: ControllerAdapter = {
            id: "dut",
            log: this.#log,
            async start() {},
            async close() {},
            async commission() {
                return "ref";
            },
            async parseQrPayload() {
                throw new InternalError("not used in this test");
            },
            async parseManualPairingCode(): Promise<never> {
                throw new InternalError("not used in this test");
            },
            node: () => node,
        };

        this.cx = {
            devices: { th: device },
            controllers: { dut: controller },
            recorder: {
                beginStep: () => {},
                check: record => void this.checks.push(record),
                endStep: () => [],
                flush: async () => "",
            },
        };
    }

    push(...lines: string[]): void {
        for (const line of lines) {
            this.#source.push(line);
        }
    }

    /**
     * Whether the priming report carries data. A subscription can be established with nothing to report
     * yet — ordinary for an event subscription — so the priming check must accept a report without any.
     */
    primingCarriesData = true;

    /**
     * One report on `subscriptionId` carrying attribute data, plus the DUT's ack on the same CHIP
     * exchange unless `acked` is false. `status` is the ack's own status line, so a caller can hand back
     * a rejection.
     */
    pushReport(subscriptionId: number, acked = true, status = "Status = 0x00 (SUCCESS),"): void {
        this.#pushReportData(subscriptionId, ["[DMG] AttributeReportIBs =", "[DMG] ["], acked, status);
    }

    /**
     * One keepalive on `subscriptionId`: the report an idle subscription sends at its maximum interval,
     * which carries no data and prints `InteractionModelRevision` where a report prints its data — the
     * shape a chip-local TC-IDM-4.1 run's device log holds six of. It is acked like any other report.
     */
    pushKeepalive(subscriptionId: number, acked = true, status = "Status = 0x00 (SUCCESS),"): void {
        this.#pushReportData(subscriptionId, ["[DMG] InteractionModelRevision = 12"], acked, status);
    }

    #pushReportData(subscriptionId: number, body: string[], acked: boolean, status: string): void {
        const exchange = ++this.#exchange;
        this.push(
            `[DMG] >> to UDP:[fe80::1%en0]:5540 | 1234${exchange} | [Interaction Model  (1) / Report Data (0x05) / Session = 1 / Exchange = ${exchange}]`,
            "[DMG] ReportDataMessage =",
            "[DMG] {",
            `[DMG] SubscriptionId = 0x${subscriptionId.toString(16)},`,
            ...body,
        );
        if (acked) {
            this.push(
                `[DMG] << from UDP:[fe80::1%en0]:5540 | 5678${exchange} | [Interaction Model  (1) / Status Response (0x01) / Session = 1 / Exchange = ${exchange}]`,
                "[DMG] StatusResponseMessage =",
                "[DMG] {",
                `[DMG] ${status}`,
            );
        }
    }

    /** Delivers one subscription report to the value-asserting `onUpdate` seam. */
    report(value: unknown): void {
        this.#onUpdate?.(value);
    }

    run(values: unknown[] = VALUES, timeouts: SubscribeAndModifyTimeouts = TIMEOUTS): Promise<void> {
        return subscribeAndModify(this.cx, "ref", 3, PATH, values, timeouts);
    }

    async close(): Promise<void> {
        this.#source.close();
        await this.#log.close();
    }

    get failures(): CheckRecord[] {
        return this.checks.filter(check => check.verdict === "fail");
    }

    get passes(): CheckRecord[] {
        return this.checks.filter(check => check.verdict === "pass");
    }
}

async function withFixture(fixture: Fixture, body: (fixture: Fixture) => Promise<void>): Promise<void> {
    try {
        await body(fixture);
    } finally {
        await fixture.close();
    }
}

describe("subscribeAndModify", () => {
    it("refuses values a write would not change, which report nothing and would time out unexplained", async () => {
        await withFixture(new Fixture("chip-local", () => {}), async fixture => {
            await expect(fixture.run([true, true])).rejectedWith(ImplementationError);
        });
    });

    it("refuses structurally equal values, which is what decides whether the attribute changed", async () => {
        // Separately allocated and carrying a bigint: reference equality would let this through, and
        // rendering the offending value with JSON.stringify would throw instead of naming it
        await withFixture(new Fixture("chip-local", () => {}), async fixture => {
            await expect(fixture.run([{ nodes: [1n, 2n] }, { nodes: [1n, 2n] }])).rejectedWith(
                ImplementationError,
                /repeats at index 1/,
            );
        });
    });

    it("completes when each write is reported twice and other subscriptions report alongside", async () => {
        const fixture = new Fixture("chip-local", (f, _index, value) => {
            // The sibling report ahead of ours carries no ack of its own: a wait that anchored on
            // arrival order rather than on the subscription id would settle on this one and then time
            // out looking for an ack that belongs to nobody.
            f.pushReport(UNACKED_SIBLING_ID, false);
            f.pushReport(SUBSCRIPTION_ID);
            f.pushReport(ACKED_SIBLING_ID);
            f.report(value);
            f.report(value);
        });

        await withFixture(fixture, async f => {
            await f.run();

            expect(f.failures).deep.equal([]);
            const summary = f.passes[f.passes.length - 1];
            expect(summary.detail).match(/each confirmed by its own report on subscription 0x2a/);
            expect(summary.detail).match(/onUpdate delivered 6 reports, 3\/3 of the written values in order/);
        });
    });

    it("fails when the DUT rejects our report, even though later acks succeed", async () => {
        const fixture = new Fixture("chip-local", (f, _index, value) => {
            f.pushReport(SUBSCRIPTION_ID, true, "Status = 0x01 (FAILURE),");
            // The successes a forward search would settle on instead: this run acks one report per
            // write per live subscription, so a rejection is always followed by somebody's success.
            f.pushReport(ACKED_SIBLING_ID);
            f.report(value);
        });

        await withFixture(fixture, async f => {
            await expect(f.run([true], IMPATIENT)).rejectedWith(
                CertCheckFailedError,
                /ack check failed for step 3, write 1\/1/,
            );
            expect(f.failures.some(check => check.detail?.includes("0x01 (FAILURE)"))).equal(true);
        });
    });

    it("fails the write whose only report predates it", async () => {
        const fixture = new Fixture(
            "chip-local",
            (f, _index, value) => f.report(value),
            // A further chunk of the priming report, already in the log when the write is issued.
            f => f.pushReport(SUBSCRIPTION_ID),
        );

        await withFixture(fixture, async f => {
            await expect(f.run([true], IMPATIENT)).rejectedWith(
                CertCheckFailedError,
                /ack check failed for step 3, write 1\/1/,
            );
        });
    });

    it("accepts a priming report that carries nothing, which an event subscription may well send", async () => {
        const fixture = new Fixture("chip-local", (f, _index, value) => {
            f.pushReport(SUBSCRIPTION_ID);
            f.report(value);
        });
        fixture.primingCarriesData = false;

        await withFixture(fixture, async f => {
            await f.run([true], IMPATIENT);

            expect(f.failures).deep.equal([]);
        });
    });

    it("does not let a keepalive stand in for the report a write asked for", async () => {
        const fixture = new Fixture("chip-local", (f, _index, value) => {
            // What an idle subscription sends at its maximum interval: acked like a report, and on the
            // same subscription, but carrying nothing the write could have caused.
            f.pushKeepalive(SUBSCRIPTION_ID);
            f.report(value);
        });

        await withFixture(fixture, async f => {
            await expect(f.run([true], IMPATIENT)).rejectedWith(
                CertCheckFailedError,
                /ack check failed for step 3, write 1\/1/,
            );
        });
    });

    it("accepts the report that follows a keepalive on the same subscription", async () => {
        const fixture = new Fixture("chip-local", (f, _index, value) => {
            f.pushKeepalive(SUBSCRIPTION_ID);
            f.pushReport(SUBSCRIPTION_ID);
            f.report(value);
        });

        await withFixture(fixture, async f => {
            await f.run([true], IMPATIENT);

            expect(f.failures).deep.equal([]);
        });
    });

    it("records, rather than fails, callbacks that do not carry the written values in order", async () => {
        const fixture = new Fixture("chip-local", (f, _index) => {
            f.pushReport(SUBSCRIPTION_ID);
            f.report(true);
        });

        await withFixture(fixture, async f => {
            await f.run(VALUES, IMPATIENT);

            expect(f.failures).deep.equal([]);
            const unverified = f.checks.filter(check => check.verdict === "unverified");
            expect(unverified).to.have.lengthOf(1);
            expect(unverified[0].detail).match(/matched 1\/3/);
        });
    });

    it("accepts the shortfall under chip-tool, whose server drops all but the first result of a batch", async () => {
        const originalController = env.MATTER_CERT_CONTROLLER;
        env.MATTER_CERT_CONTROLLER = "chip-tool";
        try {
            const fixture = new Fixture("chip-local", (f, _index) => {
                f.pushReport(SUBSCRIPTION_ID);
                f.report(true);
            });

            await withFixture(fixture, async f => {
                await f.run(VALUES, IMPATIENT);

                const unverified = f.checks.filter(check => check.verdict === "unverified");
                expect(unverified).to.have.lengthOf(1);
                expect(unverified[0].accepted).match(/only the first result of a batch/);
            });
        } finally {
            if (originalController === undefined) {
                delete env.MATTER_CERT_CONTROLLER;
            } else {
                env.MATTER_CERT_CONTROLLER = originalController;
            }
        }
    });

    it("leaves the shortfall a gap to close on any other controller", async () => {
        const originalController = env.MATTER_CERT_CONTROLLER;
        env.MATTER_CERT_CONTROLLER = "matterjs";
        try {
            const fixture = new Fixture("chip-local", (f, _index) => {
                f.pushReport(SUBSCRIPTION_ID);
                f.report(true);
            });

            await withFixture(fixture, async f => {
                await f.run(VALUES, IMPATIENT);

                const unverified = f.checks.filter(check => check.verdict === "unverified");
                expect(unverified).to.have.lengthOf(1);
                expect(unverified[0].accepted).equal(undefined);
            });
        } finally {
            if (originalController === undefined) {
                delete env.MATTER_CERT_CONTROLLER;
            } else {
                env.MATTER_CERT_CONTROLLER = originalController;
            }
        }
    });

    it("records the mismatch when a report carries a value nobody wrote", async () => {
        const fixture = new Fixture("chip-local", (f, index, value) => {
            f.pushReport(SUBSCRIPTION_ID);
            f.report(index === 1 ? 42 : value);
        });

        await withFixture(fixture, async f => {
            await expect(f.run(VALUES, IMPATIENT)).rejectedWith(
                CertCheckFailedError,
                /none of the values this step wrote/,
            );

            const failure = f.failures[f.failures.length - 1];
            expect(failure.type).equal("response");
            expect(failure.detail).match(/report 2 carried 42/);
            expect(failure.detail).match(/\[true,false,true\]/);
        });
    });

    it("fails by timeout when only another subscription's reports arrive", async () => {
        const fixture = new Fixture("chip-local", (f, _index, value) => {
            f.pushReport(ACKED_SIBLING_ID);
            f.report(value);
        });

        await withFixture(fixture, async f => {
            await expect(f.run(VALUES, IMPATIENT)).rejectedWith(
                CertCheckFailedError,
                /StatusResponse ack check failed/,
            );

            const failure = f.failures[f.failures.length - 1];
            expect(failure.type).equal("device-log");
            expect(failure.pattern).match(/SubscriptionId = 0x2a/);
        });
    });

    it("passes on the TH's own report and ack when the controller's callbacks lag behind", async () => {
        // chip-tool's interactive server hands over only the first result of a batch, so a report the
        // TH coalesced with another attribute reaches no callback — the log is what proves the write
        const fixture = new Fixture("chip-local", f => f.pushReport(SUBSCRIPTION_ID));

        await withFixture(fixture, async f => {
            await f.run(VALUES, IMPATIENT);

            expect(f.failures).deep.equal([]);
            const unverified = f.checks.filter(check => check.verdict === "unverified");
            expect(unverified).to.have.lengthOf(1);
            expect(unverified[0].detail).match(/matched 0\/3/);
            expect(unverified[0].detail).match(/confirmed by the TH's own report and its Success ack/);
        });
    });

    it("fails when the TH's log carries no report for this write, whatever the callbacks say", async () => {
        const fixture = new Fixture("chip-local", (f, _index, value) => {
            f.report(value);
        });

        await withFixture(fixture, async f => {
            await expect(f.run(VALUES, IMPATIENT)).rejectedWith(
                CertCheckFailedError,
                /StatusResponse ack check failed/,
            );
        });
    });
});
