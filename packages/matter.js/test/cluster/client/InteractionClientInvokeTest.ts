/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InteractionClient } from "#cluster/client/InteractionClient.js";
import {
    Environment,
    MemoryStorageDriver,
    NotImplementedError,
    StandardCrypto,
    StorageContext,
    TransportSet,
} from "@matter/general";
import {
    DedicatedChannelExchangeProvider,
    ExchangeManager,
    FabricManager,
    Interactable,
    InvokeResult,
    ProtocolMocks,
    ReadResult,
    SessionManager,
    SubscribeResult,
    Write,
    WriteResult,
} from "@matter/protocol";
import {
    ClusterId,
    CommandId,
    EndpointNumber,
    ReceivedStatusResponse,
    ReceivedStatusResponseError,
    Status,
    StatusResponseError,
} from "@matter/types";
import { OnOff } from "@matter/types/clusters/on-off";

/** Answers every invoke with the given command status. */
class StatusAnsweringInteractable implements Interactable {
    constructor(readonly status: InvokeResult.CommandStatus) {}

    read(): ReadResult {
        throw new NotImplementedError();
    }

    subscribe(): SubscribeResult {
        throw new NotImplementedError();
    }

    async *invoke(): InvokeResult {
        yield [this.status];
    }

    write<T extends Write>(): WriteResult<T> {
        throw new NotImplementedError();
    }
}

const ON_PATH = {
    endpointId: EndpointNumber(1),
    clusterId: ClusterId(OnOff.id),
    commandId: CommandId(1),
};

describe("InteractionClient invoke", () => {
    let sessions: SessionManager;
    let exchanges: ExchangeManager;
    let exchangeProvider: DedicatedChannelExchangeProvider;

    before(async () => {
        const storage = new MemoryStorageDriver();
        storage.initialize();
        const crypto = new StandardCrypto();
        sessions = new SessionManager({
            fabrics: new FabricManager(crypto),
            storage: new StorageContext(storage, ["context"]),
        });
        await sessions.construction.ready;
        exchanges = new ExchangeManager({
            lifetime: new Environment("test"),
            entropy: crypto,
            transports: new TransportSet(),
            sessions,
        });
        exchangeProvider = new DedicatedChannelExchangeProvider(
            exchanges,
            new ProtocolMocks.NodeSession({ manager: sessions }),
        );
    });

    after(async () => {
        await exchanges.close();
        await sessions.close();
    });

    async function failureOf(status: InvokeResult.CommandStatus) {
        const client = new InteractionClient(new StatusAnsweringInteractable(status), exchangeProvider);
        try {
            await client.invoke({
                endpointId: EndpointNumber(1),
                clusterId: ClusterId(OnOff.id),
                command: OnOff.commands.on,
                request: undefined,
            });
        } catch (error) {
            return error;
        }
        expect.fail("invoke did not throw");
    }

    it("throws a received error for a failure status the peer sent", async () => {
        const error = await failureOf({
            kind: "cmd-status",
            path: ON_PATH,
            status: Status.ConstraintError,
            clusterStatus: 3,
            received: true,
        });

        expect(error).instanceOf(ReceivedStatusResponse.ConstraintErrorError);
        expect(error).instanceOf(ReceivedStatusResponseError);
        const { code, clusterCode, message } = StatusResponseError.of(error)!;
        expect(code).equal(Status.ConstraintError);
        expect(clusterCode).equal(3);
        expect(message).equal("Received non-success result (code 135; cluster code 3)");
    });

    it("throws a local error for a failure status matter.js produced", async () => {
        const error = await failureOf({ kind: "cmd-status", path: ON_PATH, status: Status.Failure });

        expect(error).instanceOf(StatusResponseError);
        expect(error).not.instanceOf(ReceivedStatusResponseError);
    });
});
