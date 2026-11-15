/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ResultStatus } from "#action/response/ResultStatus.js";
import {
    Status,
    type ClusterId,
    type CommandId,
    type CommandPath,
    type EndpointNumber,
    type TlvStream,
} from "@matter/types";

export type InvokeResult = AsyncIterable<InvokeResult.Chunk>;

export type DecodedInvokeResult = AsyncIterable<InvokeResult.DecodedChunk>;

export namespace InvokeResult {
    export type Chunk = Iterable<Data>;
    export type DecodedChunk = Iterable<DecodedData>;

    export type Data = CommandStatus | CommandResponse;
    export type DecodedData = CommandStatus | DecodedCommandResponse;

    export interface ConcreteCommandPath extends CommandPath {
        endpointId: EndpointNumber;
        clusterId: ClusterId;
        commandId: CommandId;
    }

    export interface CommandStatus extends ResultStatus {
        kind: "cmd-status";
        path: ConcreteCommandPath;
        commandRef?: number;
    }

    export interface CommandResponse {
        kind: "cmd-response";
        path: ConcreteCommandPath;
        commandRef?: number;
        data: TlvStream;
    }

    export interface DecodedCommandResponse extends Omit<CommandResponse, "data"> {
        data: any;
    }

    /**
     * The response fields of an invoke of one command, or `undefined` for a command that answers with a status only.
     *
     * Throws the status error when the peer answers with a status other than success.
     */
    export async function responseOfSingleCommand(result: DecodedInvokeResult) {
        for await (const chunk of result) {
            for (const entry of chunk) {
                // One command was sent, so the first entry is its only answer
                switch (entry.kind) {
                    case "cmd-status":
                        if (entry.status !== Status.Success) {
                            throw ResultStatus.errorOf(entry);
                        }
                        return;

                    case "cmd-response":
                        return entry.data;
                }
            }
        }
    }
}
