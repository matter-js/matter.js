/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LineQueue, LogFollower } from "@matter/testing";
import { expect } from "chai";
import { ChipFault } from "../cert/fault-injection.js";
import type { BatchPath } from "../cert/tc-idm-1.3-support.js";
import {
    expectBatchRequestPaths,
    expectInjectedFault,
    expectInvokeCount,
    expectNoInjectedFault,
    injectedFaultSequence,
} from "../cert/tc-idm-1.3-support.js";

const ON_OFF = 0x6;
const ON = 0x1;
const OFF = 0x0;

const PATHS: BatchPath[] = [
    { endpoint: 1, cluster: ON_OFF, command: ON },
    { endpoint: 1, cluster: ON_OFF, command: OFF },
];

/**
 * The lines `GetFaultInjectionTypeStr` prints, verbatim from `CommandHandlerImpl.cpp` — chip logs the
 * description straight after the colon, with no space.
 */
const FAULT_DESCRIPTION_LINES = new Map<number, string>([
    [
        ChipFault.imInvokeSeparateResponses,
        "[DMG]    Injecting the following response:Each response will be sent in a separate InvokeResponseMessage. " +
            "The order of responses will be the same as the original request.",
    ],
    [
        ChipFault.imInvokeSeparateResponsesInvertResponseOrder,
        "[DMG]    Injecting the following response:Each response will be sent in a separate InvokeResponseMessage. " +
            "The order of responses will be reversed from the original request.",
    ],
    [
        ChipFault.imInvokeSkipSecondResponse,
        "[DMG]    Injecting the following response:Single InvokeResponseMessages. Dropping response to second request",
    ],
]);

function faultLines(fault: number) {
    return [
        "[DMG] Response to InvokeRequestMessage overridden by fault injection",
        FAULT_DESCRIPTION_LINES.get(fault)!,
    ];
}

function commandPathLines(path: BatchPath) {
    return [
        "[DMG] \t\t\tCommandDataIB =",
        "[DMG] \t\t\t{",
        "[DMG] \t\t\t\tCommandPathIB =",
        "[DMG] \t\t\t\t{",
        `[DMG] \t\t\t\t\tEndpointId = 0x${path.endpoint.toString(16)},`,
        `[DMG] \t\t\t\t\tClusterId = 0x${path.cluster.toString(16)},`,
        `[DMG] \t\t\t\t\tCommandId = 0x${path.command.toString(16)},`,
        "[DMG] \t\t\t\t},",
        "[DMG] \t\t\t\tCommandFields =",
        "[DMG] \t\t\t\t{",
        "[DMG] \t\t\t\t},",
        "[DMG] \t\t\t},",
    ];
}

function batchRequestLines(paths: BatchPath[]) {
    return [
        "[EM] >>> [E:1r S:2 M:3] (S) Msg RX from 1:000000000001B669 --- Type 0001:08 (IM:InvokeCommandRequest)",
        "[DMG] InvokeRequestMessage =",
        "[DMG] {",
        "[DMG] \tsuppressResponse = false, ",
        "[DMG] \ttimedRequest = false, ",
        "[DMG] \tInvokeRequests =",
        "[DMG] \t[",
        ...paths.flatMap(commandPathLines),
        "[DMG] \t],",
        "[DMG] \tInteractionModelRevision = 11",
        "[DMG] },",
    ];
}

async function withFollower<T>(lines: string[], body: (follower: LogFollower) => Promise<T>): Promise<T> {
    const source = new LineQueue();
    const follower = new LogFollower(source.follow(), "th");
    for (const text of lines) {
        source.push(text);
    }
    try {
        return await body(follower);
    } finally {
        source.close();
        await follower.close();
    }
}

/**
 * {@link withFollower} for a synchronous check reading `follower.lines` rather than awaiting
 * `expect()`: the follower's own pump is a microtask chain, which the event loop drains before any
 * macrotask callback, so one `setImmediate` tick buffers everything pushed so far.
 */
async function withBufferedFollower<T>(lines: string[], body: (follower: LogFollower) => Promise<T> | T): Promise<T> {
    return withFollower(lines, async follower => {
        await new Promise(resolve => setImmediate(resolve));
        return body(follower);
    });
}

describe("injectedFaultSequence", () => {
    it("matches chip's own description of each fault", () => {
        for (const [fault, line] of FAULT_DESCRIPTION_LINES) {
            const [, description] = injectedFaultSequence(fault);
            expect(description.test(line), `fault ${fault}`).equal(true);
        }
    });

    it("does not match the description of another fault", () => {
        const [, sameOrder] = injectedFaultSequence(ChipFault.imInvokeSeparateResponses);

        expect(
            sameOrder.test(FAULT_DESCRIPTION_LINES.get(ChipFault.imInvokeSeparateResponsesInvertResponseOrder)!),
        ).equal(false);
    });

    it("throws for a fault it carries no description for", () => {
        expect(() => injectedFaultSequence(99)).throws(/fault id 99/);
    });
});

describe("expectInjectedFault", () => {
    it("records the fault the TH announced", async () => {
        const check = await withFollower(faultLines(ChipFault.imInvokeSkipSecondResponse), follower =>
            expectInjectedFault(follower, "chip-local", ChipFault.imInvokeSkipSecondResponse, 0, 500),
        );

        expect(check.verdict).equal("pass");
        expect(check.matched).contains("Dropping response to second request");
    });

    it("fails when a different fault fired", async () => {
        const check = await withFollower(faultLines(ChipFault.imInvokeSeparateResponses), follower =>
            expectInjectedFault(follower, "chip-local", ChipFault.imInvokeSkipSecondResponse, 0, 200),
        );

        expect(check.verdict).equal("fail");
    });

    it("is unverified for a matterjs device", async () => {
        const check = await withFollower([], follower =>
            expectInjectedFault(follower, "matterjs", ChipFault.imInvokeSeparateResponses, 0, 200),
        );

        expect(check.verdict).equal("unverified");
    });
});

describe("expectNoInjectedFault", () => {
    it("passes when the TH answered the invoke itself", async () => {
        const check = await withBufferedFollower(batchRequestLines(PATHS), follower =>
            expectNoInjectedFault(follower, "chip-local", 0),
        );

        expect(check.verdict).equal("pass");
    });

    it("fails when a fault fired after the mark", async () => {
        const check = await withBufferedFollower(
            [...batchRequestLines(PATHS), ...faultLines(ChipFault.imInvokeSeparateResponses)],
            follower => expectNoInjectedFault(follower, "chip-local", 0),
        );

        expect(check.verdict).equal("fail");
        expect(check.detail).contains("1 injected fault announcements");
    });

    it("ignores a fault that fired before the mark", async () => {
        const before = faultLines(ChipFault.imInvokeSeparateResponses);
        const check = await withBufferedFollower([...before, ...batchRequestLines(PATHS)], follower =>
            expectNoInjectedFault(follower, "chip-local", before.length),
        );

        expect(check.verdict).equal("pass");
    });

    it("is unverified for a matterjs device", async () => {
        const check = await withBufferedFollower(faultLines(ChipFault.imInvokeSeparateResponses), follower =>
            expectNoInjectedFault(follower, "matterjs", 0),
        );

        expect(check.verdict).equal("unverified");
    });
});

describe("expectInvokeCount", () => {
    it("passes on the expected number of invoke requests", async () => {
        const check = await withBufferedFollower([...batchRequestLines(PATHS), ...batchRequestLines(PATHS)], follower =>
            expectInvokeCount(follower, "chip-local", 0, 2),
        );

        expect(check.verdict).equal("pass");
    });

    it("fails when an extra invoke reached the TH", async () => {
        const check = await withBufferedFollower([...batchRequestLines(PATHS), ...batchRequestLines(PATHS)], follower =>
            expectInvokeCount(follower, "chip-local", 0, 1),
        );

        expect(check.verdict).equal("fail");
        expect(check.detail).contains("2 invoke requests");
    });

    it("is unverified for a matterjs device", async () => {
        const check = await withBufferedFollower(batchRequestLines(PATHS), follower =>
            expectInvokeCount(follower, "matterjs", 0, 1),
        );

        expect(check.verdict).equal("unverified");
    });
});

describe("expectBatchRequestPaths", () => {
    it("records both command paths of the request", async () => {
        const check = await withFollower(batchRequestLines(PATHS), follower =>
            expectBatchRequestPaths(follower, "chip-local", PATHS, 0, 500),
        );

        expect(check.verdict).equal("pass");
        expect(check.pattern).contains(`"command":${OFF}`);
    });

    it("fails when the paths arrived in the other order", async () => {
        const check = await withFollower(batchRequestLines([PATHS[1], PATHS[0]]), follower =>
            expectBatchRequestPaths(follower, "chip-local", PATHS, 0, 200),
        );

        expect(check.verdict).equal("fail");
    });

    it("fails when a requested path is absent", async () => {
        const check = await withFollower(batchRequestLines([PATHS[0]]), follower =>
            expectBatchRequestPaths(follower, "chip-local", PATHS, 0, 200),
        );

        expect(check.verdict).equal("fail");
    });

    it("fails when the request carried a command beside the expected ones", async () => {
        const extra: BatchPath = { endpoint: 1, cluster: ON_OFF, command: 0x2 };
        const check = await withFollower([...batchRequestLines([PATHS[0], extra, PATHS[1]])], follower =>
            expectBatchRequestPaths(follower, "chip-local", PATHS, 0, 500),
        );

        expect(check.verdict).equal("fail");
        expect(check.detail).contains("carried 3 commands");
    });

    it("counts only the commands of its own request", async () => {
        // Buffered, so a later request's commands are actually in reach of the count being bounded.
        const check = await withBufferedFollower(
            [...batchRequestLines(PATHS), ...batchRequestLines([PATHS[0]])],
            follower => expectBatchRequestPaths(follower, "chip-local", PATHS, 0, 500),
        );

        expect(check.verdict).equal("pass");
    });

    it("is unverified for a matterjs device", async () => {
        const check = await withFollower(batchRequestLines(PATHS), follower =>
            expectBatchRequestPaths(follower, "matterjs", PATHS, 0, 200),
        );

        expect(check.verdict).equal("unverified");
    });
});
