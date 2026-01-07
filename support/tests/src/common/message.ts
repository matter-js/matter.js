/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LogLevel } from "@matter/general";
import { NodeId } from "@matter/types";

/**
 * Messages sent to the controller process.
 *
 * TODO - temporary protocol; convert to standard controller messaging/RPC once implemented
 */
export type Message = Message.Commission | Message.Subscribe | Message.Reset;

export function Message(definition: Message) {
    return definition;
}

export namespace Message {
    export interface Acknowledged {
        exchangeNo: number;
    }

    export interface TargetsNode {
        nodeId?: NodeId; // Defaults to 1
    }

    export interface Commission extends Acknowledged, TargetsNode {
        kind: "commission";
        discriminator: number;
        passcode: number;
    }

    export interface Subscribe extends Acknowledged, TargetsNode {
        kind: "subscribe";
    }

    export interface Reset extends Acknowledged {
        kind: "reset";
    }

    export type Inbound = Ack | Log;

    export interface Ack extends Acknowledged {
        kind: "ack";
        exchangeNo: number;
        result?: unknown;
        error?: string;
    }

    export interface Log {
        kind: "log";
        level: LogLevel;
        message: string;
    }
}
