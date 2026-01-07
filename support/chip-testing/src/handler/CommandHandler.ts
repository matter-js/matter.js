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

export type ReadAttributeRequest = {
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

export type ReadByIdRequest = {
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

export type WriteAttributeRequest = {
    nodeId: NodeId;
    endpointId?: EndpointNumber;
    clusterId: ClusterId;
    attributeName: string;
    value: unknown;
};

export type WriteAttributeByIdRequest = {
    nodeId: NodeId;
    endpointId?: EndpointNumber;
    clusterId: ClusterId;
    attributeId: AttributeId;
    value: unknown;
};

export type ReadEventRequest = {
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

export type InvokeRequest = {
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

export type InvokeByIdRequest = {
    nodeId: NodeId;
    endpointId: EndpointNumber;
    clusterId: ClusterId;
    commandId: CommandId;
    data: unknown;
    timedInteractionTimeout?: Duration;
};

export type DelayRequest = {
    nodeId?: NodeId;
    expireExistingSession?: boolean;
};

export type InitialPairingRequest = {
    nodeId: NodeId;
    knownAddress?: { ip: string; port: number };
} & ({ qrCode: string } | { manualCode: string } | { passcode: number; vendorId: number; productId: number });

export type DiscoveryRequest = {
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
