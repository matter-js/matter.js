/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, InternalError, Millis, Seconds } from "@matter/general";
import type {
    CertNodeApi,
    CertStepContext,
    CheckRecord,
    ControllerAdapter,
    WebRtcRequestorApi,
    WebRtcSessionRecord,
    WebRtcSignalRecord,
} from "@matter/testing";
import { CertLogClosedError, LineQueue, LogFollower } from "@matter/testing";
import { expect } from "chai";
import { CertCheckFailedError } from "../cert/tc-support.js";
import {
    CameraSession,
    expectConstraintRefusal,
    expectControlAccepted,
    expectNoneAccepted,
    expectRefusal,
    expectSessionHeld,
} from "../cert/tc-webrtcr-support.js";
import { fakeCertNode } from "./fake-cert-node.js";

const REF = "1";

function signal(
    kind: WebRtcSignalRecord["kind"],
    sessionId: number,
    outcome: WebRtcSignalRecord["outcome"],
): WebRtcSignalRecord {
    return { kind, sessionId, outcome, at: 0 };
}

/**
 * A requestor whose answers these tests dictate. Every method a helper does not use rejects, so a
 * helper that starts using one fails here rather than passing on a silent default.
 */
function fakeRequestor(overrides: Partial<WebRtcRequestorApi> = {}): WebRtcRequestorApi {
    const unused = () => Promise.reject(new InternalError("not used by these tests"));
    return {
        endpoint: 1,
        upsertSession: unused,
        removeSession: unused,
        sessions: unused,
        signals: () => [],
        nextSignal: unused,
        ...overrides,
    };
}

function fakeSession(
    requestor: WebRtcRequestorApi,
    node: CertNodeApi = fakeCertNode(),
    remaining: Duration = Seconds(30),
): CameraSession {
    return { node, requestor, ref: REF, videoStreamId: 3, remaining: () => remaining };
}

/** Captures what a helper records, with no controller log. */
function fakeContext(dutLog?: LogFollower): { cx: CertStepContext; checks: CheckRecord[] } {
    const checks = new Array<CheckRecord>();
    const dut = { id: "dut", log: dutLog } as unknown as ControllerAdapter;

    return {
        cx: {
            controllers: { dut },
            devices: {},
            recorder: {
                beginStep() {},
                check(record) {
                    checks.push(record);
                },
                endStep() {
                    return [];
                },
                async flush() {
                    return "";
                },
            },
        },
        checks,
    };
}

describe("expectRefusal", () => {
    it("fails, and names no id, where no refusal arrives", async () => {
        const { cx, checks } = fakeContext();
        const session = fakeSession(fakeRequestor({ nextSignal: async () => undefined }));

        const outcome = await expectRefusal(cx, session, "offer", 7);

        expect(outcome).deep.equal({ passed: false });
        expect(checks.map(check => check.verdict)).deep.equal(["fail"]);
        expect(checks[0].detail).match(/refused no Offer/);
    });

    it("passes where the refusal names an id the DUT does not hold", async () => {
        const { cx, checks } = fakeContext();
        const session = fakeSession(fakeRequestor({ nextSignal: async () => signal("offer", 8, "refused") }));

        const outcome = await expectRefusal(cx, session, "offer", 7);

        expect(outcome).deep.equal({ passed: true, refusedId: 8 });
        expect(checks.map(check => check.verdict)).deep.equal(["pass"]);
    });

    it("fails where the refusal names the session the case established", async () => {
        const { cx, checks } = fakeContext();
        const session = fakeSession(fakeRequestor({ nextSignal: async () => signal("offer", 7, "refused") }));

        const outcome = await expectRefusal(cx, session, "offer", 7);

        expect(outcome.passed).equal(false);
        expect(checks.map(check => check.verdict)).deep.equal(["fail"]);
        expect(checks[0].detail).match(/the very session it registered/);
    });
});

describe("the step's shared budget", () => {
    it("caps a wait at what is left of it rather than at the per-wait cap", async () => {
        const { cx } = fakeContext();
        const waits = new Array<number>();
        const session = fakeSession(
            fakeRequestor({
                nextSignal: async (_predicate, timeoutMs) => {
                    waits.push(timeoutMs);
                    return undefined;
                },
            }),
            fakeCertNode(),
            Millis(750),
        );

        await expectRefusal(cx, session, "offer", 7);

        expect(waits).deep.equal([750]);
    });
});

describe("expectSessionHeld", () => {
    it("passes where the session is tracked, and fails naming what is", async () => {
        const held: WebRtcSessionRecord[] = [{ id: 7, videoStreamId: 3, audioStreamId: null }];
        const { cx: kept, checks: keptChecks } = fakeContext();
        const { cx: lost, checks: lostChecks } = fakeContext();

        expect(await expectSessionHeld(kept, fakeSession(fakeRequestor({ sessions: async () => held })), 7)).equal(
            true,
        );
        expect(await expectSessionHeld(lost, fakeSession(fakeRequestor({ sessions: async () => [] })), 7)).equal(false);

        expect(keptChecks[0].verdict).equal("pass");
        expect(lostChecks[0].verdict).equal("fail");
        expect(lostChecks[0].detail).match(/tracks sessions \(none\)/);
    });
});

describe("expectNoneAccepted", () => {
    it("ignores an accepted signal for a session other than the refused one", () => {
        const { cx, checks } = fakeContext();
        const session = fakeSession(fakeRequestor({ signals: () => [signal("iceCandidates", 7, "accepted")] }));

        expect(expectNoneAccepted(cx, session, "iceCandidates", 8)).equal(true);
        expect(checks[0].verdict).equal("pass");
    });

    it("fails where the id the DUT refused was also accepted", () => {
        const { cx, checks } = fakeContext();
        const session = fakeSession(fakeRequestor({ signals: () => [signal("iceCandidates", 8, "accepted")] }));

        expect(expectNoneAccepted(cx, session, "iceCandidates", 8)).equal(false);
        expect(checks[0].verdict).equal("fail");
    });
});

describe("expectControlAccepted", () => {
    it("passes where the provider's signaling for the registered session is accepted", async () => {
        const { cx, checks } = fakeContext();
        const registered = new Array<number>();
        const session = fakeSession(
            fakeRequestor({
                upsertSession: async ({ id }) => {
                    registered.push(id);
                },
                nextSignal: async () => signal("offer", 8, "accepted"),
            }),
        );

        expect(await expectControlAccepted(cx, session, "offer", 7, async () => 8)).equal(true);
        expect(registered).deep.equal([8]);
        expect(checks[0].verdict).equal("pass");
    });

    it("fails where nothing is accepted for it", async () => {
        const { cx, checks } = fakeContext();
        const session = fakeSession(
            fakeRequestor({ upsertSession: async () => {}, nextSignal: async () => undefined }),
        );

        expect(await expectControlAccepted(cx, session, "offer", 7, async () => 8)).equal(false);
        expect(checks[0].verdict).equal("fail");
    });

    it("throws rather than blaming the DUT where the provider minted another id", async () => {
        const { cx, checks } = fakeContext();
        const removed = new Array<number>();
        const session = fakeSession(
            fakeRequestor({
                upsertSession: async () => {},
                removeSession: async id => {
                    removed.push(id);
                },
            }),
        );

        await expect(expectControlAccepted(cx, session, "offer", 7, async () => 11)).rejectedWith(
            CertCheckFailedError,
            /minted session 11 where 8 was registered/,
        );
        expect(removed).deep.equal([8]);
        expect(checks).deep.equal([]);
    });
});

describe("expectConstraintRefusal", () => {
    async function withLog<T>(lines: string[], body: (cx: CertStepContext, checks: CheckRecord[]) => Promise<T>) {
        const source = new LineQueue();
        const log = new LogFollower(source.follow(), "dut");
        for (const text of lines) {
            source.push(text);
        }
        // The log ends where these lines do, so a pattern that cannot match fails at once rather than
        // waiting out the helper's budget
        source.close();

        const { cx, checks } = fakeContext(log);
        try {
            return await body(cx, checks);
        } finally {
            await log.close();
        }
    }

    it("passes on the DUT's own refusal of the command", async () => {
        await withLog(
            [
                "Invoke error 1.webRtcTransportRequestor.iceCandidates: Status=ConstraintError(135), ClusterStatus=undefined",
            ],
            async (cx, checks) => {
                expect(await expectConstraintRefusal(cx, fakeSession(fakeRequestor()), 0)).equal(true);
                expect(checks[0].verdict).equal("pass");
            },
        );
    });

    it("fails where the DUT refused nothing within the budget", async () => {
        const source = new LineQueue();
        const log = new LogFollower(source.follow(), "dut");
        source.push("Invoke « 1.webRtcTransportRequestor.iceCandidates");

        const { cx, checks } = fakeContext(log);
        try {
            expect(await expectConstraintRefusal(cx, fakeSession(fakeRequestor()), 0, Millis(50))).equal(false);
            expect(checks[0].verdict).equal("fail");
        } finally {
            await log.close();
        }
    });

    it("ignores a refusal of another command on the same node", async () => {
        const source = new LineQueue();
        const log = new LogFollower(source.follow(), "dut");
        source.push(
            "Invoke error 1.webRtcTransportRequestor.offer: Status=ConstraintError(135), ClusterStatus=undefined",
        );

        const { cx, checks } = fakeContext(log);
        try {
            expect(await expectConstraintRefusal(cx, fakeSession(fakeRequestor()), 0, Millis(50))).equal(false);
            expect(checks[0].verdict).equal("fail");
        } finally {
            await log.close();
        }
    });

    it("throws rather than blaming the DUT where the log ends before anything matched", async () => {
        await withLog([], async (cx, checks) => {
            await expect(expectConstraintRefusal(cx, fakeSession(fakeRequestor()), 0)).rejectedWith(CertLogClosedError);
            expect(checks).deep.equal([]);
        });
    });
});
