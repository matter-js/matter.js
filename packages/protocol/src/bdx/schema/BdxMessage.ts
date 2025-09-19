/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, InternalError } from "#general";
import { BdxMessageType, Schema, SchemaType } from "#types";
import { BdxReceiveAcceptMessage, BdxSendAcceptMessage } from "./BdxAcceptMessagesSchema.js";
import {
    BdxBlockAckEofMessage,
    BdxBlockAckMessage,
    BdxBlockEofMessage,
    BdxBlockMessage,
    BdxBlockQueryMessage,
    BdxBlockQueryWithSkipMessage,
} from "./BdxBlockMessagesSchema.js";
import { BdxReceiveInitMessage, BdxSendInitMessage } from "./BdxInitMessagesSchema.js";

export interface BdxMessage<T extends BdxMessageType> {
    kind: T;
    message: SchemaType<BdxMessage.Kinds[T]>;
}

/** Convenient wrapper around BDX message encoding/decoding and type guards. */
export namespace BdxMessage {
    export function encode<T extends BdxMessageType>({ kind, message }: BdxMessage<T>) {
        if (!(kind in Kinds)) {
            throw new InternalError(`Can not encode unknown BDX message type: ${kind}`);
        }
        return Kinds[kind].encode(message);
    }

    export function decode<T extends BdxMessageType>(kind: T, payload: Bytes): BdxMessage<T> {
        if (!(kind in Kinds)) {
            throw new InternalError(`Can not decode unknown BDX message type: ${kind}`);
        }
        return { kind, message: Kinds[kind].decode(payload) };
    }

    export function is<T extends BdxMessageType>(message: BdxMessage<any>, kind: T): message is BdxMessage<T> {
        return message.kind === kind;
    }

    export function assert<T extends BdxMessageType>(
        message: BdxMessage<any>,
        kind: T,
    ): asserts message is BdxMessage<T> {
        if (message.kind !== kind) {
            throw new InternalError(
                `Expected BDX message of type ${BdxMessageType[kind]}, but got ${BdxMessageType[message.kind]}(${message.kind})`,
            );
        }
    }

    export const Kinds: { [key: number]: Schema<any> } = {
        [BdxMessageType.SendInit]: BdxSendInitMessage,
        [BdxMessageType.ReceiveInit]: BdxReceiveInitMessage,
        [BdxMessageType.SendAccept]: BdxSendAcceptMessage,
        [BdxMessageType.ReceiveAccept]: BdxReceiveAcceptMessage,
        [BdxMessageType.BlockQuery]: BdxBlockQueryMessage,
        [BdxMessageType.BlockQueryWithSkip]: BdxBlockQueryWithSkipMessage,
        [BdxMessageType.Block]: BdxBlockMessage,
        [BdxMessageType.BlockEof]: BdxBlockEofMessage,
        [BdxMessageType.BlockAck]: BdxBlockAckMessage,
        [BdxMessageType.BlockAckEof]: BdxBlockAckEofMessage,
    } as const;

    export type Kinds = typeof Kinds;
}
