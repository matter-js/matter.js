/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment } from "#environment/Environment.js";
import { AppAddress } from "#net/AppAddress.js";
import { Abort } from "#util/Abort.js";
import { Bytes } from "#util/Bytes.js";
import { MaybePromise } from "#util/Promises.js";

export interface MqttEndpoint {
    subscribe(
        topic: string,
        options?: MqttEndpoint.SubscriptionOptions,
    ): AsyncIterableIterator<MqttEndpoint.Message, void, void>;
    publish(message: MqttEndpoint.Message): Promise<void>;

    close(): Promise<void>;
}

export namespace MqttEndpoint {
    export interface Message {
        topic: string;
        payload: Bytes | string | null;
        retain?: boolean;
        contentType?: string;
        responseTopic?: string;
        correlationData?: Bytes;
        qos?: 0 | 1 | 2;
    }

    export function Message(message: Message) {
        return message;
    }

    export interface ConnectionOptions {
        address: AppAddress.Definition;
        environment?: Environment;
        will?: Message;
        onUp?: (endpoint: MqttEndpoint) => MaybePromise<void>;
        onDown?: (endpoint: MqttEndpoint) => MaybePromise<void>;
    }

    export interface SubscriptionOptions {
        noLocal?: boolean;
        abort?: Abort.Signal;
    }
}
