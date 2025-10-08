/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import {
    Abort,
    Base64,
    Bytes,
    decamelize,
    InternalError,
    MqttEndpoint,
    MqttService,
    Mutex,
    NotImplementedError,
} from "#general";
import { any, CommandModel, Metatype, Schema } from "#model";
import { StateStream } from "#node/integration/StateStream.js";
import { StatusResponse } from "#types";
import { Api } from "../api/Api.js";
import { ApiPath } from "../api/ApiPath.js";
import { Envelope } from "../api/Envelope.js";
import { LocalResponse } from "../api/LocalResponse.js";
import { RemoteRequest } from "../api/RemoteRequest.js";
import { RemoteResponse } from "../api/RemoteResponse.js";
import { RemoteInterface } from "../RemoteInterface.js";
import { RemoteInterfaceService } from "../RemoteInterfaceService.js";

const LOG_FACILITY = "MQTT";

/**
 * MQTT remote interface.
 *
 * Currently publishes a read-only feed.  Will address TODOs if there is real-world use.
 *
 * TODO - events
 * TODO - clean out topics from previous runs that are no longer relevant, e.g. deleted endpoint, removed attrs, etc.
 * TODO - TLV serialiation/deserialization
 */
export class MqttInterface extends RemoteInterface {
    static override protocol = "mqtt";

    #endpoint?: MqttEndpoint;
    #mutex = new Mutex(this);
    #retainedTopics = new Map<string, Map<number, Set<string>>>();

    protected override async start() {
        this.#endpoint = await this.env.get(MqttService).connect({
            address: this.address,
            environment: this.node.env,

            will: {
                topic: this.root.at("status").toString(),
                payload: "offline",
            },

            onUp: endpoint => {
                if (!this.#endpoint) {
                    this.#endpoint = endpoint;
                }

                return this.#publish({
                    topic: this.root.at("status").toString(),
                    payload: "online",
                });
            },
        });

        this.addWorker(this.#listen(), "mqtt listener");
        this.addWorker(this.#feed(), "mqtt feeder");
    }

    protected override async stop() {
        await this.#mutex.then();
        await this.#mqtt?.close();
    }

    /**
     * A background process that handles incoming MQTT messages.
     */
    async #listen() {
        await Abort.race(this.abort, this.node.construction);
        if (Abort.is(this.abort)) {
            return;
        }

        let topic = this.root.toString();
        if (topic !== "") {
            topic += "/#";
        } else {
            topic = "#";
        }

        for await (const message of this.#mqtt.subscribe(`${topic}`, { noLocal: true, abort: this.abort })) {
            // We publish retained messages so ignore these; if not retained it's a write or invoke
            if (message.retain) {
                continue;
            }

            // This should always be true but make sure
            const relativeTopic = this.root.subpathFor(new ApiPath(message.topic));
            if (!relativeTopic) {
                continue;
            }

            await this.#respond(relativeTopic, message);
        }
    }

    async #respond(topic: ApiPath, message: MqttEndpoint.Message) {
        let response: LocalResponse | undefined;

        const via = message.correlationData ? Bytes.toHex(message.correlationData) : message.responseTopic;

        try {
            await this.node.act("MQTT listener", async agent => {
                // Specialized topic "call" is for RPC messaging using RemoteRequest/RemoteResponse
                if (topic.toString() === "call") {
                    response = await this.#call(message);
                    return;
                }

                const item = await Api.resourceFor(agent, topic);
                if (item === undefined) {
                    throw new StatusResponse.NotFoundError(`No resource at subtopic ${topic}`);
                }

                const schema = item.schema;
                if (!schema) {
                    throw new NotImplementedError();
                }
                const input = payloadToJs(schema, message.payload);

                if (item.isInvocable) {
                    Api.logRequest(LOG_FACILITY, via, "invoke", topic.toString());

                    let value = await item.invoke({ js: input });

                    const responseSchema = (schema as CommandModel).responseModel;
                    if (responseSchema) {
                        value ??= new Envelope({ schema: responseSchema, js: null });
                        response = { kind: "value", value };
                    }
                } else {
                    Api.logRequest(LOG_FACILITY, via, "update", topic.toString());

                    await item.patch(input ?? { js: null });
                }
            });
        } catch (e) {
            response = Api.errorResponseOf(LOG_FACILITY, via, e);
        }

        if (!response) {
            response = { kind: "ok" };
        }

        response.id = via;
        Api.logResponse(LOG_FACILITY, RemoteResponse(response));

        if (message.responseTopic) {
            await this.#publish({
                topic: message.responseTopic,
                correlationData: message.correlationData,
                payload: JSON.stringify(response),
            });
        }
    }

    /**
     * Specialized handling for "call" topic to support full {@link RemoteRequest}/{@link RemoteResponse} interaction.
     */
    async #call(message: MqttEndpoint.Message) {
        const request = parseJsonPayload(message.payload);
        const response = await Api.execute(LOG_FACILITY, this.node, request, this.abort);

        // I don't think there's any point in supporting subscriptions when MQTT offers a superior mechanism, so for now
        // just throw if this is attempted
        if (response.kind === "subscription") {
            await response.stream.return?.();
            throw new StatusResponse.InvalidSubscriptionError(
                "Subscription via RPC is not supported, use MQTT instead",
            );
        }

        return response;
    }

    /**
     * A background process that continuously updates MQTT topics.
     */
    async #feed() {
        const stream = StateStream(this.node, { abort: this.abort });

        for await (const change of stream) {
            await this.#mutex.produce(async () => {
                switch (change.kind) {
                    case "update":
                        await this.#publishUpdate(change);
                        break;

                    case "delete":
                        await this.#publishDelete(change);
                }
            });
        }
    }

    /**
     * Publish attribute values for state changes.
     */
    async #publishUpdate({ node, endpoint, behavior, changes }: StateStream.Update) {
        let nodeTopics = this.#retainedTopics.get(node.id);
        if (nodeTopics === undefined) {
            this.#retainedTopics.set(node.id, (nodeTopics = new Map()));
        }
        let endpointTopics = nodeTopics.get(endpoint.number);
        if (endpointTopics === undefined) {
            nodeTopics.set(endpoint.number, (endpointTopics = new Set()));
        }

        const behaviorRoot = this.#nodeRoot(node.id).at([endpoint.number.toString(), decamelize(behavior.id)]);
        for (const name in changes) {
            const value = changes[name];
            const schema = behavior.schema?.conformant.properties.for(name);
            const payload = jsToPayload(schema ?? any, value);

            const topic = behaviorRoot.at([name]).toString();
            endpointTopics.add(topic);

            await this.#publish({
                topic,
                payload,
                retain: true,
            });
        }
    }

    /**
     * Delete all published topics for an endpoint or node that has disappeared.
     */
    async #publishDelete(change: StateStream.Delete) {
        const nodeTopics = this.#retainedTopics.get(change.node.id);
        if (!nodeTopics) {
            return;
        }

        const deleteEndpoint = async (endpoint: number) => {
            const topics = nodeTopics.get(endpoint);
            if (!topics) {
                return;
            }

            for (const topic of topics) {
                await this.#publish({
                    topic,
                    payload: null,
                    retain: true,
                });
            }

            nodeTopics.delete(endpoint);
        };

        if (change.endpoint === change.node) {
            for (const number of nodeTopics.keys()) {
                await deleteEndpoint(number);
            }
            this.#retainedTopics.delete(change.node.id);
        } else {
            await deleteEndpoint(change.endpoint.number);
        }
    }

    /**
     * Obtain the root path for a node.
     *
     * This will either be the root path for the server or a subpath for peers.
     */
    #nodeRoot(id: string) {
        if (id === this.node.id) {
            return this.root;
        }

        return this.root.at(["peers", id]);
    }

    /**
     * Safe access to the MQTT endpoint.
     */
    get #mqtt() {
        if (this.#endpoint === undefined) {
            throw new InternalError("MQTT endpoint missing");
        }
        return this.#endpoint;
    }

    /**
     * Publish a message.
     *
     * Default QOS is 2.
     */
    #publish(message: MqttEndpoint.Message) {
        if (this.abort.aborted) {
            throw new InternalError("MQTT publish after abort");
        }
        if (message.qos === undefined) {
            message.qos = 2;
        }
        return this.#mqtt.publish(message);
    }
}

function payloadToJs(schema: Schema, payload: Bytes | string | null): unknown {
    if (payload === null) {
        return null;
    }

    const length = typeof payload === "string" ? payload.length : payload.byteLength;
    if (!length) {
        return null;
    }

    let js;
    switch (schema.effectiveMetatype) {
        case Metatype.object:
        case Metatype.array:
        case Metatype.bitmap:
            js = parseJsonPayload(payload);
            break;

        case Metatype.bytes:
            if (typeof payload === "string") {
                try {
                    js = Base64.decode(payload);
                } catch (e) {
                    if (e instanceof SyntaxError) {
                        throw new StatusResponse.InvalidDataTypeError(
                            `Value is not binary or a base64 string: ${e.message}`,
                        );
                    }
                }
                break;
            }

            js = payload;
            break;

        default:
            if (Bytes.isBytes(payload)) {
                try {
                    payload = Bytes.toString(payload);
                } catch (e) {
                    if (e instanceof TypeError) {
                        throw new StatusResponse.InvalidDataTypeError(
                            `Value is not a valid UTF-8 string: ${e.message}`,
                        );
                    }
                }
            }
            break;
    }

    const supervisor = RootSupervisor.for(schema);
    return supervisor.cast(js);
}

function jsToPayload(schema: Schema, js: unknown): Bytes | string {
    if (js === undefined || js === null || js === "") {
        return Bytes.empty;
    }

    switch (schema.effectiveMetatype) {
        case Metatype.object:
        case Metatype.array:
        case Metatype.bitmap:
            // TODO - serialize bitmap as number?
            return JSON.stringify(js);

        case Metatype.bytes:
            if (Bytes.isBytes(js)) {
                return js;
            }
            return Bytes.fromString(js.toString());

        default:
            if (Bytes.isBytes(js)) {
                return js;
            }
            return js.toString();
    }
}

function parseJsonPayload(payload: MqttEndpoint.Message["payload"]) {
    if (payload === null) {
        throw new StatusResponse.InvalidDataTypeError("Empty payload where JSON expected");
    }
    if (Bytes.isBytes(payload)) {
        payload = Bytes.toString(payload);
    }
    try {
        return JSON.parse(payload);
    } catch (e) {
        if (e instanceof SyntaxError) {
            throw new StatusResponse.InvalidDataTypeError(`Payload is not valid JSON: ${e.message}`);
        }
        throw e;
    }
}

RemoteInterfaceService.register(MqttInterface);
