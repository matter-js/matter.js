/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InteractionClient } from "#cluster/client/InteractionClient.js";
import {
    Duration,
    Environment,
    ImplementationError,
    MatterError,
    MemoryStorageDriver,
    NotImplementedError,
    Seconds,
    StandardCrypto,
    StorageContext,
    TransportSet,
} from "@matter/general";
import { AttributeModel } from "@matter/model";
import {
    DedicatedChannelExchangeProvider,
    ExchangeManager,
    FabricManager,
    Interactable,
    InvokeResult,
    PeerAddress,
    ProtocolMocks,
    ReadResult,
    SessionManager,
    SubscribeResult,
    Write,
    WriteResult,
} from "@matter/protocol";
import { ClusterId, ClusterType, EndpointNumber, FabricIndex, GroupId, NodeId } from "@matter/types";
import { OnOff } from "@matter/types/clusters/on-off";

class WriteCaptured extends MatterError {}

/** Records the write it is handed, then fails it; the test inspects the request, not a response. */
class CapturingInteractable implements Interactable {
    request?: Write;

    read(): ReadResult {
        throw new NotImplementedError();
    }

    subscribe(): SubscribeResult {
        throw new NotImplementedError();
    }

    invoke(): InvokeResult {
        throw new NotImplementedError();
    }

    write<T extends Write>(request: T): WriteResult<T> {
        this.request = request;
        return Promise.reject(new WriteCaptured());
    }
}

const ON_TIME = OnOff.attributes.onTime;
const GROUP_ADDRESS = PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId.fromGroupId(GroupId(5)) });

describe("InteractionClient write", () => {
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

    async function writeRequestFor(
        attribute: ClusterType.Attribute,
        options: { asTimedRequest?: boolean; timedRequestTimeout?: Duration; address?: PeerAddress } = {},
    ) {
        const { address, ...timing } = options;
        const interaction = new CapturingInteractable();
        const client = new InteractionClient(interaction, exchangeProvider, address);
        await expect(
            client.setAttribute({
                attributeData: {
                    endpointId: address === undefined ? EndpointNumber(1) : undefined,
                    clusterId: ClusterId(OnOff.id),
                    attribute,
                    value: 30,
                },
                ...timing,
            }),
        ).rejectedWith(WriteCaptured);
        return interaction.request;
    }

    it("sends a write to an attribute that does not require a timed write as an untimed write", async () => {
        const request = await writeRequestFor(ON_TIME);

        expect(request?.timedRequest).equal(false);
        expect(request?.timeout).undefined;
    });

    it("sends a timed write with the default timeout where the caller asks for one", async () => {
        const request = await writeRequestFor(ON_TIME, { asTimedRequest: true });

        expect(request?.timedRequest).equal(true);
        expect(request?.timeout).equal(Seconds(10));
    });

    it("sends a timed write where the caller gives a timeout", async () => {
        const request = await writeRequestFor(ON_TIME, { timedRequestTimeout: Seconds(3) });

        expect(request?.timedRequest).equal(true);
        expect(request?.timeout).equal(Seconds(3));
    });

    it("sends a timed write to an attribute whose access requires it", async () => {
        const timedAttribute = {
            id: ON_TIME.id,
            name: ON_TIME.name,
            schema: new AttributeModel({ name: "OnTime", id: ON_TIME.id, type: "uint16", access: "RW VO T" }),
        };

        const request = await writeRequestFor(timedAttribute);

        expect(request?.timedRequest).equal(true);
        expect(request?.timeout).equal(Seconds(10));
    });

    it("sends a group write untimed, which a group accepts", async () => {
        const request = await writeRequestFor(ON_TIME, { address: GROUP_ADDRESS });

        expect(request?.timedRequest).equal(false);
        expect(request?.suppressResponse).equal(true);
    });

    it("refuses a timed group write before sending it", async () => {
        const client = new InteractionClient(new CapturingInteractable(), exchangeProvider, GROUP_ADDRESS);

        await expect(
            client.setAttribute({
                attributeData: { clusterId: ClusterId(OnOff.id), attribute: ON_TIME, value: 30 },
                asTimedRequest: true,
            }),
        ).rejectedWith(ImplementationError, "Timed requests are not supported for group address writes.");
    });
});
