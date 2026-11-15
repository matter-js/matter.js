/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Invoke } from "#action/request/Invoke.js";
import { MalformedRequestError } from "#action/request/MalformedRequestError.js";
import { Bytes, Diagnostic, LogFormat, Millis } from "@matter/general";
import { Matter, SecretRedaction } from "@matter/model";
import { ClusterId, CommandId, EndpointNumber, TlvOfModel, TlvVoid } from "@matter/types";
import { Identify } from "@matter/types/clusters/identify";
import { NetworkCommissioning } from "@matter/types/clusters/network-commissioning";
import { OnOff } from "@matter/types/clusters/on-off";
import { ThreadNetworkDirectory } from "@matter/types/clusters/thread-network-directory";

const DATASET = Bytes.fromHex("0e080000000000010000000300000f35060004001fffe0");
const DATASET_HEX = Bytes.toHex(DATASET);

function logged(value: unknown) {
    return LogFormat.formats.plain(Diagnostic.message({ values: [value] }));
}

function threadDatasetLegacyRequest(): Invoke.LegacyCommandRequest {
    const model = Matter.clusters.require("NetworkCommissioning").commands.require("AddOrUpdateThreadNetwork");
    return {
        endpoint: EndpointNumber(0),
        cluster: { id: ClusterId(NetworkCommissioning.id), name: "NetworkCommissioning" },
        command: {
            requestId: CommandId(model.id),
            requestSchema: TlvOfModel(model) ?? TlvVoid,
            responseSchema: TlvVoid,
            timed: false,
        },
        fields: { operationalDataset: DATASET, breadcrumb: 7 },
    };
}

describe("Invoke", () => {
    describe("basic command invocation", () => {
        it("creates invoke request for single command", () => {
            const request = Invoke({
                commands: [
                    Invoke.ConcreteCommandRequest({
                        endpoint: EndpointNumber(1),
                        cluster: OnOff,
                        command: "toggle",
                    }),
                ],
            });

            expect(request.invokeRequests).length(1);
            expect(request.invokeRequests[0].commandPath.endpointId).equal(1);
            expect(request.invokeRequests[0].commandPath.clusterId).equal(OnOff.id);
            expect(request.invokeRequests[0].commandPath.commandId).equal(OnOff.commands.toggle.id);
        });

        it("encodes command arguments into command fields", () => {
            function identifyFor(identifyTime: number) {
                return Invoke({
                    commands: [
                        Invoke.ConcreteCommandRequest({
                            endpoint: EndpointNumber(1),
                            cluster: Identify,
                            command: "identify",
                            fields: { identifyTime },
                        }),
                    ],
                });
            }

            const request = identifyFor(10);

            expect(request.invokeRequests).length(1);
            expect(request.invokeRequests[0].commandPath.clusterId).equal(Identify.id);

            const fields = request.invokeRequests[0].commandFields;
            expect(fields).not.undefined;
            expect(fields).not.deep.equal(identifyFor(20).invokeRequests[0].commandFields);
        });

        it("accepts a bare command request without an options wrapper", () => {
            const request = Invoke(
                Invoke.ConcreteCommandRequest({
                    endpoint: EndpointNumber(1),
                    cluster: OnOff,
                    command: "toggle",
                }),
            );

            expect(request.invokeRequests).length(1);
        });
    });

    describe("multiple commands", () => {
        it("creates request for multiple commands with refs", () => {
            const request = Invoke({
                commands: [
                    Invoke.ConcreteCommandRequest({
                        endpoint: EndpointNumber(1),
                        cluster: OnOff,
                        command: "toggle",
                        commandRef: 1,
                    }),
                    Invoke.ConcreteCommandRequest({
                        endpoint: EndpointNumber(2),
                        cluster: OnOff,
                        command: "on",
                        commandRef: 2,
                    }),
                ],
            });

            expect(request.invokeRequests).length(2);
            expect(request.invokeRequests[0].commandRef).equal(1);
            expect(request.invokeRequests[1].commandRef).equal(2);
        });

        it("throws when commandRef missing for multiple commands", () => {
            expect(() =>
                Invoke({
                    commands: [
                        Invoke.ConcreteCommandRequest({
                            endpoint: EndpointNumber(1),
                            cluster: OnOff,
                            command: "toggle",
                        }),
                        Invoke.ConcreteCommandRequest({ endpoint: EndpointNumber(2), cluster: OnOff, command: "on" }),
                    ],
                }),
            ).throws(MalformedRequestError, "CommandRef required");
        });

        it("throws on duplicate commandRef", () => {
            expect(() =>
                Invoke({
                    commands: [
                        Invoke.ConcreteCommandRequest({
                            endpoint: EndpointNumber(1),
                            cluster: OnOff,
                            command: "toggle",
                            commandRef: 1,
                        }),
                        Invoke.ConcreteCommandRequest({
                            endpoint: EndpointNumber(2),
                            cluster: OnOff,
                            command: "on",
                            commandRef: 1,
                        }),
                    ],
                }),
            ).throws(MalformedRequestError, "Duplicate commandRef");
        });
    });

    describe("options", () => {
        function single(options: Partial<Invoke.Definition> = {}) {
            return Invoke({
                commands: [
                    Invoke.ConcreteCommandRequest({ endpoint: EndpointNumber(1), cluster: OnOff, command: "toggle" }),
                ],
                ...options,
            });
        }

        it("does not suppress response by default", () => {
            expect(single().suppressResponse).equal(false);
        });

        it("suppresses response when requested", () => {
            expect(single({ suppressResponse: true }).suppressResponse).equal(true);
        });

        it("marks request as timed when timeout provided", () => {
            const request = single({ timeout: Millis(1000) });

            expect(request.timedRequest).equal(true);
            expect(request.timeout).equal(Millis(1000));
        });

        it("marks request as timed when timed flag set", () => {
            expect(single({ timed: true }).timedRequest).equal(true);
        });

        it("uses default interaction model revision", () => {
            expect(single().interactionModelRevision).not.undefined;
        });

        it("uses custom interaction model revision", () => {
            expect(single({ interactionModelRevision: 42 }).interactionModelRevision).equal(42);
        });

        it("retains expected processing time", () => {
            expect(single({ expectedProcessingTime: Millis(5000) }).expectedProcessingTime).equal(Millis(5000));
        });
    });

    describe("validation", () => {
        it("throws when no commands provided", () => {
            expect(() => Invoke({ commands: [] })).throws(MalformedRequestError, "at least one command");
        });

        it("throws when called with no arguments", () => {
            expect(() => (Invoke as () => unknown)()).throws(MalformedRequestError, "at least one command");
        });
    });

    describe("log output", () => {
        it("replaces secret command fields", () => {
            const request = Invoke(
                Invoke.ConcreteCommandRequest({
                    endpoint: EndpointNumber(0),
                    cluster: NetworkCommissioning,
                    command: "addOrUpdateThreadNetwork",
                    fields: { operationalDataset: DATASET, breadcrumb: 7 },
                }),
            );

            const text = logged(request);
            expect(text).not.contains(DATASET_HEX);
            expect(text).contains(SecretRedaction.PLACEHOLDER);
            expect(text).contains("breadcrumb");
        });

        it("replaces secret command fields of a legacy request through the standard model", () => {
            const text = logged(Invoke({ commands: [threadDatasetLegacyRequest()] }));

            expect(text).not.contains(DATASET_HEX);
            expect(text).contains(SecretRedaction.PLACEHOLDER);
        });

        it("keeps fields of a legacy request of a cluster the standard model does not define", () => {
            const request = threadDatasetLegacyRequest();
            request.cluster = { id: ClusterId(0xfff1fc00), name: "Custom" };

            expect(Invoke.redactRequestFields(request, request.fields)).deep.equals(request.fields);
        });

        it("replaces secret response fields", () => {
            const request = Invoke.ConcreteCommandRequest({
                endpoint: EndpointNumber(1),
                cluster: ThreadNetworkDirectory,
                command: "getOperationalDataset",
                fields: { extendedPanId: Bytes.fromHex("0000000000000001") },
            });

            expect(Invoke.redactResponseFields(request, { operationalDataset: DATASET })).deep.equals({
                operationalDataset: SecretRedaction.PLACEHOLDER,
            });
        });
    });
});
