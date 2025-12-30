/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InvokeResult } from "#action/response/InvokeResult.js";
import { ClusterId, CommandId, EndpointNumber, StatusCode, TlvUInt8, TlvString } from "#types";

describe("InvokeResult", () => {
    describe("CommandStatus", () => {
        it("creates command status with success", () => {
            const status: InvokeResult.CommandStatus = {
                kind: "cmd-status",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    commandId: CommandId(1),
                },
                status: StatusCode.Success,
            };

            expect(status.kind).equal("cmd-status");
            expect(status.path.endpointId).equal(1);
            expect(status.path.clusterId).equal(6);
            expect(status.path.commandId).equal(1);
            expect(status.status).equal(StatusCode.Success);
        });

        it("creates command status with error", () => {
            const status: InvokeResult.CommandStatus = {
                kind: "cmd-status",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    commandId: CommandId(1),
                },
                status: StatusCode.UnsupportedCommand,
            };

            expect(status.status).equal(StatusCode.UnsupportedCommand);
        });

        it("includes commandRef when present", () => {
            const status: InvokeResult.CommandStatus = {
                kind: "cmd-status",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    commandId: CommandId(1),
                },
                commandRef: 42,
                status: StatusCode.Success,
            };

            expect(status.commandRef).equal(42);
        });

        it("includes cluster status when present", () => {
            const status: InvokeResult.CommandStatus = {
                kind: "cmd-status",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    commandId: CommandId(1),
                },
                status: StatusCode.Failure,
                clusterStatus: 0x01,
            };

            expect(status.clusterStatus).equal(0x01);
        });
    });

    describe("CommandResponse", () => {
        it("creates command response with TLV data", () => {
            const tlvData = TlvUInt8.encodeTlv(42);
            const response: InvokeResult.CommandResponse = {
                kind: "cmd-response",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    commandId: CommandId(1),
                },
                data: tlvData,
            };

            expect(response.kind).equal("cmd-response");
            expect(response.path.endpointId).equal(1);
            expect(response.data).deep.equal(tlvData);
        });

        it("includes commandRef in response", () => {
            const tlvData = TlvString.encodeTlv("test");
            const response: InvokeResult.CommandResponse = {
                kind: "cmd-response",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(3),
                    commandId: CommandId(0),
                },
                commandRef: 10,
                data: tlvData,
            };

            expect(response.commandRef).equal(10);
        });

        it("handles empty command responses", () => {
            const response: InvokeResult.CommandResponse = {
                kind: "cmd-response",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    commandId: CommandId(0),
                },
                data: [],
            };

            expect(response.data).length(0);
        });
    });

    describe("DecodedCommandResponse", () => {
        it("creates decoded command response with typed data", () => {
            const decodedResponse: InvokeResult.DecodedCommandResponse = {
                kind: "cmd-response",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    commandId: CommandId(1),
                },
                data: { value: 42, name: "test" },
            };

            expect(decodedResponse.data.value).equal(42);
            expect(decodedResponse.data.name).equal("test");
        });

        it("preserves commandRef in decoded response", () => {
            const decodedResponse: InvokeResult.DecodedCommandResponse = {
                kind: "cmd-response",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    commandId: CommandId(1),
                },
                commandRef: 5,
                data: { result: "success" },
            };

            expect(decodedResponse.commandRef).equal(5);
            expect(decodedResponse.data.result).equal("success");
        });
    });

    describe("Data union types", () => {
        it("supports CommandStatus in Data union", () => {
            const data: InvokeResult.Data = {
                kind: "cmd-status",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    commandId: CommandId(1),
                },
                status: StatusCode.Success,
            };

            expect(data.kind).equal("cmd-status");
        });

        it("supports CommandResponse in Data union", () => {
            const data: InvokeResult.Data = {
                kind: "cmd-response",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    commandId: CommandId(1),
                },
                data: [],
            };

            expect(data.kind).equal("cmd-response");
        });

        it("supports DecodedCommandResponse in DecodedData union", () => {
            const data: InvokeResult.DecodedData = {
                kind: "cmd-response",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    commandId: CommandId(1),
                },
                data: { decoded: true },
            };

            expect(data.kind).equal("cmd-response");
        });
    });

    describe("path validation", () => {
        it("validates concrete command path includes all required fields", () => {
            const path: InvokeResult.ConcreteCommandPath = {
                endpointId: EndpointNumber(1),
                clusterId: ClusterId(6),
                commandId: CommandId(1),
            };

            expect(path.endpointId).not.undefined;
            expect(path.clusterId).not.undefined;
            expect(path.commandId).not.undefined;
        });
    });
});
