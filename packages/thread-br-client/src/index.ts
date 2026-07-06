/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `@matter/thread-br-client` — Thread Border Router discovery, dataset codec, and
 * read-only network diagnostics (MeshCoP/CoAP over DTLS-EC-JPAKE, and OTBR REST).
 * See the package README for a consumer getting-started.
 */
export { BorderRouterRegistry } from "./discovery/index.js";
export type { BorderRouterEntry } from "./discovery/index.js";

export { ThreadCredentialsRegistry } from "./credentials/index.js";
export type { ThreadNetworkCredentials } from "./credentials/index.js";

export { NetworkDiagTlvType, NetworkDiagTlvTypeName } from "./tlv/networkDiagTlvTypes.js";

export {
    ALL_THREAD_NODES_REALM_LOCAL,
    ALL_THREAD_ROUTERS_REALM_LOCAL,
    deriveMeshLocalAddress,
    formatIp6,
} from "./util/meshLocalAddr.js";

// Diagnostics: the source abstraction, response shape, and its structured sub-types.
export { DefaultTlvSet, MeshCopDiagnosticSource, ThreadDiagError, connectMeshcop } from "./diagnostic/index.js";
export type {
    ConnectMeshcopOpts,
    DiagnosticResponse,
    DiagnosticSource,
    EnergyScanEntry,
    EnergyScanOpts,
    MeshcopHandle,
    PanIdConflict,
    PanIdQueryOpts,
    QueryMulticastHandle,
    QueryMulticastOptions,
} from "./diagnostic/index.js";

// DiagnosticResponse field types, so consumers can name them without deep imports.
export type {
    ChildTableEntry,
    Connectivity,
    LeaderData,
    MacCounters,
    MleCounters,
    Mode,
    ParentPriority,
    Route64,
    Route64Entry,
} from "./tlv/diag/index.js";

export { Pskc } from "./crypto/index.js";

export { DtlsError, connectDtls } from "./dtls/channel/index.js";
export type { DtlsChannel, DtlsConnectOpts } from "./dtls/channel/index.js";

export {
    Commissioner,
    CommissionerKeepAliveError,
    CommissionerProtocolError,
    CommissionerRejectedError,
    CommissionerTimeoutError,
} from "./commissioner/index.js";
export type { CommissionerOpts } from "./commissioner/index.js";

export { CoapTimeoutError } from "./coap/index.js";

export { OtbrRestClient, OtbrRestDiagnosticSource, OtbrRestError, OtbrRestProbe } from "./otbr-rest/index.js";
export type {
    OtbrDatasetHex,
    OtbrJoiner,
    OtbrLeaderData,
    OtbrNodeInfo,
    OtbrRestCapability,
    OtbrRestClientOptions,
    OtbrRestErrorCode,
    OtbrRestErrorOptions,
} from "./otbr-rest/index.js";

export { ExtPanIdLockManager, decodeStateBitmap, rankBrs, selectBr, selectSource } from "./selection/index.js";
export type { DecodedStateBitmap, SelectSourceOpts } from "./selection/index.js";
