/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger, NodeId, Observable } from "@matter/main";
import { Status, StatusResponseError } from "@matter/main/types";
import { NodeNotConnectedError } from "@project-chip/matter.js/device";
import { expect } from "chai";
import { createServer, type Server } from "node:net";
import { WebSocket } from "ws";
import { ChipToolWebSocketHandler } from "../../src/ChipToolWebSocketHandler.js";
import {
    AttributeResponseData,
    CommandHandler,
    DelayRequest,
    DiscoveryRequest,
    DiscoveryResponse,
    InitialPairingRequest,
    InvokeByIdRequest,
    InvokeRequest,
    IssueNocChainRequest,
    IssueNocChainResponse,
    ReadAttributeRequest,
    ReadAttributeResponse,
    ReadEventRequest,
    ReadEventResponse,
    RootCertificateResponse,
    SubscribeAttributeRequest,
    SubscribeAttributeResponse,
    SubscribeEventRequest,
    SubscribeEventResponse,
    WriteAttributeByIdRequest,
    WriteAttributeRequest,
} from "../../src/handler/CommandHandler.js";

/**
 * A {@link CommandHandler} that answers from canned data instead of driving a controller, so a test can
 * assert on the frames the shim puts on the wire. The reply shapes are the thing under test here: the
 * helpers that decide them have their own tests, and those pass even where nothing calls them.
 */
class FakeCommandHandler extends CommandHandler {
    #started = false;
    startCalls = 0;
    disconnectedNodes = new Array<NodeId>();
    writes = new Array<WriteAttributeRequest>();
    discoveries = new Array<DiscoveryRequest>();
    invokes = new Array<InvokeRequest>();
    paseConnections = new Array<NodeId>();

    /** Answer for the next discovery; empty means "found nothing". */
    discoveryResult: DiscoveryResponse = [];

    /** Thrown by whichever operation a test drives, where set. */
    failure?: unknown;

    /** Signals a test handed to the operation it drove, in order. */
    signals = new Array<AbortSignal | undefined>();

    /** Where true, a read waits for its own signal instead of answering. */
    readWaitsForAbort = false;

    /** Discoveries this handler was asked to cancel, by the identifier they named. */
    discoveryCancellations = new Array<DiscoveryRequest["findBy"]>();

    get started() {
        return this.#started;
    }

    /** Thrown by `start()`, where set. */
    startFailure?: unknown;

    async start() {
        this.startCalls++;
        if (this.startFailure !== undefined) {
            throw this.startFailure;
        }
        this.#started = true;
    }

    async disconnectNode(nodeId: NodeId) {
        this.disconnectedNodes.push(nodeId);
    }

    async handlePaseConnection(data: InitialPairingRequest) {
        this.paseConnections.push(data.nodeId);
        this.#throwIfFailing();
    }

    async handleInitialPairing(_data: InitialPairingRequest) {
        this.#throwIfFailing();
    }

    async handleDiscovery(data: DiscoveryRequest): Promise<DiscoveryResponse> {
        this.discoveries.push(data);
        this.signals.push(data.abort);
        this.#throwIfFailing();

        // As the real handler does: a signal that already aborted never fires, so it is read rather
        // than waited on.
        data.abort?.throwIfAborted();
        data.abort?.addEventListener("abort", () => this.discoveryCancellations.push(data.findBy), { once: true });

        if (this.discoveryWaitsForAbort) {
            await new Promise<void>((_resolve, reject) => {
                data.abort?.addEventListener("abort", () => reject(data.abort?.reason));
            });
        }

        return this.discoveryResult;
    }

    /** Where true, a discovery waits for its own signal instead of answering. */
    discoveryWaitsForAbort = false;

    async handleWriteAttribute(data: WriteAttributeRequest) {
        this.writes.push(data);
        this.signals.push(data.abort);
        this.#throwIfFailing();
    }

    async handleWriteAttributeById(_data: WriteAttributeByIdRequest) {
        this.#throwIfFailing();
    }

    async handleReadAttribute(data: ReadAttributeRequest): Promise<ReadAttributeResponse> {
        this.signals.push(data.abort);
        this.#throwIfFailing();

        if (this.readWaitsForAbort) {
            // What an operation that outlives its step's deadline does: it observes the signal rather
            // than answering, exactly as a real interaction abandoned mid-flight does.
            await new Promise<void>((_resolve, reject) => {
                data.abort?.addEventListener("abort", () => reject(data.abort?.reason));
            });
        }

        return { values: new Array<AttributeResponseData>() };
    }

    async handleSubscribeAttribute(_data: SubscribeAttributeRequest): Promise<SubscribeAttributeResponse> {
        this.#throwIfFailing();
        return { values: new Array<AttributeResponseData>(), updated: Observable<[void]>() };
    }

    async handleReadEvent(_data: ReadEventRequest): Promise<ReadEventResponse> {
        this.#throwIfFailing();
        return { values: [] };
    }

    async handleSubscribeEvent(_data: SubscribeEventRequest): Promise<SubscribeEventResponse> {
        this.#throwIfFailing();
        return { values: [], updated: Observable<[void]>() };
    }

    async handleInvoke(data: InvokeRequest) {
        this.invokes.push(data);
        this.signals.push(data.abort);
        this.#throwIfFailing();
        return undefined;
    }

    async handleInvokeById(_data: InvokeByIdRequest) {
        this.#throwIfFailing();
    }

    async handleDelay(_data: DelayRequest) {
        this.#throwIfFailing();
    }

    getCommissionerNodeId() {
        return NodeId(0x112233);
    }

    getCommissionerRootCertificate(): RootCertificateResponse {
        return { RCAC: new Uint8Array() };
    }

    async commissionerIssueNocChain(_data: IssueNocChainRequest): Promise<IssueNocChainResponse> {
        throw new Error("not used by these tests");
    }

    #throwIfFailing() {
        if (this.failure !== undefined) {
            throw this.failure;
        }
    }
}

interface ChipReply {
    results: { error?: string; clusterError?: number }[];
    logs: unknown[];
}

/** One command in, one reply out, over a real socket to a real server. */
async function send(port: number, frame: string): Promise<ChipReply> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    try {
        await new Promise<void>((resolve, reject) => {
            ws.once("open", resolve);
            ws.once("error", reject);
        });

        const reply = new Promise<string>((resolve, reject) => {
            ws.once("message", data => resolve(data.toString()));
            ws.once("error", reject);
        });
        ws.send(frame);

        return JSON.parse(await reply);
    } finally {
        ws.close();
    }
}

function jsonFrame(command: { cluster: string; command: string; command_specifier?: string; arguments: object }) {
    const { arguments: args, ...rest } = command;
    return `json:${JSON.stringify({
        ...rest,
        arguments: `base64:${Buffer.from(JSON.stringify(args), "utf8").toString("base64")}`,
    })}`;
}

describe("ChipToolWebSocketHandler over the wire", () => {
    let server: ChipToolWebSocketHandler;
    let handler: FakeCommandHandler;
    let port: number;
    let restoreLogWriter: () => void;

    beforeEach(async () => {
        // initialize() installs a log interceptor on the shared default destination and never removes
        // it, so every test here has to put the destination back for whatever runs next.
        const write = Logger.destinations.default.write;
        const format = Logger.format;
        restoreLogWriter = () => {
            Logger.destinations.default.write = write;
            Logger.format = format;
        };

        handler = new FakeCommandHandler();
        server = new ChipToolWebSocketHandler(0);
        server.initialize(new Map([["alpha", handler]]));
        await server.start();
        const bound = server.port;
        expect(bound).not.equal(undefined);
        port = bound!;
    });

    afterEach(() => {
        server.close();
        restoreLogWriter();
    });

    it("refuses to start on a port already taken, rather than reporting a server nobody can reach", async () => {
        const occupier: Server = createServer();
        await new Promise<void>((resolve, reject) => {
            occupier.once("listening", resolve);
            occupier.once("error", reject);
            occupier.listen(0, "127.0.0.1");
        });

        const address = occupier.address();
        expect(address !== null && typeof address !== "string").equal(true);
        const taken = address !== null && typeof address !== "string" ? address.port : 0;

        const blocked = new ChipToolWebSocketHandler(taken);
        blocked.initialize(new Map([["alpha", new FakeCommandHandler()]]));
        try {
            await expect(blocked.start()).rejected;
            expect(blocked.port).equal(undefined);
        } finally {
            blocked.close();
            await new Promise<void>(resolve => occupier.close(() => resolve()));
        }
    });

    it("answers a discovery that found nothing as a failure, not as a command that succeeded", async () => {
        handler.discoveryResult = [];

        const reply = await send(
            port,
            jsonFrame({
                cluster: "discover",
                command: "find-commissionable-by-long-discriminator",
                arguments: { value: "3840" },
            }),
        );

        expect(reply.results).deep.equal([{ error: "FAILURE" }]);
        expect(handler.discoveries.map(({ findBy }) => findBy)).deep.equal([{ longDiscriminator: 3840 }]);
    });

    it("answers a discovery that found a device with what it found", async () => {
        handler.discoveryResult = [
            {
                value: {
                    commissioningMode: 1,
                    deviceName: "TH",
                    deviceType: 257,
                    hostName: "0011223344556677",
                    instanceName: "1122334455667788",
                    longDiscriminator: 3840,
                    numIPs: 1,
                    pairingHint: 33,
                    pairingInstruction: "",
                    port: 5540,
                    productId: 32769,
                    rotatingId: "",
                    rotatingIdLen: 0,
                    shortDiscriminator: 15,
                    supportsTcpClient: false,
                    supportsTcpServer: false,
                    vendorId: 65521,
                },
            },
        ];

        const reply = await send(
            port,
            jsonFrame({
                cluster: "discover",
                command: "find-commissionable-by-long-discriminator",
                arguments: { value: "3840" },
            }),
        );

        expect(reply.results.length).equal(1);
        expect(reply.results[0].error).equal(undefined);
    });

    it("refuses a write whose payload it could not read, rather than reporting the device accepted it", async () => {
        const reply = await send(
            port,
            jsonFrame({
                cluster: "userlabel",
                command: "write",
                command_specifier: "label-list",
                arguments: {
                    "destination-id": "0x12344321",
                    "endpoint-id-ignored-for-group-commands": "0",
                    "attribute-values": "[{not json}]",
                },
            }),
        );

        expect(reply.results[0].error).match(/^Test harness failure — ImplementationError: Cannot read the payload/);
        expect(reply.results[1]).deep.equal({ error: "FAILURE" });

        // The write never reached the device, which is the point of refusing it.
        expect(handler.writes).deep.equal([]);
    });

    it("answers a device that refused with the status the device gave", async () => {
        handler.failure = new StatusResponseError("device says no", Status.UnsupportedWrite);

        const reply = await send(
            port,
            jsonFrame({
                cluster: "onoff",
                command: "write",
                command_specifier: "on-time",
                arguments: {
                    "destination-id": "0x12344321",
                    "endpoint-id-ignored-for-group-commands": "1",
                    "attribute-values": "5",
                },
            }),
        );

        expect(reply.results).deep.equal([{ error: "UNSUPPORTED_WRITE" }, { error: "FAILURE" }]);
    });

    it("answers a fault of its own as its own, not as the bare failure a device gives", async () => {
        handler.failure = new TypeError("cannot read properties of undefined");

        const reply = await send(
            port,
            jsonFrame({
                cluster: "onoff",
                command: "write",
                command_specifier: "on-time",
                arguments: {
                    "destination-id": "0x12344321",
                    "endpoint-id-ignored-for-group-commands": "1",
                    "attribute-values": "5",
                },
            }),
        );

        expect(reply.results[0].error).equal("Test harness failure — TypeError: cannot read properties of undefined");
        expect(reply.results[1]).deep.equal({ error: "FAILURE" });
    });

    it("answers a device that plainly failed with the bare failure the corpus expects", async () => {
        handler.failure = new Error("the device did not answer");

        const reply = await send(
            port,
            jsonFrame({
                cluster: "onoff",
                command: "write",
                command_specifier: "on-time",
                arguments: {
                    "destination-id": "0x12344321",
                    "endpoint-id-ignored-for-group-commands": "1",
                    "attribute-values": "5",
                },
            }),
        );

        expect(reply.results).deep.equal([{ error: "FAILURE" }]);
    });

    it("drops the session where the device could not be reached, so the failure stays failed", async () => {
        handler.failure = new NodeNotConnectedError("no session");

        const reply = await send(
            port,
            jsonFrame({
                cluster: "onoff",
                command: "write",
                command_specifier: "on-time",
                arguments: {
                    "destination-id": "0x12344321",
                    "endpoint-id-ignored-for-group-commands": "1",
                    "attribute-values": "5",
                },
            }),
        );

        expect(reply.results).deep.equal([{ error: "FAILURE" }]);
        expect(handler.disconnectedNodes).deep.equal([NodeId(0x12344321)]);
    });

    it("establishes a PASE session for a pairing command that asks for one only", async () => {
        const reply = await send(
            port,
            jsonFrame({
                cluster: "pairing",
                command: "code-paseonly",
                arguments: { "node-id": "0x12344321", payload: "MT:-24J042C00KA0648G00" },
            }),
        );

        expect(reply.results).deep.equal([]);
        expect(handler.paseConnections).deep.equal([NodeId(0x12344321)]);
    });

    it("starts the controller once, on the first command that addresses it", async () => {
        expect(handler.startCalls).equal(0);

        await send(
            port,
            jsonFrame({
                cluster: "discover",
                command: "find-commissionable-by-short-discriminator",
                arguments: { value: "15" },
            }),
        );
        await send(
            port,
            jsonFrame({
                cluster: "discover",
                command: "find-commissionable-by-short-discriminator",
                arguments: { value: "15" },
            }),
        );

        expect(handler.startCalls).equal(1);
    });

    it("names the cluster a step asked for that it has no model of", async () => {
        const reply = await send(
            port,
            jsonFrame({
                cluster: "notacluster",
                command: "read",
                command_specifier: "some-attribute",
                arguments: { "destination-id": "0x12344321", "endpoint-ids": "1" },
            }),
        );

        expect(reply.results[0].error).match(/^Test harness failure — ImplementationError: No model for cluster/);
        expect(reply.results[0].error).match(/notacluster/);
        expect(reply.results[1]).deep.equal({ error: "FAILURE" });
    });

    it("names the attribute a step asked for that its cluster does not have", async () => {
        const reply = await send(
            port,
            jsonFrame({
                cluster: "onoff",
                command: "read",
                command_specifier: "not-an-attribute",
                arguments: { "destination-id": "0x12344321", "endpoint-ids": "1" },
            }),
        );

        expect(reply.results[0].error).match(/has no attribute "not-an-attribute"/);
        expect(reply.results[1]).deep.equal({ error: "FAILURE" });
    });

    it("names the command a step asked for that its cluster does not have", async () => {
        const reply = await send(
            port,
            jsonFrame({
                cluster: "onoff",
                command: "not-a-command",
                arguments: {
                    "destination-id": "0x12344321",
                    "endpoint-id-ignored-for-group-commands": "1",
                },
            }),
        );

        expect(reply.results[0].error).match(/has no command "not-a-command"/);
        expect(reply.results[1]).deep.equal({ error: "FAILURE" });
    });

    it("names the event a step asked for that its cluster does not have", async () => {
        const reply = await send(
            port,
            jsonFrame({
                cluster: "onoff",
                command: "read-event",
                command_specifier: "not-an-event",
                arguments: { "destination-id": "0x12344321", "endpoint-ids": "1" },
            }),
        );

        expect(reply.results[0].error).match(/has no event "not-an-event"/);
        expect(reply.results[1]).deep.equal({ error: "FAILURE" });
    });

    it("gives up on an operation that outlives the timeout its step declared", async () => {
        handler.readWaitsForAbort = true;

        const reply = await send(
            port,
            jsonFrame({
                cluster: "onoff",
                command: "read",
                command_specifier: "on-off",
                arguments: { "destination-id": "0x12344321", "endpoint-ids": "1", timeout: "1" },
            }),
        );

        // The failure a device that did not answer gives, which is what the step expects — not a fault
        // of the harness.
        expect(reply.results).deep.equal([{ error: "FAILURE" }]);

        expect(handler.signals.length).equal(1);
        expect(handler.signals[0]?.aborted).equal(true);
    });

    it("hands the operation its step's deadline, and nothing where the step declared none", async () => {
        await send(
            port,
            jsonFrame({
                cluster: "onoff",
                command: "read",
                command_specifier: "on-off",
                arguments: { "destination-id": "0x12344321", "endpoint-ids": "1", timeout: "30" },
            }),
        );
        await send(
            port,
            jsonFrame({
                cluster: "onoff",
                command: "read",
                command_specifier: "on-off",
                arguments: { "destination-id": "0x12344321", "endpoint-ids": "1" },
            }),
        );

        expect(handler.signals.length).equal(2);
        expect(handler.signals[0]).not.equal(undefined);

        // A deadline that has not expired must not reach the operation as one that has.
        expect(handler.signals[0]?.aborted).equal(false);
        expect(handler.signals[1]).equal(undefined);
    });

    it("refuses a timeout it cannot read rather than running the step unbounded", async () => {
        const reply = await send(
            port,
            jsonFrame({
                cluster: "onoff",
                command: "read",
                command_specifier: "on-off",
                arguments: { "destination-id": "0x12344321", "endpoint-ids": "1", timeout: "soon" },
            }),
        );

        expect(reply.results[0].error).match(
            /^Test harness failure — ImplementationError: A step declared the unusable/,
        );
        expect(handler.signals).deep.equal([]);
    });

    it("cancels a discovery whose step deadline expired, rather than waiting out its window", async () => {
        handler.discoveryWaitsForAbort = true;

        const reply = await send(
            port,
            jsonFrame({
                cluster: "discover",
                command: "find-commissionable-by-long-discriminator",
                arguments: { value: "3840", timeout: "1" },
            }),
        );

        expect(reply.results).deep.equal([{ error: "FAILURE" }]);
        expect(handler.discoveryCancellations).deep.equal([{ longDiscriminator: 3840 }]);
    });

    it("keeps a command's own Timeout field while reading the step's timeout beside it", async () => {
        // The runner sends a command field under its specification name and the step's own deadline in
        // lower case, so the two never collide — Door Lock's UnlockWithTimeout carries both at once.
        await send(
            port,
            jsonFrame({
                cluster: "doorlock",
                command: "UnlockWithTimeout",
                arguments: {
                    "destination-id": "0x12344321",
                    "endpoint-id-ignored-for-group-commands": "1",
                    Timeout: 10,
                    PINCode: "123456",
                    timeout: "30",
                },
            }),
        );

        expect(handler.invokes.length).equal(1);
        expect(handler.invokes[0].data).deep.equal({ timeout: 10, pinCode: 123456 });

        // The step's deadline reached the operation, and did not become a command field.
        expect(handler.invokes[0].abort).not.equal(undefined);
    });

    it("refuses a deadline on an operation it cannot bound, rather than dropping it", async () => {
        for (const frame of [
            jsonFrame({
                cluster: "delay",
                command: "wait-for-commissionee",
                arguments: { nodeId: "0x12344321", timeout: "5" },
            }),
            jsonFrame({
                cluster: "pairing",
                command: "code",
                arguments: { "node-id": "0x12344321", payload: "MT:-24J042C00KA0648G00", timeout: "5" },
            }),
        ]) {
            const reply = await send(port, frame);

            expect(reply.results[0].error).match(/^Test harness failure — ImplementationError: A ".*" step declared/);
            expect(reply.results[1]).deep.equal({ error: "FAILURE" });
        }

        // Neither operation was driven at all, so neither was handed a deadline it would ignore.
        expect(handler.paseConnections).deep.equal([]);
    });

    it("reports a controller of its own that would not start as its own fault", async () => {
        // Plain Error, as a storage or socket failure arrives: the classification has to come from
        // where the start was driven, not from the error's own type.
        handler.startFailure = new Error("EADDRINUSE");

        const reply = await send(
            port,
            jsonFrame({
                cluster: "onoff",
                command: "write",
                command_specifier: "on-time",
                arguments: {
                    "destination-id": "0x12344321",
                    "endpoint-id-ignored-for-group-commands": "1",
                    "attribute-values": "5",
                },
            }),
        );

        expect(reply.results[0].error).match(/^Test harness failure — InternalError: Controller "alpha" failed/);
        expect(reply.results[1]).deep.equal({ error: "FAILURE" });
    });

    it("reports a command addressed to a controller it does not have as its own fault", async () => {
        const reply = await send(
            port,
            jsonFrame({
                cluster: "discover",
                command: "find-commissionable-by-short-discriminator",
                arguments: { value: "15", "commissioner-name": "delta" },
            }),
        );

        expect(reply.results[0].error).match(/^Test harness failure — ImplementationError: Unknown controller: delta/);
        expect(reply.results[1]).deep.equal({ error: "FAILURE" });
    });
});
