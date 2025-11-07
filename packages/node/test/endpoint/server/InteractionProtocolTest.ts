/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// TODO Bring together/Sync with BehaviorServerTest

import { AdministratorCommissioningServer } from "#behaviors/administrator-commissioning";
import { OnOffServer } from "#behaviors/on-off";
import { WiFiNetworkDiagnosticsServer } from "#behaviors/wi-fi-network-diagnostics";
import { AdministratorCommissioning } from "#clusters/administrator-commissioning";
import { BasicInformation } from "#clusters/basic-information";
import { GeneralDiagnostics } from "#clusters/general-diagnostics";
import { Observable } from "#general";
import { Specification } from "#model";
import { InteractionServer } from "#node/server/InteractionServer.js";
import { ServerNode } from "#node/ServerNode.js";
import {
    BaseDataReport,
    DataReportPayload,
    DataReportPayloadIterator,
    InteractionServerMessenger,
    InvokeRequest,
    InvokeResponse,
    MessageType,
    ReadRequest,
    SubscribeRequest,
    WriteRequest,
    WriteResponse,
} from "#protocol";
import {
    AttributeId,
    ClusterId,
    CommandId,
    EndpointNumber,
    EventId,
    EventNumber,
    FabricIndex,
    StatusCode,
    StatusResponseError,
    TlvArray,
    TlvClusterId,
    TlvFabricIndex,
    TlvField,
    TlvInvokeResponse,
    TlvNoArguments,
    TlvNullable,
    TlvObject,
    TlvOptionalField,
    TlvStatusResponse,
    TlvString,
    TlvUInt16,
    TlvUInt8,
    TlvVendorId,
    TypeFromBitmapSchema,
    TypeFromPartialBitSchema,
    VendorId,
    WildcardPathFlagsBitmap,
} from "#types";
import { MockServerNode } from "../../node/mock-server-node.js";
import { interaction } from "../../node/node-helpers.js";
import { createDummyMessageExchange } from "./InteractionTestUtils.js";
import TlvOpenBasicCommissioningWindowRequest = AdministratorCommissioning.TlvOpenBasicCommissioningWindowRequest;

const READ_REQUEST: ReadRequest = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    isFabricFiltered: true,
    attributeRequests: [
        { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), attributeId: AttributeId(2) },
        { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), attributeId: AttributeId(4) },
        { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), attributeId: AttributeId(400) }, // unsupported attribute
        { endpointId: EndpointNumber(0), clusterId: ClusterId(0x99), attributeId: AttributeId(4) }, // unsupported cluster
        { endpointId: EndpointNumber(1), clusterId: ClusterId(0x28), attributeId: AttributeId(1) }, // unsupported endpoint
        { endpointId: undefined, clusterId: ClusterId(0x28), attributeId: AttributeId(3) },
        { endpointId: undefined, clusterId: ClusterId(0x99), attributeId: AttributeId(3) }, // ignore
        { endpointId: EndpointNumber(0), clusterId: ClusterId(0x1d), attributeId: AttributeId(1) },
    ],
    eventRequests: [
        { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), eventId: EventId(0) }, // existing event
        { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), eventId: EventId(254) }, // unsupported event
        { endpointId: EndpointNumber(0), clusterId: ClusterId(0x99), eventId: EventId(4) }, // unsupported cluster
        { endpointId: EndpointNumber(1), clusterId: ClusterId(0x28), eventId: EventId(1) }, // unsupported endpoint
    ],
};

const READ_REQUEST_WITH_UNUSED_FILTER: ReadRequest = {
    ...READ_REQUEST,
    dataVersionFilters: [{ path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28) }, dataVersion: 0 }],
    eventFilters: [{ eventMin: 0 }],
};

const READ_REQUEST_WITH_FILTER: ReadRequest = {
    ...READ_REQUEST,
    dataVersionFilters: [
        { path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28) }, dataVersion: 0x80808081 },
    ],

    eventFilters: [{ eventMin: 2 }],
};

const READ_REQUEST_WILDCARD_EVENTS: ReadRequest = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    isFabricFiltered: true,
    eventRequests: [{ endpointId: EndpointNumber(0), isUrgent: true }],
};

const READ_REQUEST_WILDCARD_EVENTS_WITH_FILTER: ReadRequest = {
    ...READ_REQUEST_WILDCARD_EVENTS,
    eventFilters: [{ eventMin: 3 }],
};

const READ_RESPONSE: DataReportPayload = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    suppressResponse: true,
    attributeReportsPayload: [
        {
            hasFabricSensitiveData: false,
            attributeStatus: {
                path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), attributeId: AttributeId(400) },
                status: { status: 134 },
            },
        },
        {
            hasFabricSensitiveData: false,
            attributeStatus: {
                path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x99), attributeId: AttributeId(4) },
                status: { status: 195 },
            },
        },
        {
            hasFabricSensitiveData: false,
            attributeStatus: {
                path: { endpointId: EndpointNumber(1), clusterId: ClusterId(0x28), attributeId: AttributeId(1) },
                status: { status: 127 },
            },
        },
        {
            hasFabricSensitiveData: true,
            attributeData: {
                path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), attributeId: AttributeId(2) },
                schema: TlvVendorId,
                payload: 1,
                dataVersion: 0x80808081,
            },
        },
        {
            hasFabricSensitiveData: true,
            attributeData: {
                path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), attributeId: AttributeId(4) },
                schema: TlvUInt16,
                payload: 2,
                dataVersion: 0x80808081,
            },
        },

        {
            hasFabricSensitiveData: true,
            attributeData: {
                path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), attributeId: AttributeId(3) },
                schema: TlvString.bound({ maxLength: 32 }),
                payload: "product",
                dataVersion: 0x80808081,
            },
        },
        {
            hasFabricSensitiveData: true,
            attributeData: {
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: ClusterId(0x1d),
                    attributeId: AttributeId(1),
                },
                schema: TlvArray(TlvClusterId),
                payload: [
                    ClusterId(40),
                    ClusterId(31),
                    ClusterId(63),
                    ClusterId(48),
                    ClusterId(60),
                    ClusterId(62),
                    ClusterId(51),
                    ClusterId(29),
                ],
                dataVersion: 0x80808081,
            },
        },
    ],
    eventReportsPayload: [
        {
            hasFabricSensitiveData: false,
            eventStatus: {
                path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), eventId: EventId(254) },
                status: { status: 199 },
            },
        },
        {
            hasFabricSensitiveData: false,
            eventStatus: {
                path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x99), eventId: EventId(4) },
                status: { status: 195 },
            },
        },
        {
            hasFabricSensitiveData: false,
            eventStatus: {
                path: { endpointId: EndpointNumber(1), clusterId: ClusterId(0x28), eventId: EventId(1) },
                status: { status: 127 },
            },
        },
        {
            hasFabricSensitiveData: true,
            eventData: {
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: ClusterId(0x28),
                    eventId: EventId(0),
                },
                schema: BasicInformation.TlvStartUpEvent,
                payload: {
                    softwareVersion: 1,
                },
                eventNumber: EventNumber(1),
                priority: 2,
                epochTimestamp: MockTime.epoch.getTime(),
            },
        },
        {
            hasFabricSensitiveData: true,
            eventData: {
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: ClusterId(0x28),
                    eventId: EventId(0),
                },
                schema: BasicInformation.TlvStartUpEvent,
                payload: {
                    softwareVersion: 2,
                },
                eventNumber: EventNumber(3),
                priority: 2,
                epochTimestamp: MockTime.epoch.getTime(),
            },
        },
    ],
};

const READ_RESPONSE_WITH_FILTER: DataReportPayload = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    suppressResponse: true,
    attributeReportsPayload: [
        {
            hasFabricSensitiveData: false,
            attributeStatus: {
                path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), attributeId: AttributeId(400) },
                status: { status: 134 },
            },
        },
        {
            hasFabricSensitiveData: false,
            attributeStatus: {
                path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x99), attributeId: AttributeId(4) },
                status: { status: 195 },
            },
        },
        {
            hasFabricSensitiveData: false,
            attributeStatus: {
                path: { endpointId: EndpointNumber(1), clusterId: ClusterId(0x28), attributeId: AttributeId(1) },
                status: { status: 127 },
            },
        },
        {
            hasFabricSensitiveData: true,
            attributeData: {
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: ClusterId(0x1d),
                    attributeId: AttributeId(1),
                },
                schema: TlvArray(TlvClusterId),
                payload: [
                    ClusterId(40),
                    ClusterId(31),
                    ClusterId(63),
                    ClusterId(48),
                    ClusterId(60),
                    ClusterId(62),
                    ClusterId(51),
                    ClusterId(29),
                ],
                dataVersion: 0x80808081,
            },
        },
    ],
    eventReportsPayload: [
        {
            hasFabricSensitiveData: false,
            eventStatus: {
                path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), eventId: EventId(254) },
                status: { status: 199 },
            },
        },
        {
            hasFabricSensitiveData: false,
            eventStatus: {
                path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x99), eventId: EventId(4) },
                status: { status: 195 },
            },
        },
        {
            hasFabricSensitiveData: false,
            eventStatus: {
                path: { endpointId: EndpointNumber(1), clusterId: ClusterId(0x28), eventId: EventId(1) },
                status: { status: 127 },
            },
        },
        {
            hasFabricSensitiveData: true,
            eventData: {
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: ClusterId(0x28),
                    eventId: EventId(0),
                },
                schema: BasicInformation.TlvStartUpEvent,
                payload: {
                    softwareVersion: 2,
                },
                eventNumber: EventNumber(3),
                priority: 2,
                epochTimestamp: MockTime.epoch.getTime(),
            },
        },
    ],
};

const READ_RESPONSE_WILDCARD_EVENTS: DataReportPayload = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    suppressResponse: true,
    eventReportsPayload: [
        {
            eventData: {
                path: { endpointId: EndpointNumber(0), clusterId: ClusterId(40), eventId: EventId(0) },
                eventNumber: EventNumber(1),
                priority: 2,
                epochTimestamp: MockTime.epoch.getTime(),
                payload: { softwareVersion: 1 },
                schema: BasicInformation.TlvStartUpEvent,
            },
            hasFabricSensitiveData: true,
        },
        {
            eventData: {
                path: { endpointId: EndpointNumber(0), clusterId: ClusterId(51), eventId: EventId(3) },
                eventNumber: EventNumber(2),
                priority: 2,
                epochTimestamp: MockTime.epoch.getTime(),
                payload: { bootReason: 0 },
                schema: GeneralDiagnostics.TlvBootReasonEvent,
            },
            hasFabricSensitiveData: true,
        },
        {
            eventData: {
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: ClusterId(40),
                    eventId: EventId(0),
                },
                eventNumber: EventNumber(3),
                priority: 2,
                epochTimestamp: MockTime.epoch.getTime(),
                payload: { softwareVersion: 2 },
                schema: BasicInformation.TlvStartUpEvent,
            },
            hasFabricSensitiveData: true,
        },
    ],
};

const READ_RESPONSE_WILDCARD_EVENTS_WITH_FILTER: DataReportPayload = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    suppressResponse: true,
    eventReportsPayload: [
        {
            hasFabricSensitiveData: true,
            eventData: {
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: ClusterId(0x28),
                    eventId: EventId(0),
                },
                schema: BasicInformation.TlvStartUpEvent,
                payload: {
                    softwareVersion: 2,
                },
                eventNumber: EventNumber(3),
                priority: 2,
                epochTimestamp: MockTime.epoch.getTime(),
            },
        },
    ],
};

const INVALID_SUBSCRIBE_REQUEST: SubscribeRequest = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    isFabricFiltered: true,
    attributeRequests: [
        { endpointId: EndpointNumber(0), clusterId: ClusterId(0x99), attributeId: AttributeId(2) },
        { endpointId: EndpointNumber(99) },
    ],
    eventRequests: [
        { endpointId: EndpointNumber(0), clusterId: ClusterId(0x99), eventId: EventId(2) },
        { endpointId: EndpointNumber(99) },
    ],
    keepSubscriptions: true,
    minIntervalFloorSeconds: 1,
    maxIntervalCeilingSeconds: 2,
};

const WRITE_REQUEST: WriteRequest = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    suppressResponse: false,
    timedRequest: false,
    writeRequests: [
        {
            path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), attributeId: AttributeId(100) },
            data: TlvUInt8.encodeTlv(3),
        },
        {
            path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x99), attributeId: AttributeId(4) },
            data: TlvUInt8.encodeTlv(3),
        },
        {
            path: { endpointId: EndpointNumber(1), clusterId: ClusterId(0x28), attributeId: AttributeId(4) },
            data: TlvUInt8.encodeTlv(3),
            dataVersion: 0x80808081,
        },
        {
            path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), attributeId: AttributeId(5) },
            data: TlvString.encodeTlv("test"),
            dataVersion: 0x80808081,
        },
        {
            path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), attributeId: AttributeId(6) },
            data: TlvString.encodeTlv("AB"),
            dataVersion: 0x80808090,
        },
        {
            path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), attributeId: AttributeId(3) },
            data: TlvString.encodeTlv("test"),
            dataVersion: 0x80808081,
        },
    ],
    moreChunkedMessages: false,
};

const WRITE_RESPONSE: WriteResponse = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    writeResponses: [
        {
            path: { attributeId: AttributeId(100), clusterId: ClusterId(40), endpointId: EndpointNumber(0) },
            status: { clusterStatus: undefined, status: 134 },
        },
        {
            path: { attributeId: AttributeId(4), clusterId: ClusterId(0x99), endpointId: EndpointNumber(0) },
            status: { clusterStatus: undefined, status: 195 },
        },
        {
            path: { attributeId: AttributeId(4), clusterId: ClusterId(40), endpointId: EndpointNumber(1) },
            status: { clusterStatus: undefined, status: 127 },
        },
        {
            path: { attributeId: AttributeId(5), clusterId: ClusterId(40), endpointId: EndpointNumber(0) },
            status: { clusterStatus: undefined, status: 0 },
        },
        {
            path: { attributeId: AttributeId(6), clusterId: ClusterId(40), endpointId: EndpointNumber(0) },
            status: { clusterStatus: undefined, status: 146 },
        },
        {
            path: { attributeId: AttributeId(3), clusterId: ClusterId(40), endpointId: EndpointNumber(0) },
            status: { clusterStatus: undefined, status: 136 },
        },
    ],
};

const WRITE_REQUEST_TIMED_REQUIRED: WriteRequest = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    suppressResponse: false,
    timedRequest: false,
    writeRequests: [
        {
            path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), attributeId: AttributeId(5) },
            data: TlvString.encodeTlv("test"),
            dataVersion: 0x80808081,
        },
    ],
    moreChunkedMessages: false,
};

const WRITE_RESPONSE_TIMED_REQUIRED: WriteResponse = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    writeResponses: [
        {
            path: { attributeId: AttributeId(5), clusterId: ClusterId(40), endpointId: EndpointNumber(0) },
            status: { clusterStatus: undefined, status: 0 },
        },
    ],
};

/*const WRITE_RESPONSE_TIMED_ERROR: WriteResponse = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    writeResponses: [
        {
            path: { attributeId: AttributeId(5), clusterId: ClusterId(40), endpointId: EndpointNumber(0) },
            status: { clusterStatus: undefined, status: 198 },
        },
    ],
};*/

const ILLEGAL_MASS_WRITE_REQUEST: WriteRequest = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    suppressResponse: false,
    timedRequest: false,
    writeRequests: [
        {
            path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), attributeId: AttributeId(0x5) },
            data: TlvString.encodeTlv("test"),
            dataVersion: 0x80808081,
        },
        {
            path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x99) },
            data: TlvString.encodeTlv("test"),
            dataVersion: 0x80808081,
        },
        {
            path: { endpointId: EndpointNumber(1), clusterId: ClusterId(0x28), attributeId: AttributeId(0x5) },
            data: TlvString.encodeTlv("test"),
            dataVersion: 0x80808081,
        },
    ],
    moreChunkedMessages: false,
};

const MASS_WRITE_REQUEST: WriteRequest = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    suppressResponse: false,
    timedRequest: false,
    writeRequests: [
        {
            path: { clusterId: ClusterId(0x28), attributeId: AttributeId(0x5) },
            data: TlvString.encodeTlv("test"),
            dataVersion: 0x80808081,
        },
    ],
    moreChunkedMessages: false,
};

const MASS_WRITE_RESPONSE: WriteResponse = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    writeResponses: [
        {
            path: { attributeId: AttributeId(5), clusterId: ClusterId(40), endpointId: EndpointNumber(0) },
            status: { clusterStatus: undefined, status: 0 },
        },
    ],
};

const TlvAclTestSchema = TlvObject({
    privilege: TlvField(1, TlvUInt8),
    authMode: TlvField(2, TlvUInt8),
    subjects: TlvField(3, TlvNullable(TlvUInt8)),
    targets: TlvField(4, TlvNullable(TlvUInt8)),
    fabricIndex: TlvOptionalField(254, TlvFabricIndex),
});

const CHUNKED_ARRAY_WRITE_REQUEST: WriteRequest = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    suppressResponse: false,
    timedRequest: false,
    writeRequests: [
        {
            path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x1f), attributeId: AttributeId(0) },
            data: TlvArray(TlvAclTestSchema).encodeTlv([]),
        },
        {
            path: {
                endpointId: EndpointNumber(0),
                clusterId: ClusterId(0x1f),
                attributeId: AttributeId(0),
                listIndex: null,
            },
            data: TlvAclTestSchema.encodeTlv({
                privilege: 1,
                authMode: 2,
                subjects: null,
                targets: null,
            }),
        },
        {
            path: {
                endpointId: EndpointNumber(0),
                clusterId: ClusterId(0x1f),
                attributeId: AttributeId(0),
                listIndex: null,
            },
            data: TlvAclTestSchema.encodeTlv({
                privilege: 1,
                authMode: 1,
                subjects: null,
                targets: null,
                fabricIndex: FabricIndex.NO_FABRIC,
            }),
        },
        {
            path: {
                endpointId: EndpointNumber(0),
                clusterId: ClusterId(0x1f),
                attributeId: AttributeId(0),
                listIndex: null,
            },
            data: TlvAclTestSchema.encodeTlv({
                privilege: 1,
                authMode: 3,
                subjects: null,
                targets: null,
                fabricIndex: FabricIndex(2),
            }),
        },
    ],
    moreChunkedMessages: false,
};

const CHUNKED_ARRAY_WRITE_RESPONSE: WriteResponse = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    writeResponses: [
        {
            path: {
                attributeId: AttributeId(0),
                clusterId: ClusterId(31),
                endpointId: EndpointNumber(0),
            },
            status: { clusterStatus: undefined, status: 0 },
        },
        {
            path: {
                attributeId: AttributeId(0),
                clusterId: ClusterId(31),
                endpointId: EndpointNumber(0),
                listIndex: null,
            },
            status: { clusterStatus: undefined, status: 0 },
        },
        {
            path: {
                attributeId: AttributeId(0),
                clusterId: ClusterId(31),
                endpointId: EndpointNumber(0),
                listIndex: null,
            },
            status: { clusterStatus: undefined, status: 135 },
        },
        {
            path: {
                attributeId: AttributeId(0),
                clusterId: ClusterId(31),
                endpointId: EndpointNumber(0),
                listIndex: null,
            },
            status: { clusterStatus: undefined, status: 0 },
        },
    ],
};

const INVOKE_COMMAND_REQUEST_WITH_EMPTY_ARGS: InvokeRequest = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    suppressResponse: false,
    timedRequest: false,
    invokeRequests: [
        {
            commandPath: {
                endpointId: EndpointNumber(0),
                clusterId: ClusterId(6),
                commandId: CommandId(1),
            },
            commandFields: TlvNoArguments.encodeTlv(undefined),
        },
    ],
};

const INVOKE_COMMAND_REQUEST_TIMED_REQUIRED: InvokeRequest = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    suppressResponse: false,
    timedRequest: false,
    invokeRequests: [
        {
            commandPath: {
                endpointId: EndpointNumber(0),
                clusterId: ClusterId(0x3c),
                commandId: CommandId(1),
            },
            commandFields: TlvOpenBasicCommissioningWindowRequest.encodeTlv({
                commissioningTimeout: 180,
            }),
        },
    ],
};

const INVOKE_COMMAND_RESPONSE_TIMED_REQUIRED: InvokeResponse = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    suppressResponse: false,
    invokeResponses: [
        {
            status: {
                commandPath: { clusterId: ClusterId(0x3c), commandId: CommandId(1), endpointId: EndpointNumber(0) },
                status: { status: 198 },
            },
        },
    ],
};

const INVOKE_COMMAND_RESPONSE_TIMED_REQUIRED_SUCCESS: InvokeResponse = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    suppressResponse: false,
    invokeResponses: [
        {
            status: {
                commandPath: { clusterId: ClusterId(0x3c), commandId: CommandId(1), endpointId: EndpointNumber(0) },
                status: { status: 0 },
            },
        },
    ],
};

const INVOKE_COMMAND_REQUEST_WITH_NO_ARGS: InvokeRequest = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    suppressResponse: false,
    timedRequest: false,
    invokeRequests: [
        {
            commandPath: { endpointId: EndpointNumber(0), clusterId: ClusterId(6), commandId: CommandId(1) },
        },
    ],
};

const INVOKE_COMMAND_REQUEST_MULTI_WILDCARD: InvokeRequest = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    suppressResponse: false,
    timedRequest: false,
    invokeRequests: [
        {
            commandPath: {
                endpointId: EndpointNumber(0),
                clusterId: ClusterId(6),
                commandId: CommandId(1),
            },
            commandRef: 0,
        },
        {
            commandPath: { endpointId: undefined, clusterId: ClusterId(6), commandId: CommandId(0) },
            commandRef: 1,
        },
        {
            commandPath: { endpointId: undefined, clusterId: ClusterId(6), commandId: CommandId(99) },
            commandRef: 2,
        },
        {
            commandPath: { endpointId: EndpointNumber(0), clusterId: ClusterId(6), commandId: CommandId(100) },
            commandRef: 3,
        },
        {
            commandPath: { endpointId: EndpointNumber(0), clusterId: ClusterId(90), commandId: CommandId(1) },
            commandRef: 4,
        },
        {
            commandPath: { endpointId: EndpointNumber(99), clusterId: ClusterId(6), commandId: CommandId(1) },
            commandRef: 5,
        },
    ],
};

const INVOKE_COMMAND_REQUEST_MULTI_SAME: InvokeRequest = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    suppressResponse: false,
    timedRequest: false,
    invokeRequests: [
        {
            commandPath: { endpointId: EndpointNumber(0), clusterId: ClusterId(6), commandId: CommandId(1) },
            commandRef: 0,
        },
        {
            commandPath: { endpointId: EndpointNumber(0), clusterId: ClusterId(6), commandId: CommandId(1) },
            commandRef: 1,
        },
    ],
};

const INVOKE_COMMAND_REQUEST_MULTI: InvokeRequest = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    suppressResponse: false,
    timedRequest: false,
    invokeRequests: [
        {
            commandPath: { endpointId: EndpointNumber(0), clusterId: ClusterId(6), commandId: CommandId(0) },
            commandFields: TlvNoArguments.encodeTlv(undefined),
            commandRef: 1,
        },
        {
            commandPath: { endpointId: EndpointNumber(0), clusterId: ClusterId(6), commandId: CommandId(1) },
            commandFields: TlvNoArguments.encodeTlv(undefined),
            commandRef: 2,
        },
        {
            commandPath: { endpointId: EndpointNumber(0), clusterId: ClusterId(6), commandId: CommandId(2) },
            commandFields: TlvNoArguments.encodeTlv(undefined),
            commandRef: 3,
        },
        {
            commandPath: { endpointId: EndpointNumber(0), clusterId: ClusterId(6), commandId: CommandId(100) },
            commandFields: TlvNoArguments.encodeTlv(undefined),
            commandRef: 4,
        },
    ],
};

const INVOKE_COMMAND_REQUEST_INVALID: InvokeRequest = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    suppressResponse: false,
    timedRequest: false,
    invokeRequests: [
        {
            commandPath: { endpointId: EndpointNumber(0), clusterId: ClusterId(6), commandId: CommandId(10) },
        },
    ],
};

const INVOKE_COMMAND_RESPONSE: InvokeResponse = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    suppressResponse: false,
    invokeResponses: [
        {
            status: {
                commandPath: { clusterId: ClusterId(6), commandId: CommandId(1), endpointId: EndpointNumber(0) },
                status: { status: 0 },
            },
        },
    ],
};

const INVOKE_COMMAND_RESPONSE_BUSY: InvokeResponse = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    suppressResponse: false,
    invokeResponses: [
        {
            status: {
                commandPath: { clusterId: ClusterId(6), commandId: CommandId(1), endpointId: EndpointNumber(0) },
                status: { status: 0x9c },
            },
        },
    ],
};

const INVOKE_COMMAND_RESPONSE_INVALID: InvokeResponse = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    suppressResponse: false,
    invokeResponses: [
        {
            status: {
                commandPath: { clusterId: ClusterId(6), commandId: CommandId(10), endpointId: EndpointNumber(0) },
                status: { status: 0x81 },
            },
        },
    ],
};

const INVOKE_COMMAND_RESPONSE_MULTI: InvokeResponse = {
    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
    suppressResponse: false,
    invokeResponses: [
        {
            status: {
                commandPath: { clusterId: ClusterId(6), commandId: CommandId(100), endpointId: EndpointNumber(0) },
                commandRef: 4,
                status: { status: 129 },
            },
        },
        {
            status: {
                commandPath: { clusterId: ClusterId(6), commandId: CommandId(0), endpointId: EndpointNumber(0) },
                commandRef: 1,
                status: { status: 0 },
            },
        },
        {
            status: {
                commandPath: { clusterId: ClusterId(6), commandId: CommandId(1), endpointId: EndpointNumber(0) },
                commandRef: 2,
                status: { status: 0 },
            },
        },
        {
            status: {
                commandPath: { clusterId: ClusterId(6), commandId: CommandId(2), endpointId: EndpointNumber(0) },
                commandRef: 3,
                status: { status: 0 },
            },
        },
    ],
};

const wildcardTestCases: {
    testCase: string;
    clusterId: ClusterId;
    wildcardPathFilter?: TypeFromPartialBitSchema<typeof WildcardPathFlagsBitmap>;
    count: number;
}[] = [
    { testCase: "no", clusterId: ClusterId(0x28), wildcardPathFilter: undefined, count: 23 },
    { testCase: "skipRootNode", clusterId: ClusterId(0x28), wildcardPathFilter: { skipRootNode: true }, count: 0 }, // all sorted out
    {
        testCase: "skipGlobalAttributes",
        clusterId: ClusterId(0x28), // BasicInformationCluster
        wildcardPathFilter: { skipGlobalAttributes: true },
        count: 20,
    }, // 3 less
    {
        testCase: "skipAttributeList",
        clusterId: ClusterId(0x28), // BasicInformationCluster
        wildcardPathFilter: { skipAttributeList: true },
        count: 22,
    }, // 1 less
    {
        testCase: "skipCommandLists",
        clusterId: ClusterId(0x28), // BasicInformationCluster
        wildcardPathFilter: { skipCommandLists: true },
        count: 21,
    }, // 2 less
    {
        testCase: "skipFixedAttributes",
        clusterId: ClusterId(0x28), // BasicInformationCluster
        wildcardPathFilter: { skipFixedAttributes: true },
        count: 4,
    }, // 19 less
    {
        testCase: "skipChangesOmittedAttributes",
        clusterId: ClusterId(0x28), // BasicInformationCluster
        wildcardPathFilter: { skipChangesOmittedAttributes: true },
        count: 23,
    }, // nothing filtered
    {
        testCase: "no for WiFiDiag",
        clusterId: ClusterId(0x36),
        wildcardPathFilter: {},
        count: 10,
    }, // nothing filtered
    {
        testCase: "skipChangesOmittedAttributes",
        clusterId: ClusterId(0x36),
        wildcardPathFilter: { skipChangesOmittedAttributes: true },
        count: 9,
    }, // 1 filtered
    {
        testCase: "skipDiagnosticsClusters",
        clusterId: ClusterId(0x36),
        wildcardPathFilter: { skipDiagnosticsClusters: true },
        count: 0,
    }, // all filtered
];

async function fillIterableDataReport(data: {
    dataReport: BaseDataReport;
    payload?: DataReportPayloadIterator;
}): Promise<DataReportPayload> {
    const { dataReport: report, payload } = data;
    const dataReport: DataReportPayload = { ...report };

    if (payload !== undefined) {
        for await (const payloadItem of payload) {
            if ("attributeData" in payloadItem || "attributeStatus" in payloadItem) {
                dataReport.attributeReportsPayload = dataReport.attributeReportsPayload ?? [];
                dataReport.attributeReportsPayload.push(payloadItem);
            } else if ("eventData" in payloadItem || "eventStatus" in payloadItem) {
                dataReport.eventReportsPayload = dataReport.eventReportsPayload ?? [];
                dataReport.eventReportsPayload.push(payloadItem);
            }
        }
    }
    return dataReport;
}

class EventedOnOffServer extends OnOffServer {
    declare events: EventedOnOffServer.Events;

    override on() {
        this.events.onCalled.emit(undefined);
        return super.on();
    }

    override off() {
        this.events.offCalled.emit(undefined);
        return super.off();
    }
}

namespace EventedOnOffServer {
    export class Events extends OnOffServer.Events {
        onCalled = new Observable();
        offCalled = new Observable();
    }
}

describe("InteractionProtocol", () => {
    let interactionProtocol: InteractionServer;
    let node: MockServerNode;

    async function createNode(maxPathsPerInvoke = 100) {
        node = await MockServerNode.createOnline({
            type: ServerNode.RootEndpoint.with(AdministratorCommissioningServer.with("Basic")),
            basicInformation: {
                dataModelRevision: 1,
                vendorName: "vendor",
                vendorId: VendorId(1),
                productName: "product",
                productId: 2,
                nodeLabel: "",
                uniqueId: "",
                hardwareVersion: 0,
                hardwareVersionString: "0",
                location: "US",
                localConfigDisabled: false,
                softwareVersion: 1,
                softwareVersionString: "v1",
                capabilityMinima: {
                    caseSessionsPerFabric: 100,
                    subscriptionsPerFabric: 100,
                },
                specificationVersion: Specification.SPECIFICATION_VERSION,
                maxPathsPerInvoke,
            },
            device: undefined,
        });

        interactionProtocol = node.env.get(InteractionServer);
    }

    beforeEach(async () => {
        await createNode();
    });

    describe("handleReadRequest", () => {
        it("replies with attributes and events", async () => {
            await node.act(agent => node.events.basicInformation.startUp.emit({ softwareVersion: 2 }, agent.context));

            const result = await interactionProtocol.handleReadRequest(
                await createDummyMessageExchange(node),
                READ_REQUEST,
                interaction.BarelyMockedMessage,
            );

            expect(await fillIterableDataReport(result)).deep.equals(READ_RESPONSE);
        });

        it("replies with attributes and events using (unused) version filter", async () => {
            await node.act(agent => node.events.basicInformation.startUp.emit({ softwareVersion: 2 }, agent.context));

            const result = await interactionProtocol.handleReadRequest(
                await createDummyMessageExchange(node),
                READ_REQUEST_WITH_UNUSED_FILTER,
                interaction.BarelyMockedMessage,
            );

            expect(await fillIterableDataReport(result)).deep.equals(READ_RESPONSE);
        });

        it("replies with attributes and events with active version filter", async () => {
            await node.act(agent => node.events.basicInformation.startUp.emit({ softwareVersion: 2 }, agent.context));

            const result = await interactionProtocol.handleReadRequest(
                await createDummyMessageExchange(node),
                READ_REQUEST_WITH_FILTER,
                interaction.BarelyMockedMessage,
            );

            expect(await fillIterableDataReport(result)).deep.equals(READ_RESPONSE_WITH_FILTER);
        });

        it("replies with events for wildcard read  returns correct order", async () => {
            await node.act(agent => node.events.basicInformation.startUp.emit({ softwareVersion: 2 }, agent.context));

            const result = await interactionProtocol.handleReadRequest(
                await createDummyMessageExchange(node),
                READ_REQUEST_WILDCARD_EVENTS,
                interaction.BarelyMockedMessage,
            );

            expect(await fillIterableDataReport(result)).deep.equals(READ_RESPONSE_WILDCARD_EVENTS);
        });

        it("replies with events for wildcard read active version filter", async () => {
            await node.act(agent => node.events.basicInformation.startUp.emit({ softwareVersion: 2 }, agent.context));

            const result = await interactionProtocol.handleReadRequest(
                await createDummyMessageExchange(node),
                READ_REQUEST_WILDCARD_EVENTS_WITH_FILTER,
                interaction.BarelyMockedMessage,
            );

            expect(await fillIterableDataReport(result)).deep.equals(READ_RESPONSE_WILDCARD_EVENTS_WITH_FILTER);
        });

        for (const { testCase, clusterId, wildcardPathFilter, count } of wildcardTestCases) {
            it(`replies with attributes with ${testCase} wildcard Filter`, async () => {
                node.behaviors.require(WiFiNetworkDiagnosticsServer, {
                    bssid: null,
                    securityType: null,
                    wiFiVersion: null,
                    channelNumber: null,
                    rssi: 0,
                });

                const result = await interactionProtocol.handleReadRequest(
                    await createDummyMessageExchange(node),
                    {
                        interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                        isFabricFiltered: true,
                        attributeRequests: [
                            {
                                endpointId: undefined,
                                clusterId,
                                attributeId: undefined,
                                wildcardPathFlags: wildcardPathFilter,
                            },
                        ],
                    },
                    interaction.BarelyMockedMessage,
                );

                expect((await fillIterableDataReport(result)).attributeReportsPayload?.length || 0).equals(count);
            });
        }
    });

    describe("handleSubscribeRequest", () => {
        // Success case is tested in Integration test
        it("errors when no path match the requested path's", async () => {
            const fabric = await node.addFabric();

            let statusSent = -1;
            let closed = false;
            const exchange = await createDummyMessageExchange(
                node,
                { fabric },
                false,
                false,
                (messageType, payload) => {
                    expect(messageType).equals(MessageType.StatusResponse);
                    statusSent = TlvStatusResponse.decode(payload).status;
                },
                undefined,
                () => {
                    closed = true;
                },
            );
            await interactionProtocol.handleSubscribeRequest(
                exchange,
                INVALID_SUBSCRIBE_REQUEST,
                new InteractionServerMessenger(exchange),
                interaction.BarelyMockedMessage,
            );
            expect(statusSent).equals(128);
            expect(closed).equals(true);
        });
    });

    describe("handleWriteRequest", () => {
        it("write values and return errors on invalid values", async () => {
            const result = await interactionProtocol.handleWriteRequest(
                await createDummyMessageExchange(node),
                WRITE_REQUEST,
                interaction.BarelyMockedMessage,
            );

            expect(result).deep.equals(WRITE_RESPONSE);
            expect(node.state.basicInformation.nodeLabel).equals("test");
        });

        it("write chunked array values with Fabric Index handling", async () => {
            const fabric = await node.addFabric();
            await node.set({
                accessControl: {
                    subjectsPerAccessControlEntry: 4,
                    targetsPerAccessControlEntry: 4,
                    accessControlEntriesPerFabric: 4,
                },
            });

            const result = await interactionProtocol.handleWriteRequest(
                await createDummyMessageExchange(node, { fabric }),
                CHUNKED_ARRAY_WRITE_REQUEST,
                interaction.BarelyMockedMessage,
            );

            expect(result).deep.equals(CHUNKED_ARRAY_WRITE_RESPONSE);
            expect(node.state.accessControl.acl).deep.equals([
                {
                    privilege: 1,
                    authMode: 2,
                    subjects: null,
                    targets: null,
                    fabricIndex: FabricIndex(fabric.fabricIndex), // Set from session
                },
                {
                    privilege: 1,
                    authMode: 3,
                    subjects: null,
                    targets: null,
                    fabricIndex: FabricIndex(fabric.fabricIndex), // existing value 2, we override hard
                },
            ]);
        });

        it("rejects mass write with wildcard attribute", async () => {
            await expect(
                interactionProtocol.handleWriteRequest(
                    await createDummyMessageExchange(node),
                    ILLEGAL_MASS_WRITE_REQUEST,
                    interaction.BarelyMockedMessage,
                ),
            ).rejectedWith("Wildcard path write must specify a clusterId and attributeId");
        });

        it("performs mass write with wildcard endpoint", async () => {
            const result = await interactionProtocol.handleWriteRequest(
                await createDummyMessageExchange(node),
                MASS_WRITE_REQUEST,
                interaction.BarelyMockedMessage,
            );

            expect(result).deep.equals(MASS_WRITE_RESPONSE);
            expect(node.state.basicInformation.location).equals("US");
            expect(node.state.basicInformation.nodeLabel).equals("test");
        });

        it("write values and return errors on invalid values timed interaction mismatch request", async () => {
            let timedInteractionCleared = false;
            const messageExchange = await createDummyMessageExchange(node, undefined, false, false, undefined, () => {
                timedInteractionCleared = true;
            });
            await expect(
                interactionProtocol.handleWriteRequest(
                    messageExchange,
                    { ...WRITE_REQUEST, timedRequest: true },
                    interaction.BarelyMockedMessage,
                ),
            ).rejectedWith(
                "timedRequest flag of write interaction (true) mismatch with expected timed interaction (false).",
            );

            expect(timedInteractionCleared).equals(false);
            expect(node.state.basicInformation.nodeLabel).equals("");
        });

        it("write values and return errors on invalid values timed interaction mismatch timed expected", async () => {
            let timedInteractionCleared = false;
            const messageExchange = await createDummyMessageExchange(node, undefined, true, false, undefined, () => {
                timedInteractionCleared = true;
            });
            await expect(
                interactionProtocol.handleWriteRequest(messageExchange, WRITE_REQUEST, interaction.BarelyMockedMessage),
            ).rejectedWith(
                "timedRequest flag of write interaction (false) mismatch with expected timed interaction (true).",
            );

            expect(timedInteractionCleared).equals(false);
            expect(node.state.basicInformation.nodeLabel).equals("");
        });

        /*
        // In the past we used an especially patched BasicInformation cluster where declared an attribute as "timed"
        // Not that easy to tweak now, so lets leave that case out for now until we have a better way to test it.
        it("write values and return errors on invalid values timed interaction required by attribute", async () => {
            let timedInteractionCleared = false;
            const messageExchange = await createDummyMessageExchange(node, undefined, false, false, undefined, () => {
                timedInteractionCleared = true;
            });
            const result = await interactionProtocol.handleWriteRequest(
                messageExchange,
                WRITE_REQUEST_TIMED_REQUIRED,
                interaction.BarelyMockedMessage,
            );

            expect(result).deep.equals(WRITE_RESPONSE_TIMED_ERROR);
            expect(timedInteractionCleared).equals(false);
            expect(node.state.basicInformation.nodeLabel).equals("");
        });*/

        it("write values and return errors on invalid values timed interaction required by attribute success", async () => {
            let timedInteractionCleared = false;

            const messageExchange = await createDummyMessageExchange(node, undefined, true, false, undefined, () => {
                timedInteractionCleared = true;
            });
            const result = await interactionProtocol.handleWriteRequest(
                messageExchange,
                { ...WRITE_REQUEST_TIMED_REQUIRED, timedRequest: true },
                interaction.BarelyMockedMessage,
            );

            expect(result).deep.equals(WRITE_RESPONSE_TIMED_REQUIRED);
            expect(timedInteractionCleared).equals(true);
            expect(node.state.basicInformation.nodeLabel).equals("test");
        });

        it("write values and return errors on invalid values timed interaction expired", async () => {
            let timedInteractionCleared = false;
            const messageExchange = await createDummyMessageExchange(node, undefined, true, true, undefined, () => {
                timedInteractionCleared = true;
            });
            await expect(
                interactionProtocol.handleWriteRequest(
                    messageExchange,
                    { ...WRITE_REQUEST, timedRequest: true },
                    interaction.BarelyMockedMessage,
                ),
            ).rejectedWith("Timed request window expired. Decline write request.");

            expect(timedInteractionCleared).equals(true);
            expect(node.state.basicInformation.nodeLabel).equals("");
        });

        it("write values and return errors on invalid values timed interaction in group message", async () => {
            let timedInteractionCleared = false;
            const messageExchange = await createDummyMessageExchange(node, undefined, true, false, undefined, () => {
                timedInteractionCleared = true;
            });
            await expect(
                interactionProtocol.handleWriteRequest(
                    messageExchange,
                    { ...WRITE_REQUEST, timedRequest: true },
                    interaction.BarelyMockedGroupMessage,
                ),
            ).rejectedWith("Write requests are only allowed on unicast sessions when a timed interaction is running.");

            expect(timedInteractionCleared).equals(true);
            expect(node.state.basicInformation.nodeLabel).equals("");
        });

        it("write values and return errors on invalid values in timed interaction", async () => {
            let timedInteractionCleared = false;
            const messageExchange = await createDummyMessageExchange(node, undefined, true, false, undefined, () => {
                timedInteractionCleared = true;
            });
            const result = await interactionProtocol.handleWriteRequest(
                messageExchange,
                { ...WRITE_REQUEST, timedRequest: true },
                interaction.BarelyMockedMessage,
            );

            expect(timedInteractionCleared).equals(true);
            expect(result).deep.equals(WRITE_RESPONSE);
            expect(node.state.basicInformation.nodeLabel).equals("test");
        });
    });

    describe("handleInvokeRequest", () => {
        let onOffState = false;
        let triggeredOn = false;
        let triggeredOff = false;

        function initilizeOnOff() {
            onOffState = false;

            node.behaviors.require(EventedOnOffServer, { onOff: onOffState });
            node.eventsOf(EventedOnOffServer).onOff$Changed.on(value => {
                onOffState = value;
            });
            node.eventsOf(EventedOnOffServer).onCalled.on(() => {
                triggeredOn = true;
            });
            node.eventsOf(EventedOnOffServer).offCalled.on(() => {
                triggeredOff = true;
            });
        }

        beforeEach(async () => {
            initilizeOnOff();
        });

        it("invoke command with empty args", async () => {
            let result;
            const exchange = await createDummyMessageExchange(
                node,
                undefined,
                false,
                false,
                (_messageType, payload) => {
                    result = TlvInvokeResponse.decode(payload);
                },
            );
            await interactionProtocol.handleInvokeRequest(
                exchange,
                INVOKE_COMMAND_REQUEST_WITH_EMPTY_ARGS,
                new InteractionServerMessenger(exchange),
                interaction.BarelyMockedMessage,
            );

            expect(result).deep.equals(INVOKE_COMMAND_RESPONSE);
            expect(onOffState).equals(true);
        });

        it("invoke command with no args", async () => {
            let result;
            const exchange = await createDummyMessageExchange(
                node,
                undefined,
                false,
                false,
                (_messageType, payload) => {
                    result = TlvInvokeResponse.decode(payload);
                },
            );
            await interactionProtocol.handleInvokeRequest(
                exchange,
                INVOKE_COMMAND_REQUEST_WITH_NO_ARGS,
                new InteractionServerMessenger(exchange),
                interaction.BarelyMockedMessage,
            );

            expect(result).deep.equals(INVOKE_COMMAND_RESPONSE);
            expect(onOffState).equals(true);
        });

        it("invalid invoke command", async () => {
            let result;
            const exchange = await createDummyMessageExchange(
                node,
                undefined,
                false,
                false,
                (_messageType, payload) => {
                    result = TlvInvokeResponse.decode(payload);
                },
            );
            await interactionProtocol.handleInvokeRequest(
                exchange,
                INVOKE_COMMAND_REQUEST_INVALID,
                new InteractionServerMessenger(exchange),
                interaction.BarelyMockedMessage,
            );

            expect(result).deep.equals(INVOKE_COMMAND_RESPONSE_INVALID);
            expect(onOffState).equals(false);
        });

        it("throws on multi invoke commands with wildcards", async () => {
            const exchange = await createDummyMessageExchange(
                node,
                undefined,
                false,
                false,
                (_messageType, payload) => {
                    result = TlvInvokeResponse.decode(payload);
                },
            );
            let result = undefined;
            await expect(
                interactionProtocol.handleInvokeRequest(
                    exchange,
                    INVOKE_COMMAND_REQUEST_MULTI_WILDCARD,
                    new InteractionServerMessenger(exchange),
                    interaction.BarelyMockedMessage,
                ),
            ).rejectedWith("Wildcard path must not be used with multiple invokes");
            expect(result).equals(undefined);
        });

        it("throws on multi invoke commands with one 1 allowed", async () => {
            onOffState = false;
            triggeredOn = false;
            triggeredOff = false;

            const exchange = await createDummyMessageExchange(
                node,
                undefined,
                false,
                false,
                (_messageType, payload) => {
                    result = TlvInvokeResponse.decode(payload);
                },
            );
            let result = undefined;

            await createNode(1);
            initilizeOnOff();

            await expect(
                interactionProtocol.handleInvokeRequest(
                    exchange,
                    INVOKE_COMMAND_REQUEST_MULTI,
                    new InteractionServerMessenger(exchange),
                    interaction.BarelyMockedMessage,
                ),
            ).rejectedWith("Only 1 invoke requests are supported in one message. This message contains 4");

            //expect(result, INVOKE_COMMAND_RESPONSE_MULTI); // TODO Add again later when we support it officially
            expect(triggeredOn).equals(false);
            expect(triggeredOff).equals(false);
            expect(onOffState).equals(false);
            expect(result).equals(undefined);
        });

        it("multi invoke commands are ok", async () => {
            onOffState = false;
            triggeredOn = false;
            triggeredOff = false;

            let result = undefined;
            const exchange = await createDummyMessageExchange(
                node,
                undefined,
                false,
                false,
                (_messageType, payload) => {
                    result = TlvInvokeResponse.decode(payload);
                },
            );

            await interactionProtocol.handleInvokeRequest(
                exchange,
                INVOKE_COMMAND_REQUEST_MULTI,
                new InteractionServerMessenger(exchange),
                interaction.BarelyMockedMessage,
            );

            expect(result).deep.equals(INVOKE_COMMAND_RESPONSE_MULTI); // TODO Add again later when we support it officially
            expect(triggeredOn).equals(true);
            expect(triggeredOff).equals(true);
            expect(onOffState).equals(false);
        });

        it("multi invoke response is split into multiple messages if needed", async () => {
            onOffState = false;
            triggeredOn = false;
            triggeredOff = false;

            const result = Array<TypeFromBitmapSchema<typeof TlvInvokeResponse>>();
            const exchange = await createDummyMessageExchange(
                node,
                undefined,
                false,
                false,
                (_messageType, payload) => {
                    result.push(TlvInvokeResponse.decode(payload));
                },
            );

            await createNode(200);
            initilizeOnOff();

            const request = {
                ...INVOKE_COMMAND_REQUEST_MULTI,
            };
            request.invokeRequests = [...request.invokeRequests];
            for (let i = 1; i < 100; i++) {
                request.invokeRequests.push({
                    commandPath: {
                        endpointId: EndpointNumber(0),
                        clusterId: ClusterId(6),
                        commandId: CommandId(100 + i),
                    },
                    commandFields: TlvNoArguments.encodeTlv(undefined),
                    commandRef: i + 4,
                });
            }

            await interactionProtocol.handleInvokeRequest(
                exchange,
                request,
                new InteractionServerMessenger(exchange),
                interaction.BarelyMockedMessage,
            );

            expect(result.length).equals(3);
            expect(
                result[0].invokeResponses.length + result[1].invokeResponses.length + result[2].invokeResponses.length,
            ).equals(103);
            expect(result[0].moreChunkedMessages).equals(true);
            expect(result[1].moreChunkedMessages).equals(true);
            expect(result[2].moreChunkedMessages).equals(undefined);
            expect(triggeredOn).equals(true);
            expect(triggeredOff).equals(true);
            expect(onOffState).equals(false);
        });

        it("throws on multi invoke commands with one same commands", async () => {
            const exchange = await createDummyMessageExchange(
                node,
                undefined,
                false,
                false,
                (_messageType, payload) => {
                    result = TlvInvokeResponse.decode(payload);
                },
            );
            let result = undefined;
            await expect(
                interactionProtocol.handleInvokeRequest(
                    exchange,
                    INVOKE_COMMAND_REQUEST_MULTI_SAME,
                    new InteractionServerMessenger(exchange),
                    interaction.BarelyMockedMessage,
                ),
            ).rejectedWith("Duplicate concrete command path RootNode:0x0.OnOff:0x6.on:0x1 on batch invoke");

            expect(result).equals(undefined);
        });

        it("handles StatusResponseError gracefully", async () => {
            node.eventsOf(EventedOnOffServer).onOff$Changing.on(() => {
                throw new StatusResponseError("Sorry so swamped", StatusCode.Busy);
            });

            let result;
            const exchange = await createDummyMessageExchange(
                node,
                undefined,
                false,
                false,
                (_messageType, payload) => {
                    result = TlvInvokeResponse.decode(payload);
                },
            );
            await interactionProtocol.handleInvokeRequest(
                exchange,
                { ...INVOKE_COMMAND_REQUEST_WITH_EMPTY_ARGS },
                new InteractionServerMessenger(exchange),
                interaction.BarelyMockedMessage,
            );

            expect(result).deep.equals(INVOKE_COMMAND_RESPONSE_BUSY);
        });

        it("invoke command with timed interaction mismatch request", async () => {
            let timedInteractionCleared = false;
            const exchange = await createDummyMessageExchange(
                node,
                undefined,
                false,
                false,
                (_messageType, payload) => {
                    result = TlvInvokeResponse.decode(payload);
                },
                () => {
                    timedInteractionCleared = true;
                },
            );
            let result = undefined;
            await expect(
                interactionProtocol.handleInvokeRequest(
                    exchange,
                    { ...INVOKE_COMMAND_REQUEST_WITH_EMPTY_ARGS, timedRequest: true },
                    new InteractionServerMessenger(exchange),
                    interaction.BarelyMockedMessage,
                ),
            ).rejectedWith(
                "timedRequest flag of invoke interaction (true) mismatch with expected timed interaction (false).",
            );

            expect(timedInteractionCleared).equals(false);
            expect(onOffState).equals(false);
            expect(result).equals(undefined);
        });

        it("invoke command with timed interaction mismatch timed expected", async () => {
            let timedInteractionCleared = false;
            const exchange = await createDummyMessageExchange(
                node,
                undefined,
                true,
                false,
                (messageType, payload) => {
                    expect(messageType).equals(MessageType.StatusResponse);
                    result = TlvStatusResponse.decode(payload);
                    console.log(result);
                },
                () => {
                    timedInteractionCleared = true;
                },
            );
            let result = undefined;
            await expect(
                interactionProtocol.handleInvokeRequest(
                    exchange,
                    INVOKE_COMMAND_REQUEST_WITH_EMPTY_ARGS,
                    new InteractionServerMessenger(exchange),
                    interaction.BarelyMockedMessage,
                ),
            ).rejectedWith(
                "timedRequest flag of invoke interaction (false) mismatch with expected timed interaction (true).",
            );

            expect(timedInteractionCleared).equals(false);
            expect(onOffState).equals(false);
            expect(result).equals(undefined);
        });

        it("invoke command with timed interaction expired", async () => {
            let timedInteractionCleared = false;
            let result = undefined;
            const exchange = await createDummyMessageExchange(
                node,
                undefined,
                true,
                true,
                (_messageType, payload) => {
                    result = TlvInvokeResponse.decode(payload);
                },
                () => {
                    timedInteractionCleared = true;
                },
            );
            await expect(
                interactionProtocol.handleInvokeRequest(
                    exchange,
                    { ...INVOKE_COMMAND_REQUEST_WITH_EMPTY_ARGS, timedRequest: true },
                    new InteractionServerMessenger(exchange),
                    interaction.BarelyMockedMessage,
                ),
            ).rejectedWith("Timed request window expired. Decline invoke request.");

            expect(timedInteractionCleared).equals(true);
            expect(onOffState).equals(false);
            expect(result).equals(undefined);
        });

        it("invoke command with timed interaction as group message", async () => {
            let timedInteractionCleared = false;
            const exchange = await createDummyMessageExchange(
                node,
                undefined,
                true,
                false,
                (_messageType, payload) => {
                    result = TlvInvokeResponse.decode(payload);
                },
                () => {
                    timedInteractionCleared = true;
                },
            );
            let result = undefined;
            await expect(
                interactionProtocol.handleInvokeRequest(
                    exchange,
                    { ...INVOKE_COMMAND_REQUEST_WITH_EMPTY_ARGS, timedRequest: true },
                    new InteractionServerMessenger(exchange),
                    interaction.BarelyMockedGroupMessage,
                ),
            ).rejectedWith("Invoke requests are only allowed on unicast sessions when a timed interaction is running.");

            expect(timedInteractionCleared).equals(true);
            expect(onOffState).equals(false);
            expect(result).equals(undefined);
        });

        it("invoke command with with timed interaction success", async () => {
            let timedInteractionCleared = false;
            const exchange = await createDummyMessageExchange(
                node,
                undefined,
                true,
                false,
                (_messageType, payload) => {
                    result = TlvInvokeResponse.decode(payload);
                },
                () => {
                    timedInteractionCleared = true;
                },
            );
            let result;
            await interactionProtocol.handleInvokeRequest(
                exchange,
                { ...INVOKE_COMMAND_REQUEST_WITH_EMPTY_ARGS, timedRequest: true },
                new InteractionServerMessenger(exchange),
                interaction.BarelyMockedMessage,
            );

            expect(result).deep.equals(INVOKE_COMMAND_RESPONSE);
            expect(onOffState).equals(true);
            expect(timedInteractionCleared).equals(true);
        });

        it("invoke command with with timed interaction required by command errors when not send as timed request", async () => {
            const fabric = await node.addFabric();

            let timedInteractionCleared = false;
            const exchange = await createDummyMessageExchange(
                node,
                { fabric },
                false,
                false,
                (_messageType, payload) => {
                    result = TlvInvokeResponse.decode(payload);
                },
                () => {
                    timedInteractionCleared = true;
                },
            );
            let result;
            await interactionProtocol.handleInvokeRequest(
                exchange,
                INVOKE_COMMAND_REQUEST_TIMED_REQUIRED,
                new InteractionServerMessenger(exchange),
                interaction.BarelyMockedMessage,
            );

            expect(result).deep.equals(INVOKE_COMMAND_RESPONSE_TIMED_REQUIRED);
            expect(timedInteractionCleared).equals(false);
        });

        it("invoke command with timed interaction required by command success", async () => {
            const fabric = await node.addFabric();

            let timedInteractionCleared = false;
            let result;
            const exchange = await createDummyMessageExchange(
                node,
                { fabric },
                true,
                false,
                (_messageType, payload) => {
                    result = TlvInvokeResponse.decode(payload);
                },

                () => {
                    timedInteractionCleared = true;
                },
            );
            await interactionProtocol.handleInvokeRequest(
                exchange,
                { ...INVOKE_COMMAND_REQUEST_TIMED_REQUIRED, timedRequest: true },
                new InteractionServerMessenger(exchange),
                interaction.BarelyMockedMessage,
            );

            expect(result).deep.equals(INVOKE_COMMAND_RESPONSE_TIMED_REQUIRED_SUCCESS);
            expect(timedInteractionCleared).equals(true);
        });
    });
});
