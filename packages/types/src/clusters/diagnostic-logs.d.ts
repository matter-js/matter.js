/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise, Bytes } from "@matter/general";
import type { StatusResponseError } from "../common/StatusResponseError.js";
import type { Status as GlobalStatus } from "../globals/Status.js";

/**
 * Definitions for the DiagnosticLogs cluster.
 *
 * This Cluster supports an interface to a Node. It provides commands for retrieving unstructured diagnostic logs from a
 * Node that may be used to aid in diagnostics. It will often be the case that unstructured diagnostic logs will be
 * Node-wide and not specific to any subset of Endpoints. When present, this Cluster shall be implemented once for the
 * Node. The Node SHOULD also implement the BDX Initiator and BDX Sender roles as defined in the BDX Protocol.
 *
 * @see {@link MatterSpecification.v142.Core} § 11.11
 */
export declare namespace DiagnosticLogs {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0032;

    /**
     * Textual cluster identifier.
     */
    export const name: "DiagnosticLogs";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the DiagnosticLogs cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link DiagnosticLogs} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * Reception of this command starts the process of retrieving diagnostic logs from a Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.11.5.1
         */
        retrieveLogsRequest(request: RetrieveLogsRequest): MaybePromise<RetrieveLogsResponse>;
    }

    /**
     * Commands that may appear in {@link DiagnosticLogs}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [{ flags: {}, commands: BaseCommands }];

    /**
     * Reception of this command starts the process of retrieving diagnostic logs from a Node.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.11.5.1
     */
    export interface RetrieveLogsRequest {
        /**
         * This field shall indicate why the diagnostic logs are being retrieved from the Node. A Node may utilize this
         * field to selectively determine the logs to transfer.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.11.5.1.1
         */
        intent: Intent;

        /**
         * This field shall be used to indicate how the log transfer is to be realized. If the field is set to BDX, then
         * if the receiving Node supports BDX it shall attempt to use BDX to transfer any potential diagnostic logs; if
         * the receiving Node does not support BDX then the Node shall follow the requirements defined for a
         * TransferProtocolEnum of ResponsePayload. If this field is set to ResponsePayload the receiving Node shall
         * only utilize the LogContent field of the RetrieveLogsResponse command to transfer diagnostic log information.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.11.5.1.2
         */
        requestedProtocol: TransferProtocol;

        /**
         * This field shall be present if the RequestedProtocol is BDX. The TransferFileDesignator shall be set as the
         * File Designator of the BDX transfer if initiated.
         *
         * ### Effect on Receipt
         *
         * On receipt of this command, the Node shall respond with a RetrieveLogsResponse command.
         *
         * If the RequestedProtocol is set to BDX the Node SHOULD immediately realize the RetrieveLogsResponse command
         * by initiating a BDX Transfer, sending a BDX SendInit message with the File Designator field of the message
         * set to the value of the TransferFileDesignator field of the RetrieveLogsRequest. On reception of a BDX
         * SendAccept message the Node shall send a RetrieveLogsResponse command with a Status field set to Success and
         * proceed with the log transfer over BDX. If a failure StatusReport is received in response to the SendInit
         * message, the Node shall send a RetrieveLogsResponse command with a Status of Denied. In the case where the
         * Node is able to fit the entirety of the requested logs within the LogContent field, the Status field of the
         * RetrieveLogsResponse shall be set to Exhausted and a BDX session shall NOT be initiated.
         *
         * If the RequestedProtocol is set to BDX and either the Node does not support BDX or it is not possible for the
         * Node to establish a BDX session, then the Node shall utilize the LogContent field of the RetrieveLogsResponse
         * command to transfer as much of the current logs as it can fit within the response, and the Status field of
         * the RetrieveLogsResponse shall be set to Exhausted.
         *
         * If the RequestedProtocol is set to ResponsePayload the Node shall utilize the LogContent field of the
         * RetrieveLogsResponse command to transfer as much of the current logs as it can fit within the response, and a
         * BDX session shall NOT be initiated.
         *
         * If the RequestedProtocol is set to BDX and there is no TransferFileDesignator the command shall fail with a
         * Status Code of INVALID_COMMAND.
         *
         * If the Intent and/or the RequestedProtocol arguments contain invalid (out of range) values the command shall
         * fail with a Status Code of INVALID_COMMAND.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.11.5.1.3
         */
        transferFileDesignator?: string;
    }

    /**
     * This shall be generated as a response to the RetrieveLogsRequest.
     *
     * The data for this command is shown in the following.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.11.5.2
     */
    export interface RetrieveLogsResponse {
        /**
         * This field shall indicate the result of an attempt to retrieve diagnostic logs.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.11.5.2.1
         */
        status: Status;

        /**
         * This field shall be included in the command if the Status field has a value of Success or Exhausted. A Node
         * SHOULD utilize this field to transfer the newest diagnostic log entries. This field shall be empty if BDX is
         * requested and the Status field has a value of Success.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.11.5.2.2
         */
        logContent: Bytes;

        /**
         * This field SHOULD be included in the command if the Status field has a value of Success and the Node
         * maintains a wall clock. When included, the UTCTimeStamp field shall contain the value of the oldest log entry
         * in the diagnostic logs that are being transferred.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.11.5.2.3
         */
        utcTimeStamp?: number | bigint;

        /**
         * This field SHOULD be included in the command if the Status field has a value of Success. When included, the
         * TimeSinceBoot field shall contain the time of the oldest log entry in the diagnostic logs that are being
         * transferred represented by the number of microseconds since the last time the Node went through a reboot.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.11.5.2.4
         */
        timeSinceBoot?: number | bigint;
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.11.4.1
     */
    export enum Intent {
        /**
         * Logs to be used for end-user support
         *
         * shall indicate that the purpose of the log request is to retrieve logs for the intention of providing support
         * to an end-user.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.11.4.1.1
         */
        EndUserSupport = 0,

        /**
         * Logs to be used for network diagnostics
         *
         * shall indicate that the purpose of the log request is to diagnose the network(s) for which the Node is
         * currently commissioned (and/or connected) or has previously been commissioned (and/or connected).
         *
         * @see {@link MatterSpecification.v142.Core} § 11.11.4.1.2
         */
        NetworkDiag = 1,

        /**
         * Obtain crash logs from the Node
         *
         * shall indicate that the purpose of the log request is to retrieve any crash logs that may be present on a
         * Node.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.11.4.1.3
         */
        CrashLogs = 2
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.11.4.2
     */
    export enum Status {
        /**
         * Successful transfer of logs
         *
         * shall be used if diagnostic logs will be or are being transferred.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.11.4.2.1
         */
        Success = 0,

        /**
         * All logs have been transferred
         *
         * shall be used when a BDX session is requested, however, all available logs were provided in a LogContent
         * field.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.11.4.2.2
         */
        Exhausted = 1,

        /**
         * No logs of the requested type available
         *
         * shall be used if the Node does not currently have any diagnostic logs of the requested type (Intent) to
         * transfer.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.11.4.2.3
         */
        NoLogs = 2,

        /**
         * Unable to handle request, retry later
         *
         * shall be used if the Node is unable to handle the request (e.g. in the process of another transfer) and the
         * Client SHOULD re-attempt the request later.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.11.4.2.4
         */
        Busy = 3,

        /**
         * The request is denied, no logs being transferred
         *
         * shall be used if the Node is denying the current transfer of diagnostic logs for any reason.
         *
         * @see {@link MatterSpecification.v142.Core} § 11.11.4.2.5
         */
        Denied = 4
    }

    /**
     * Thrown for cluster status code {@link Status.Exhausted}.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.11.4.2.2
     */
    export class ExhaustedError extends StatusResponseError {
        constructor(message?: string, code?: GlobalStatus, clusterCode?: number)
    }

    /**
     * Thrown for cluster status code {@link Status.NoLogs}.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.11.4.2.3
     */
    export class NoLogsError extends StatusResponseError {
        constructor(message?: string, code?: GlobalStatus, clusterCode?: number)
    }

    /**
     * Thrown for cluster status code {@link Status.Busy}.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.11.4.2.4
     */
    export class BusyError extends StatusResponseError {
        constructor(message?: string, code?: GlobalStatus, clusterCode?: number)
    }

    /**
     * Thrown for cluster status code {@link Status.Denied}.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.11.4.2.5
     */
    export class DeniedError extends StatusResponseError {
        constructor(message?: string, code?: GlobalStatus, clusterCode?: number)
    }

    /**
     * @see {@link MatterSpecification.v142.Core} § 11.11.4.3
     */
    export enum TransferProtocol {
        /**
         * Logs to be returned as a response
         *
         * shall be used by a Client to request that logs are transferred using the LogContent attribute of the response
         *
         * @see {@link MatterSpecification.v142.Core} § 11.11.4.3.1
         */
        ResponsePayload = 0,

        /**
         * Logs to be returned using BDX
         *
         * shall be used by a Client to request that logs are transferred using BDX as defined in BDX Protocol
         *
         * @see {@link MatterSpecification.v142.Core} § 11.11.4.3.2
         */
        Bdx = 1
    }

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * @deprecated Use {@link DiagnosticLogs}.
     */
    export const Cluster: typeof DiagnosticLogs;

    /**
     * @deprecated Use {@link DiagnosticLogs}.
     */
    export const Complete: typeof DiagnosticLogs;

    export const Typing: DiagnosticLogs;
}

/**
 * @deprecated Use {@link DiagnosticLogs}.
 */
export declare const DiagnosticLogsCluster: typeof DiagnosticLogs;

export interface DiagnosticLogs extends ClusterTyping {
    Commands: DiagnosticLogs.Commands;
    Components: DiagnosticLogs.Components;
}
