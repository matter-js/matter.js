/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Abort, Gate, MqttEndpoint, Mutex } from "#general";
import { IPublishPacket, ISubscriptionGrant, MqttClient, OnMessageCallback } from "mqtt";
import { MqttJsMessage } from "./MqttJsMessage.js";

/**
 * MQTT.js-based MQTT endpoint.
 */
export class MqttJsEndpoint implements MqttEndpoint {
    #client: MqttClient;
    #nextSubscriptionIdentifier = 1;
    #mutex = new Mutex(this);

    constructor(client: MqttClient, options: MqttEndpoint.ConnectionOptions) {
        this.#client = client;

        const { onUp, onDown } = options;

        if (onUp) {
            const onConnect = () => this.#mutex.run(async () => onUp(this));

            queueMicrotask(onConnect);
            this.#client.on("connect", () => this.#mutex.run(async () => onUp(this)));
        }

        if (onDown) {
            this.#client.on("offline", () => this.#mutex.run(async () => onDown(this)));
        }
    }

    async *subscribe(
        topic: string,
        options?: MqttEndpoint.SubscriptionOptions,
    ): AsyncIterableIterator<MqttEndpoint.Message> {
        const subscriptionIdentifier = this.#nextSubscriptionIdentifier++;

        const queue = new Array<MqttEndpoint.Message>();
        const gate = new Gate();

        let grants: ISubscriptionGrant[] | undefined;
        try {
            this.#client.on("message", onMessage);
            grants = await this.#client.subscribeAsync(topic, {
                nl: options?.noLocal ?? true,
                properties: {
                    subscriptionIdentifier,
                },
            });

            while (true) {
                await Abort.race(options?.abort, gate);
                if (Abort.is(options?.abort)) {
                    break;
                }

                while (true) {
                    const message = queue.shift();
                    if (message === undefined) {
                        gate.close();
                        break;
                    }
                    yield message;
                }
            }
        } finally {
            this.#client.off("message", onMessage);
            if (grants && !(this.#client.disconnecting || this.#client.disconnected)) {
                for (const grant of grants) {
                    await this.#client.unsubscribeAsync(grant.topic);
                }
            }
        }

        function onMessage(_topic: unknown, _payload: unknown, packet: IPublishPacket) {
            if (packet.properties?.subscriptionIdentifier !== subscriptionIdentifier) {
                return;
            }
            queue.push(MqttJsMessage.decode(packet));
            gate.open();
        }

        onMessage satisfies OnMessageCallback;
    }

    async publish(message: MqttEndpoint.Message): Promise<void> {
        const { topic, payload, options } = MqttJsMessage.encode(message);
        await this.#client.publishAsync(topic, payload, options);
    }

    async close() {
        await this.#client.endAsync();
        await this.#mutex.then();
    }
}
