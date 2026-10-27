/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { UnexpectedDataError } from "@matter/general";
import { Status } from "@matter/main/types";
import { expect } from "chai";
import { loggedWriteResponseStatuses } from "../../src/chip-tool/write-response-log.js";
import {
    CHIP_APP_MIXED_STATUSES,
    CHIP_APP_WILDCARD_REFUSED,
    CHIP_APP_WITHOUT_TRACE_DECODE,
    MATTERJS_WILDCARD_SUCCESS,
    MATTERJS_WILDCARD_WITH_CONCRETE_FAILURE,
} from "./chip-tool-write-response-captures.js";

const UNIT_TESTING = 0xfff1fc05;
const IDENTIFY = 0x3;
const LEVEL_CONTROL = 0x8;

/** A response to a write whose wildcard reached no endpoint the device may write. */
const EMPTY_RESPONSE = [
    "WriteResponseMessage =",
    "{",
    "\tAttributeStatusIBs =",
    "\t[",
    "\t],",
    "\t",
    "\tInteractionModelRevision = 12",
    "}",
];

/** The lines of the first `WriteResponseMessage` block of `logs`, closing brace included. */
function firstBlock(logs: string[]) {
    const start = logs.indexOf("WriteResponseMessage =");
    return logs.slice(start, logs.indexOf("}", start) + 1);
}

describe("loggedWriteResponseStatuses", () => {
    it("reads every path with its status and cluster status, past the decoded WriteRequest of --trace_decode", () => {
        expect(loggedWriteResponseStatuses(CHIP_APP_MIXED_STATUSES.logs)).deep.equal([
            { endpoint: 1, cluster: UNIT_TESTING, attribute: 0x00, status: Status.Success },
            { endpoint: 1, cluster: UNIT_TESTING, attribute: 0x31, status: Status.InvalidDataType },
            { endpoint: 1, cluster: UNIT_TESTING, attribute: 0x32, status: Status.Failure, clusterStatus: 0x11 },
            { endpoint: 1, cluster: IDENTIFY, attribute: 0xfe, status: Status.UnsupportedAttribute },
        ]);
    });

    it("reads the message chip-tool decodes without --trace_decode", () => {
        expect(loggedWriteResponseStatuses(CHIP_APP_WITHOUT_TRACE_DECODE.logs)).deep.equal([
            { endpoint: 1, cluster: UNIT_TESTING, attribute: 0x32, status: Status.Failure, clusterStatus: 0x11 },
            { endpoint: 1, cluster: IDENTIFY, attribute: 0x00, status: Status.Success },
        ]);
    });

    it("reads every endpoint a wildcard write reached, beside a concrete path the device rejected", () => {
        expect(loggedWriteResponseStatuses(MATTERJS_WILDCARD_SUCCESS.logs)).deep.equal(
            [1, 2, 3, 4].map(endpoint => ({ endpoint, cluster: IDENTIFY, attribute: 0, status: Status.Success })),
        );
        expect(loggedWriteResponseStatuses(MATTERJS_WILDCARD_WITH_CONCRETE_FAILURE.logs)).deep.equal([
            ...[1, 2, 3, 4].map(endpoint => ({ endpoint, cluster: IDENTIFY, attribute: 0, status: Status.Success })),
            { endpoint: 1, cluster: LEVEL_CONTROL, attribute: 0x11, status: Status.ConstraintError },
        ]);
    });

    it("joins the statuses of several messages, in order", () => {
        expect(
            loggedWriteResponseStatuses([
                ...CHIP_APP_WITHOUT_TRACE_DECODE.logs,
                ...MATTERJS_WILDCARD_SUCCESS.logs,
            ])?.map(({ endpoint, cluster, attribute }) => [endpoint, cluster, attribute]),
        ).deep.equal([
            [1, UNIT_TESTING, 0x32],
            [1, IDENTIFY, 0],
            [1, IDENTIFY, 0],
            [2, IDENTIFY, 0],
            [3, IDENTIFY, 0],
            [4, IDENTIFY, 0],
        ]);
    });

    it("answers undefined for a reply without a WriteResponseMessage, and an empty list for an empty status list", () => {
        expect(loggedWriteResponseStatuses(CHIP_APP_WILDCARD_REFUSED.logs)).undefined;
        expect(loggedWriteResponseStatuses(EMPTY_RESPONSE)).deep.equal([]);
    });

    it("rejects a message without its status list", () => {
        expect(() =>
            loggedWriteResponseStatuses(["WriteResponseMessage =", "{", "\tInteractionModelRevision = 12", "}"]),
        ).throws(UnexpectedDataError, /carries 0 AttributeStatusIBs/);
    });

    it("reads a status printed without its name", () => {
        const block = firstBlock(MATTERJS_WILDCARD_SUCCESS.logs).map(line =>
            line.replace("status = 0x00 (SUCCESS),", "status = 0x87,"),
        );
        expect(loggedWriteResponseStatuses(block)?.map(({ status }) => status)).deep.equal([
            Status.ConstraintError,
            Status.ConstraintError,
            Status.ConstraintError,
            Status.ConstraintError,
        ]);
    });

    it("ignores path fields it does not report, such as the node", () => {
        const block = firstBlock(CHIP_APP_WITHOUT_TRACE_DECODE.logs).flatMap(line =>
            line === "\t\t\t\tEndpoint = 0x1," ? ["\t\t\t\tNode = 0x0000000000000001,", line] : [line],
        );
        expect(loggedWriteResponseStatuses(block)).deep.equal(
            loggedWriteResponseStatuses(CHIP_APP_WITHOUT_TRACE_DECODE.logs),
        );
    });

    describe("structure", () => {
        const HEADER = "\t\tAttributeStatusIB =";
        const CLOSING = "\t\t},";
        const LIST_CLOSING = "\t],";
        const block = firstBlock(MATTERJS_WILDCARD_SUCCESS.logs);

        /** `block` without the `occurrence`-th (from 0) line equal to `line`. */
        function without(line: string, occurrence: number, lines = block) {
            const indices = lines.flatMap((candidate, index) => (candidate === line ? [index] : []));
            expect(indices.length).greaterThan(occurrence);
            return lines.filter((_, index) => index !== indices[occurrence]);
        }

        it("rejects the fields of an entry whose header is missing, rather than letting them overwrite the previous one", () => {
            expect(() => loggedWriteResponseStatuses(without(HEADER, 1))).throws(UnexpectedDataError, /nameless entry/);
        });

        it("rejects an entry that does not close before the next one or before its list closes", () => {
            for (const occurrence of [0, 3]) {
                expect(() => loggedWriteResponseStatuses(without(CLOSING, occurrence)), String(occurrence)).throws(
                    UnexpectedDataError,
                    /"\]," closes a struct/,
                );
            }
        });

        it("rejects a message whose last entry and list terminator are missing", () => {
            const lastEntry = block.lastIndexOf(HEADER);
            const truncated = [
                ...block.slice(0, lastEntry),
                ...block.slice(block.indexOf(LIST_CLOSING) + 1).filter(line => line.trim() !== ""),
            ];
            expect(truncated.slice(-2)).deep.equal(["\tInteractionModelRevision = 12", "}"]);
            expect(() => loggedWriteResponseStatuses(truncated)).throws(UnexpectedDataError, /"\}" starts inside it/);
        });

        /** `block` with the `occurrence`-th (from 0) line equal to `line` replaced by `replacements`. */
        function replaced(line: string, occurrence: number, ...replacements: string[]) {
            const indices = block.flatMap((candidate, index) => (candidate === line ? [index] : []));
            expect(indices.length).greaterThan(occurrence);
            return block.flatMap((candidate, index) => (index === indices[occurrence] ? replacements : [candidate]));
        }

        it("accepts fields, unknown tags and indentation chip prints that carry no status", () => {
            const decorated = replaced(
                "\t\t\t\tEndpoint = 0x1,",
                0,
                "\t\t\t\tenableTagCompression = true, ",
                "\t\t\t\tEndpoint = 0x1,",
                "\t\t\t\tListIndex = Null,",
                "\t\t\tUnknown tag num 7",
            );
            const withUnknownTag = replaced(
                "\tInteractionModelRevision = 12",
                0,
                "Unknown tag num 9",
                "\tInteractionModelRevision = 12",
            );
            const expected = loggedWriteResponseStatuses(block);
            expect(loggedWriteResponseStatuses(decorated)).deep.equal(expected);
            expect(loggedWriteResponseStatuses(withUnknownTag)).deep.equal(expected);
        });

        it("rejects an unindented line inside the message, a trailing space notwithstanding", () => {
            expect(() =>
                loggedWriteResponseStatuses(
                    replaced("\t\tAttributeStatusIB =", 1, "Command: something ", "\t\tAttributeStatusIB ="),
                ),
            ).throws(UnexpectedDataError, /"Command: something" starts inside it/);
        });

        it("rejects a message header that no opening brace follows", () => {
            expect(() => loggedWriteResponseStatuses(["WriteResponseMessage =", ...block.slice(2)])).throws(
                UnexpectedDataError,
                /its header is not followed by "\{"/,
            );
        });

        it("rejects a status list with a field of its own, or with an entry or itself of the wrong kind", () => {
            expect(() => loggedWriteResponseStatuses(replaced("\t[", 0, "\t[", "\t\tCount = 0x4,"))).throws(
                UnexpectedDataError,
                /list carries a field of its own/,
            );
            const listEntry = block.map((line, index) =>
                index === block.indexOf("\t\t{") ? "\t\t[" : index === block.indexOf("\t\t},") ? "\t\t]," : line,
            );
            expect(() => loggedWriteResponseStatuses(listEntry)).throws(
                UnexpectedDataError,
                /AttributeStatusIB as a list/,
            );
            const structList = block.map(line => (line === "\t[" ? "\t{" : line === "\t]," ? "\t}," : line));
            expect(() => loggedWriteResponseStatuses(structList)).throws(
                UnexpectedDataError,
                /carries AttributeStatusIBs as a struct/,
            );
        });

        it("rejects a path value that is not a number", () => {
            expect(() =>
                loggedWriteResponseStatuses(replaced("\t\t\t\tEndpoint = 0x1,", 0, "\t\t\t\tEndpoint = one,")),
            ).throws(UnexpectedDataError, /Endpoint "one" is not a number/);
        });

        it("rejects a header that no bracket follows", () => {
            expect(() => loggedWriteResponseStatuses(without("\t\t\t{", 0))).throws(
                UnexpectedDataError,
                /the header "AttributePathIB =" is not followed by a bracket/,
            );
        });

        it("rejects a closing bracket of the other kind", () => {
            const swapped = block.map(line => (line === LIST_CLOSING ? "\t}," : line));
            expect(() => loggedWriteResponseStatuses(swapped)).throws(UnexpectedDataError, /"\}," closes a list/);
        });

        it("rejects more of the message after its closing brace", () => {
            for (const after of [LIST_CLOSING, "\tInteractionModelRevision = 12", "\t\tAttributeStatusIB ="]) {
                expect(() => loggedWriteResponseStatuses([...EMPTY_RESPONSE, after]), after).throws(
                    UnexpectedDataError,
                    /follows its closing brace/,
                );
            }
            expect(loggedWriteResponseStatuses([...EMPTY_RESPONSE, "WriteClient moving to [AwaitingDe]"])).deep.equal(
                [],
            );
        });

        it("rejects an entry that carries a field twice", () => {
            const doubled = block.flatMap(line =>
                line === "\t\t\t\tEndpoint = 0x1," ? [line, "\t\t\t\tEndpoint = 0x5,"] : [line],
            );
            expect(() => loggedWriteResponseStatuses(doubled)).throws(UnexpectedDataError, /carries Endpoint 2 times/);
        });

        it("rejects an entry with two status structs", () => {
            const status = block.indexOf("\t\t\tStatusIB =");
            const doubled = [...block.slice(0, status), ...block.slice(status, status + 5), ...block.slice(status)];
            expect(() => loggedWriteResponseStatuses(doubled)).throws(UnexpectedDataError, /carries 2 StatusIB/);
        });

        it("rejects a message the log ends inside", () => {
            expect(() => loggedWriteResponseStatuses(block.slice(0, -1))).throws(UnexpectedDataError, /ends inside/);
        });

        it("rejects a message another decoded block starts inside, rather than taking that block's statuses", () => {
            const report = [
                "ReportDataMessage =",
                "{",
                "\tAttributeReportIBs =",
                "\t[",
                ...block.slice(4, 19),
                "\t],",
                "}",
            ];
            expect(() => loggedWriteResponseStatuses([...block.slice(0, -1), ...report])).throws(
                UnexpectedDataError,
                /"ReportDataMessage =" starts inside it/,
            );
            // An earlier pretty print that failed part way leaves the depth raised, so the header can be indented
            expect(() =>
                loggedWriteResponseStatuses([...block.slice(0, -1), ...report.map(line => `\t\t${line}`)]),
            ).throws(UnexpectedDataError, /another message/);
        });

        it("rejects an entry without a status or without a concrete path", () => {
            for (const dropped of [
                "\t\t\t\tstatus = 0x00 (SUCCESS),",
                "\t\t\t\tEndpoint = 0x2,",
                "\t\t\t\tCluster = 0x3,",
                "\t\t\t\tAttribute = 0x0000_0000,",
            ]) {
                expect(() => loggedWriteResponseStatuses(without(dropped, 0)), dropped).throws(
                    UnexpectedDataError,
                    /carries no (status|Endpoint|Cluster|Attribute)/,
                );
            }
        });
    });
});
