/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttributeId,
    Bytes,
    ClusterId,
    CommandId,
    Duration,
    EventId,
    EventNumber,
    NodeId,
    Observable,
} from "@matter/main";
import { CommissionableDeviceIdentifiers } from "@matter/main/protocol";
import { EndpointNumber, Status } from "@matter/main/types";

/**
 * The step's own deadline, for the operations that can honour one.
 *
 * A YAML step may carry `timeout: <seconds>`, which real chip-tool honours by giving up and tearing its
 * command down. The operation is abandoned when this aborts — see `ClientRequest.abort` for what that
 * does and does not tell the device.
 *
 * An operation whose underlying API takes no signal does not accept this, so a deadline is never handed
 * to something that would ignore it: `DelayRequest` and `InitialPairingRequest` say why.
 */
export type AbandonableRequest = {
    abort?: AbortSignal;
};

export type ReadAttributeRequest = AbandonableRequest & {
    nodeId: NodeId;
    endpointId: EndpointNumber;
    clusterId: ClusterId;
    attributeId: AttributeId;
    fabricFiltered?: boolean;
};
export type AttributeResponseData = {
    clusterId: number;
    attributeId: number;
    endpointId: number;
    dataVersion: number;
    value: unknown;
};
export type AttributeResponseStatus = {
    clusterId: number;
    attributeId: number;
    endpointId: number;
    status?: Status;
    clusterStatus?: number;
};
export type ReadAttributeResponse = { values: AttributeResponseData[]; status?: AttributeResponseStatus[] };

export type ReadByIdRequest = AbandonableRequest & {
    nodeId: NodeId;
    endpointId: EndpointNumber;
    clusterId: ClusterId;
    attributeId: AttributeId;
    fabricFiltered?: boolean;
};
export type AttributeErrorResponseData = {
    clusterId: number;
    attributeId: number;
    endpointId: number;
    error: string;
};

export type ReadByIdResponse = AttributeErrorResponseData;

export type SubscribeAttributeRequest = ReadAttributeRequest & {
    minInterval: number;
    maxInterval: number;
    changeListener: (data: AttributeResponseData) => void;
};
export type SubscribeAttributeResponse = {
    values: AttributeResponseData[];
    updated: Observable<[void]>;
};

export type WriteAttributeRequest = AbandonableRequest & {
    nodeId: NodeId;
    endpointId?: EndpointNumber;
    clusterId: ClusterId;
    attributeName: string;
    value: unknown;
};

export type WriteAttributeByIdRequest = AbandonableRequest & {
    nodeId: NodeId;
    endpointId?: EndpointNumber;
    clusterId: ClusterId;
    attributeId: AttributeId;
    value: unknown;
};

export type ReadEventRequest = AbandonableRequest & {
    nodeId: NodeId;
    endpointId: EndpointNumber;
    clusterId: ClusterId;
    eventId: EventId;
    eventMin?: EventNumber;
};
export type EventResponseData = {
    clusterId: number;
    eventId: number;
    endpointId: number;
    eventNumber: number | bigint;
    value: unknown;
};
export type EventResponseStatus = {
    clusterId: number;
    eventId: number;
    endpointId: number;
    status?: Status;
    clusterStatus?: number;
};
export type ReadEventResponse = { values: EventResponseData[]; status?: EventResponseStatus[] };

export type SubscribeEventRequest = ReadEventRequest & {
    minInterval: number;
    maxInterval: number;
    changeListener: (data: EventResponseData) => void;
};
export type SubscribeEventResponse = {
    values: EventResponseData[];
    updated: Observable<[void]>;
};

export type InvokeRequest = AbandonableRequest & {
    nodeId: NodeId;
    endpointId?: EndpointNumber;
    clusterId: ClusterId;
    commandId: CommandId;
    data: unknown;
    timedInteractionTimeout?: Duration;
    suppressResponse?: boolean;
};
export type InvokeResponse = {
    clusterId: number;
    commandId?: number;
    endpointId: number;
    value?: unknown;
};

export type InvokeByIdRequest = AbandonableRequest & {
    nodeId: NodeId;
    endpointId: EndpointNumber;
    clusterId: ClusterId;
    commandId: CommandId;
    data: unknown;
    timedInteractionTimeout?: Duration;
};

/**
 * Waiting for a commissionee is bounded by its own discovery timeout and by nothing else: the
 * controller API this drives takes no signal, so this request deliberately does not accept one — see
 * {@link AbandonableRequest}.
 */
export type DelayRequest = {
    nodeId?: NodeId;
    expireExistingSession?: boolean;
};

/**
 * Commissioning runs to its own conclusion: `CommissioningController.commissionNode` takes no signal,
 * so this request deliberately does not accept one — see {@link AbandonableRequest}.
 */
export type InitialPairingRequest = {
    nodeId: NodeId;
    knownAddress?: { ip: string; port: number };
} & ({ qrCode: string } | { manualCode: string } | { passcode: number; vendorId: number; productId: number });

export type DiscoveryRequest = AbandonableRequest & {
    findBy: CommissionableDeviceIdentifiers;
};

export type DiscoveryResponse = {
    value: {
        commissioningMode: number;
        deviceName: string;
        deviceType: number;
        hostName: string;
        instanceName: string;
        longDiscriminator: number;
        numIPs: number;
        pairingHint: number;
        pairingInstruction: string;
        port: number;
        productId: number;
        rotatingId: string;
        rotatingIdLen: number;
        shortDiscriminator: number;
        supportsTcpClient: boolean;
        supportsTcpServer: boolean;
        vendorId: number;
    };
}[];

export type RootCertificateResponse = {
    RCAC: Bytes;
};

export type IssueNocChainRequest = {
    elements: Bytes;
    nodeId: NodeId;
};

export type IssueNocChainResponse = {
    ICAC?: Bytes;
    IPK: Bytes;
    NOC: Bytes;
    RCAC: Bytes;
};

export abstract class CommandHandler {
    /**
     * Whether {@link start} has completed. A consumer starts a handler on first use rather than up
     * front, so a run that never addresses a controller never pays for starting it.
     */
    abstract get started(): boolean;

    /** Brings the underlying controller up. Idempotent: starting an already-started handler is a no-op. */
    abstract start(): Promise<void>;

    /** Establishes a PASE session with the commissionee the request names, without commissioning it. */
    abstract handlePaseConnection(data: InitialPairingRequest): Promise<void>;

    /**
     * Drops the session with `nodeId`. The YAML corpus expects a failed interaction to stay failed, so
     * a caller uses this where an automatic reconnection would answer a step that must not succeed.
     */
    abstract disconnectNode(nodeId: NodeId): Promise<void>;

    abstract handleReadAttribute(data: ReadAttributeRequest): Promise<ReadAttributeResponse>;
    abstract handleSubscribeAttribute(data: SubscribeAttributeRequest): Promise<SubscribeAttributeResponse>;
    abstract handleWriteAttribute(data: WriteAttributeRequest): Promise<void>;
    abstract handleWriteAttributeById(data: WriteAttributeByIdRequest): Promise<void>;
    abstract handleReadEvent(data: ReadEventRequest): Promise<ReadEventResponse>;
    abstract handleSubscribeEvent(data: SubscribeEventRequest): Promise<SubscribeEventResponse>;
    abstract handleInvoke(data: InvokeRequest): Promise<any>;
    abstract handleInvokeById(data: InvokeByIdRequest): Promise<void>;
    abstract handleInitialPairing(data: InitialPairingRequest): Promise<void>;
    abstract getCommissionerNodeId(): NodeId | undefined;
    abstract getCommissionerRootCertificate(): RootCertificateResponse;
    abstract commissionerIssueNocChain(data: IssueNocChainRequest): Promise<IssueNocChainResponse>;
    abstract handleDelay(data: DelayRequest): Promise<void>;
    abstract handleDiscovery(data: DiscoveryRequest): Promise<DiscoveryResponse>;
}
