/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message } from "#codec/MessageCodec.js";
import { Fabric as RealFabric } from "#fabric/Fabric.js";
import {
    b$,
    Bytes,
    Channel,
    ChannelType,
    Crypto,
    DataReadQueue,
    Environment,
    ImplementationError,
    IpNetworkChannel,
    MAX_UDP_MESSAGE_SIZE,
    MaybePromise,
    MockCrypto,
    Observable,
    ServerAddressUdp,
} from "#general";
import { MessageType } from "#interaction/InteractionMessenger.js";
import { NodeSession as RealNodeSession } from "#session/NodeSession.js";
import { Session } from "#session/Session.js";
import { SessionParameters } from "#session/SessionParameters.js";
import { FabricId, FabricIndex, NodeId, SECURE_CHANNEL_PROTOCOL_ID, Status, TlvStatusResponse, VendorId } from "#types";
import { Specification } from "@matter/model";
import { MessageChannel as RealMessageChannel } from "./MessageChannel.js";
import { MessageExchange, MessageExchangeContext } from "./MessageExchange.js";

export namespace ProtocolMocks {
    /**
     * A fabric that will fill any fields not provided with placeholder values.
     */
    export class Fabric extends RealFabric {
        constructor(config?: Partial<RealFabric.Config>, crypto?: Crypto) {
            if (!crypto) {
                crypto = Environment.default.maybeGet(Crypto);
                if (!(crypto instanceof MockCrypto)) {
                    crypto = MockCrypto();
                }
            }

            const keyPair = config?.keyPair ?? crypto.createKeyPair();
            if (MaybePromise.is(keyPair)) {
                throw new ImplementationError("Must provide key pair with async crypto");
            }

            super(crypto, {
                ...Fabric.defaults,
                ...config,
                keyPair,
            });
        }
    }

    export namespace Fabric {
        export const defaults: RealFabric.Config = {
            fabricId: FabricId(0x2906c908d115d362n),
            fabricIndex: FabricIndex(1),
            identityProtectionKey: Bytes.empty,
            intermediateCACert: Bytes.empty,
            keyPair: { publicKey: Bytes.empty, privateKey: Bytes.empty },
            label: "test-fabric",
            nodeId: NodeId(0xcd5544aa7b13ef14n),
            operationalCert: Bytes.empty,
            operationalId: Bytes.empty,
            operationalIdentityProtectionKey: b$`9bc61cd9c62a2df6d64dfcaa9dc472d4`,
            rootCert: Bytes.empty,
            rootNodeId: NodeId(1),
            rootPublicKey: b$`044a9f42b1ca4840d37292bbc7f6a7e11e22200c976fc900dbc98a7a383a641cb8254a2e56d4e295a847943b4e3897c4a773e930277b4d9fbede8a052686bfacfa`,
            rootVendorId: VendorId(1),
        };
    }

    /**
     * A mock {@link NodeSession} that supports functional tests without full mock networking.
     */
    export class NodeSession extends RealNodeSession {
        constructor(config?: Partial<RealNodeSession.Config> & { index?: number; fabricIndex?: number }) {
            const index = config?.index ?? 1;
            const fabricIndex = (config?.fabricIndex ?? 1) as FabricIndex;
            const crypto = config?.crypto ?? Environment.default.get(Crypto);
            const fabric = config?.fabric ?? new Fabric({ fabricIndex });

            super({
                crypto,
                fabric,
                id: index,
                peerNodeId: NodeId(index),
                attestationKey: Bytes.empty,
                caseAuthenticatedTags: [],
                peerSessionId: index,
                decryptKey: Bytes.empty,
                encryptKey: Bytes.empty,
                isInitiator: true,
                ...config,
            });
        }
    }

    /**
     * A mock channel that can act as a placeholder without full mock networking.
     */
    export class NetworkChannel implements IpNetworkChannel<Bytes> {
        maxPayloadSize = MAX_UDP_MESSAGE_SIZE;
        isReliable = false;
        supportsLargeMessages = false;
        name = "mock-byte-channel";
        type = ChannelType.UDP;
        networkAddress: ServerAddressUdp;

        constructor(config: { index?: number }) {
            const index = config.index ?? 1;
            this.networkAddress = { type: "udp", ip: `::${index}`, port: 5540 };
        }

        async send(): Promise<void> {
            // Currently we just ignore transmissions
        }

        async close() {}
    }

    /**
     * A mock message channel that stores outbound messages for later analysis.
     */
    export class MessageChannel extends RealMessageChannel {
        #requests = new DataReadQueue<Message>();
        #readReady?: Observable<[]>;

        constructor(config?: {
            channel?: Channel<Bytes>;
            session?: Session;
            onClose?: () => MaybePromise<void>;
            index?: number;
            fabricIndex?: number;
        }) {
            const index = config?.index ?? 1;
            const fabricIndex = config?.fabricIndex ?? 1;
            const channel = config?.channel ?? new NetworkChannel({ index });
            const session = config?.session ?? new NodeSession({ index, fabricIndex });
            super(channel, session, config?.onClose);
        }

        override async send(message: Message) {
            this.#requests.push(message);
            this.#readReady?.emit();
        }

        read() {
            return this.#requests.read();
        }

        get readReady() {
            return (this.#readReady ??= new Observable());
        }
    }

    /**
     * A mock message exchange that "transports" messages via internal queues.
     */
    export class Exchange extends MessageExchange {
        #responses = new DataReadQueue<Message>();

        constructor(
            config?: Omit<Partial<MessageExchange.Config>, "context"> & {
                context?: Partial<MessageExchangeContext>;
                index?: number;
                fabricIndex?: number;
            },
        ) {
            const context = config?.context;

            const index = config?.index ?? 1;
            const fabricIndex = config?.fabricIndex ?? 1;

            super({
                isInitiator: true,
                exchangeId: index,
                peerSessionId: index,
                protocolId: SECURE_CHANNEL_PROTOCOL_ID,
                requiresSecureSession: true,

                ...config,

                context: {
                    channel: context?.channel ?? new MessageChannel({ index, fabricIndex }),
                    localSessionParameters: SessionParameters(
                        context?.localSessionParameters ?? SessionParameters.defaults,
                    ),
                    retry() {},
                },
            });
        }

        /**
         * Enqueue a mock response.
         */
        async write(message: Message) {
            this.#responses.push(message);
        }

        /**
         * Enqueue a mock status response.
         */
        async writeStatus(status = Status.Success) {
            await this.write({
                payloadHeader: {
                    messageType: MessageType.StatusResponse,
                },
                payload: TlvStatusResponse.encode({
                    status,
                    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                }),
            } as Message);
        }

        /**
         * Wait for a mock request.
         */
        read() {
            return this.#mockChannel.read();
        }

        /**
         * Emits when read() won't block.
         */
        get readReady() {
            return this.#mockChannel.read();
        }

        override nextMessage() {
            return this.#responses.read();
        }

        override async close() {}

        get #mockChannel() {
            const channel = this.channel;
            if (!(channel instanceof MessageChannel)) {
                throw new ImplementationError("Message channel is not mocked");
            }
            return channel;
        }
    }
}
