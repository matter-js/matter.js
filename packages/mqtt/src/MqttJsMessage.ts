/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, MqttEndpoint } from "#general";
import { IClientPublishOptions, IPublishPacket } from "mqtt";
import { Buffer as SafeBuffer } from "safe-buffer";

// We need safe-buffer for platforms that do not supply equivalent of Node.js Buffer.  The types are incompatible with
// modern node types so install in a local variable and cast to standard buffer type
const Buffer = globalThis.Buffer ?? SafeBuffer;
const empty = Buffer.alloc(0);

export namespace MqttJsMessage {
    export function encode(message: MqttEndpoint.Message): {
        topic: string;
        payload: string | Buffer;
        options?: IClientPublishOptions;
    } {
        let payload: Buffer | string, payloadFormatIndicator: boolean;
        if (message.payload === null) {
            payload = empty;
            payloadFormatIndicator = false;
        } else if (Bytes.isBytes(message.payload)) {
            payload = bytesToBuffer(message.payload);
            payloadFormatIndicator = false;
        } else {
            payload = message.payload;
            payloadFormatIndicator = true;
        }

        return {
            topic: message.topic,
            payload,

            options: {
                qos: message.qos,
                retain: message.retain,

                properties: {
                    payloadFormatIndicator,
                    contentType: message.contentType,
                    correlationData: message.correlationData && bytesToBuffer(message.correlationData),
                    responseTopic: message.responseTopic,
                },
            },
        };
    }

    export function decode(message: IPublishPacket): MqttEndpoint.Message {
        return {
            topic: message.topic,
            payload: message.payload.length ? message.payload : null,
            qos: message.qos,
            retain: message.retain,
            contentType: message.properties?.contentType,
            correlationData: message.properties?.correlationData,
            responseTopic: message.properties?.responseTopic,
        };
    }
}

function bytesToBuffer(bytes: Bytes) {
    bytes = Bytes.exclusive(bytes);

    if (bytes instanceof ArrayBuffer) {
        return Buffer.from(bytes);
    }

    return Buffer.from(bytes.buffer, bytes.byteLength, bytes.byteOffset);
}
