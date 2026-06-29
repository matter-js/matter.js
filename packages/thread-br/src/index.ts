/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `@matter-server/thread-br` — Thread Border Router discovery, dataset codec, and
 * read-only network diagnostics (MeshCoP/CoAP over DTLS-EC-JPAKE, and OTBR REST).
 * See the package README for a consumer getting-started.
 */
export type { BorderRouterEntry } from "./discovery/index.js";
export { BorderRouterRegistry } from "./discovery/index.js";

export { MeshCopTlvType, MeshCopTlvTypeName, OperationalDataset, SecurityPolicy } from "./dataset/index.js";

export type { ThreadNetworkCredentials } from "./credentials/index.js";
export { ThreadCredentialsRegistry } from "./credentials/index.js";

export { NetworkDiagTlvType, NetworkDiagTlvTypeName } from "./tlv/networkDiagTlvTypes.js";

export {
    ALL_THREAD_NODES_REALM_LOCAL,
    ALL_THREAD_ROUTERS_REALM_LOCAL,
    deriveMeshLocalAddress,
    formatIp6,
} from "./util/meshLocalAddr.js";

// Diagnostics: the source abstraction, response shape, and its structured sub-types.
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
export { connectMeshcop, DefaultTlvSet, MeshCopDiagnosticSource } from "./diagnostic/index.js";

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

export type { DtlsBackend, DtlsConnectOpts, DtlsSocket } from "./dtls/socket/index.js";
export { createDtlsBackend } from "./dtls/socket/index.js";

export type { CommissionerOpts } from "./commissioner/index.js";
export { Commissioner, CommissionerRejectedError, CommissionerTimeoutError } from "./commissioner/index.js";

export { CoapTimeoutError } from "./coap/index.js";

export type {
    OtbrDatasetHex,
    OtbrLeaderData,
    OtbrNodeInfo,
    OtbrRestCapability,
    OtbrRestClientOptions,
    OtbrRestErrorCode,
    OtbrRestErrorOptions,
} from "./otbr-rest/index.js";
export { OtbrRestClient, OtbrRestDiagnosticSource, OtbrRestError, OtbrRestProbe } from "./otbr-rest/index.js";

export { decodeStateBitmap, ExtPanIdLockManager, rankBrs, selectBr, selectSource } from "./selection/index.js";
export type { DecodedStateBitmap, SelectSourceOpts } from "./selection/index.js";
