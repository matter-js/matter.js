/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Boot,
    Bytes,
    ClientNode,
    ControllerBehavior,
    createPromise,
    Crypto,
    Diagnostic,
    Duration,
    Endpoint,
    Environment,
    Filesystem,
    ImplementationError,
    InternalError,
    Logger,
    ChannelType,
    MatterError,
    MaybePromise,
    Millis,
    MockFilesystem,
    MockStorageService,
    Observable,
    ObserverGroup,
    Seconds,
    ServerNode,
    Time,
    Timer,
    UnexpectedDataError,
} from "@matter/main";
import { BasicInformationClient } from "@matter/main/behaviors/basic-information";
import { DescriptorClient } from "@matter/main/behaviors/descriptor";
import { OperationalCredentialsClient } from "@matter/main/behaviors/operational-credentials";
import {
    OtaSoftwareUpdateProviderClient,
    OtaSoftwareUpdateProviderServer,
} from "@matter/main/behaviors/ota-software-update-provider";
import { OtaSoftwareUpdateRequestorClient } from "@matter/main/behaviors/ota-software-update-requestor";
import { WebRtcTransportRequestorServer } from "@matter/main/behaviors/web-rtc-transport-requestor";
import {
    GeneralCommissioning,
    OperationalCredentials,
    OtaSoftwareUpdateProvider,
    OtaSoftwareUpdateRequestor,
} from "@matter/main/clusters";
import { CameraControllerDevice } from "@matter/main/devices";
import { OtaProviderEndpoint } from "@matter/main/endpoints/ota-provider";
import type { BdxInit, StorageScope } from "@matter/main/protocol";
import { FileDesignator, PeerAddress } from "@matter/main/protocol";
import {
    BdxProtocol,
    BdxSession,
    ClientRead,
    Flow,
    CommissionableDeviceIdentifiers,
    Fabric,
    FabricAuthority,
    BDX_VERSION,
    getOperationalDeviceQname,
    Invoke,
    OtaImageWriter,
    NodeSession,
    Peer as ProtocolPeer,
    PeerSet,
    Read,
    ReadResult,
    SessionClosedError,
    Subscribe,
    Write,
    WriteResult,
} from "@matter/main/protocol";
import { SessionManager } from "@matter/main/protocol";
import {
    AttributeId,
    ClusterId,
    CommandId,
    EndpointNumber,
    EventId,
    ManualPairingCodeCodec,
    GroupId,
    NodeId,
    Status,
    StatusResponseError,
    VendorId,
} from "@matter/main/types";
import { AttributeModel } from "@matter/model";
import { DclBehavior } from "@matter/node/behaviors/system/dcl";
import { SoftwareUpdateManager } from "@matter/node/behaviors/system/software-update";
import type {
    AttributePathSpec,
    AttributeReadEntry,
    AttributeWriteEntry,
    AttributeWriteStatus,
    BatchCommandResult,
    BatchCommandSpec,
    CertGroupApi,
    CertNodeApi,
    ClientAttributePath,
    ClientEndpointEntry,
    CertNodeRef,
    CommissioningTarget,
    ControllerAdapter,
    ControllerAdapterOptions,
    ControllerTransport,
    EventPathSpec,
    EventReadEntry,
    GroupKeySetSpec,
    ManualPairingCodeFields,
    OnboardingPayloadFields,
    BdxTransferAccept,
    BdxTransferProposal,
    OtaApplyUpdateExchange,
    OtaBdxTransfer,
    OtaNotifyUpdateAppliedRecord,
    AnnounceOtaProviderOptions,
    OtaAnnouncement,
    OtaAnnouncementRecord,
    OtaProviderExchanges,
    OtaProviderScript,
    OtaQueryImageExchange,
    ReadAttributeOptions,
    ReadEventOptions,
    ServeOtaUpdateOptions,
    CertSessionInfo,
    SubscribeEventOptions,
    PicsValues,
    SubscribeOptions,
    TimedInteractionOptions,
    WebRtcRequestorApi,
    WebRtcSessionRecord,
    WebRtcSessionSpec,
    WebRtcSignalRecord,
} from "@matter/testing";
import { LineQueue, LogFollower } from "@matter/testing";
import { AsyncLocalStorage } from "node:async_hooks";
import { OTA_TEST_PAYLOAD_SIZE, otaTestPayload, otaTestSoftwareVersionString } from "../OtaTestIdentity.js";
import { certClusterModelFor, findCertCluster } from "./custom-clusters.js";
import { OriginDestination, registerLogOrigin } from "./log-origins.js";
import { refusalOf, singleQrPayload } from "./onboarding-payload.js";
import { timedInteractionTimeoutOf } from "./timed-interaction.js";

/**
 * Attributes a matter.js controller `write`/`invoke` call to the {@link InProcessControllerAdapter} whose
 * operation is currently on the call stack, so the shared log destination below can route lines to the
 * right adapter's {@link LogSource} even when multiple adapters run concurrently in one process.
 */
const activeAdapterId = new AsyncLocalStorage<string>();

/** As `ChipToolControllerAdapter`'s own declarations: what this controller claims the device's PICS cannot. */
export const MATTERJS_CONTROLLER_PICS: PicsValues = {
    "MCORE.IDM.C.InvokeRequest.BatchCommands": 1,
    "MCORE.ROLE.COMMISSIONER": 1,
    "MCORE.DD.QR_COMMISSIONING": 1,
    "MCORE.DD.MANUAL_PC_COMMISSIONING": 1,

    // Takes the scanned payload itself (`MT:…`), not only the digits of a manual code.
    "MCORE.DD.SCAN_QR_CODE": 1,

    // A concatenated payload names several commissionees and is refused; the caller is told to split it.
    "MCORE.DD.CTRL_CONCATENATED_QR_CODE_1": 0,

    // Every Actions command, invoked by id. The CHIP PICS file answers 0 for these because it
    // describes a device, which is not an Actions client; here the client is the controller.
    "ACT.C.C00.Tx": 1,
    "ACT.C.C01.Tx": 1,
    "ACT.C.C02.Tx": 1,
    "ACT.C.C03.Tx": 1,
    "ACT.C.C04.Tx": 1,
    "ACT.C.C05.Tx": 1,
    "ACT.C.C06.Tx": 1,
    "ACT.C.C07.Tx": 1,
    "ACT.C.C08.Tx": 1,
    "ACT.C.C09.Tx": 1,
    "ACT.C.C0a.Tx": 1,
    "ACT.C.C0b.Tx": 1,

    // The Groups client commands this run's DUT sends, its preconditions' AddGroup included. The CHIP
    // PICS file answers 0 for these because it describes a device, which is not a Groups client; here
    // the client is the controller.
    "G.C.C00.Tx": 1,
    "G.C.C02.Tx": 1,
    "G.C.C03.Tx": 1,
    "G.C.C04.Tx": 1,
    "G.C.C05.Tx": 1,

    // Every ScenesManagement client command TC-S-3.1 sends. The CHIP PICS file answers 0 for the
    // cluster and each command because it describes a device, which is not a scenes client.
    "S.C": 1,
    "S.C.C00.Tx": 1,
    "S.C.C01.Tx": 1,
    "S.C.C02.Tx": 1,
    "S.C.C03.Tx": 1,
    "S.C.C04.Tx": 1,
    "S.C.C05.Tx": 1,
    "S.C.C06.Tx": 1,
    "S.C.C40.Tx": 1,

    // GroupKeyManagement and Groups client commands TC-SC-6.1 sends beyond what the device file already
    // answers 1 for. The file describes a device, which is neither a group-key nor a groups client.
    "G.C.C01.Tx": 1,
    "GRPKEY.C.C03.Tx": 1,
    "GRPKEY.C.C04.Tx": 1,

    // The Switch client flags TC-SWTCH-3.2 rests on. The CHIP PICS file answers 0 for `SWTCH.C` and
    // declares F00..F04 for a *device*; here the switch client is the controller, and this overlay is
    // the DUT-as-client declaration the plan's steps 0a-0h check for self-consistency.
    "SWTCH.C": 1,

    // CHIP's PICS file has no entry for the action-switch client flag, and it answers 1 for the release
    // flag, which the cluster forbids alongside an action switch (Application Clusters § 1.13.4). The
    // switch this controller observes is an action switch, so that is what it declares.
    "SWTCH.C.F02": 0,
    "SWTCH.C.F05": 1,

    // BDX roles the controller takes when it serves an OTA image (TC-BDX-1.4, TC-BDX-2.1). The CHIP
    // PICS file answers these for a *device*; here the BDX sender and responder is the controller,
    // which answers a requestor's ReceiveInit and then sends the image.
    "MCORE.BDX.Sender": 1,
    "MCORE.BDX.Responder": 1,
    "MCORE.BDX.SynchronousSender": 1,

    // Asynchronous transfer is refused outright, whichever side proposes it (`bdxSessionInitiator`).
    "MCORE.BDX.AsynchronousSender": 0,

    // matter.js honors an inbound BlockQueryWithSkip but never sends one, and this key asks about
    // sending it.
    "MCORE.BDX.BlockQueryWithSkip": 0,

    // The OTA provider role the controller takes when it serves an image (the TC-SU-3.x block). The
    // CHIP PICS file answers for a *device*; the provider here is the controller, which stages an
    // image, answers QueryImage and serves the file over BDX.
    "MCORE.OTA.Provider": 1,

    // Only BDX. `SoftwareUpdateManager` stages an image into the controller's own catalog and serves
    // it over BDX; it answers no https URI, so a case gated on this key must skip rather than run
    // against a provider that would answer DownloadProtocolNotSupported.
    "MCORE.OTA.HTTPS": 0,

    // The administrator role TC-SU-1.1 rests on: the controller holds Administer privilege on the
    // nodes it commissioned, and it is the OTA requestor *client* that sends AnnounceOTAProvider.
    // CHIP's PICS file answers both for a device, which is neither.
    "MCORE.ACL.Administrator": 1,
    "OTAR.C.M.AnnounceOTAProvider": 1,

    // The controller is not an OTA requestor, so it never tells a provider that an update was applied.
    "OTAR.C.M.NotifyUpdateApplied": 0,

    // The provider's own optional response fields. Its own answers carry a DelayedActionTime on the
    // Busy paths and a UserConsentNeeded for an update staged as needing consent; a cert case reaches
    // both through `CertNodeApi.scriptOtaProvider`, which has the provider state them without putting
    // it in a state the harness cannot arrange.
    "OTAP.S.M.DelayedActionTime": 1,
    "OTAP.S.M.UserConsentNeeded": 1,

    // Bridge-client flags. `MCORE.BRIDGECLIENT` asks whether the DUT supports a bridge, and the
    // `MCORE.DEVLIST.*` flags whether it maintains the devices behind one — their names, their state,
    // their battery level. CHIP's PICS file answers these for a *device*, so the answers there say
    // nothing about the client, and this overlay is the DUT-as-client declaration TC-BR-4 rests on.
    "MCORE.BRIDGECLIENT": 1,
    "MCORE.DEVLIST.UseDevices": 1,
    "MCORE.DEVLIST.UseDeviceName": 1,
    "MCORE.DEVLIST.UseDeviceState": 1,
    "MCORE.DEVLIST.UseBatInfo": 1,
};

const adapterStreams = new Map<string, LineQueue>();

// Boot.reboot() runs before every spec file and replaces Logger.destinations wholesale (see
// Logger.ts's own Boot.init), so a one-time install at module load would stop forwarding adapter log
// lines from the second cert-test file onward. Boot.init re-runs this on every reboot instead.
Boot.init(() => {
    Logger.destinations["cert-controller-adapter"] = OriginDestination("cert-controller-adapter", "adapter", text => {
        const id = activeAdapterId.getStore();
        if (id === undefined) {
            return;
        }
        adapterStreams.get(id)?.push(text);
    });
});

/** Whether the line being logged belongs to a controller adapter's own stream. */
export function controllerAdapterClaimsLogs() {
    const id = activeAdapterId.getStore();
    return id !== undefined && adapterStreams.has(id);
}

const logger = Logger.get("CertControllerAdapter");

function runTagged<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return activeAdapterId.run(id, fn);
}

function toIds(path: AttributePathSpec) {
    return {
        endpointId: path.endpoint !== undefined ? EndpointNumber(path.endpoint) : undefined,
        clusterId: path.cluster !== undefined ? ClusterId(path.cluster) : undefined,
        attributeId: path.attribute !== undefined ? AttributeId(path.attribute) : undefined,
    };
}

/**
 * `Invoke`/`Write` derive `timedRequest` from either flag, and a zero timeout is falsy — asking for one
 * without `timed` would send the interaction untimed, where chip-tool sends a real timed request for
 * the same call. An absent option stays absent rather than becoming a default the caller did not ask
 * for.
 */
function timedInteraction(options?: TimedInteractionOptions) {
    const timeout = timedInteractionTimeoutOf(options);
    if (timeout === undefined) {
        return {};
    }
    return { timed: true, timeout: Millis(timeout) };
}

/**
 * `commandRef` stays absent for a single-command request: Matter Core § 8.9.3 defines it only for a
 * batch, and a device without batch support does not echo it.
 */
function commandRequestFor(spec: BatchCommandSpec, commandRef?: number) {
    const { cluster, command, args, endpoint = 0 } = spec;
    const { model: clusterModel, id: clusterId } = certClusterModelFor(cluster);
    const commandModel = clusterModel.commands(command);
    if (commandModel?.id === undefined) {
        throw new ImplementationError(`Unknown command "${command}" on cluster ${cluster}`);
    }

    return Invoke.ConcreteCommandRequest({
        endpoint: EndpointNumber(endpoint),
        cluster: { id: ClusterId(clusterId), name: clusterModel.name },
        command: { id: CommandId(commandModel.id), name: commandModel.name, schema: commandModel },
        commandRef,
        // Argument-less commands require an absent payload — {} fails TLV validation ("expected void")
        fields: args !== undefined && Object.keys(args).length > 0 ? args : undefined,
    });
}

/**
 * A command path without an endpoint, which is what a group command carries: the endpoint comes from
 * the group's own membership rather than from the sender (Matter Core § 8.2.5.1), and matter.js
 * refuses a group invoke that names one.
 */
function groupCommandRequestFor(cluster: string | number, command: string, args?: object) {
    const { model: clusterModel, id: clusterId } = certClusterModelFor(cluster);
    const commandModel = clusterModel.commands(command);
    if (commandModel?.id === undefined) {
        throw new ImplementationError(`Unknown command "${command}" on cluster ${cluster}`);
    }

    return {
        cluster: { id: ClusterId(clusterId), name: clusterModel.name },
        command: { id: CommandId(commandModel.id), name: commandModel.name, schema: commandModel },
        fields: args !== undefined && Object.keys(args).length > 0 ? args : undefined,
    };
}

function isConcretePath(path: AttributePathSpec) {
    return path.endpoint !== undefined && path.cluster !== undefined && path.attribute !== undefined;
}

/**
 * Endpoint the controller puts an OTA provider on the first time a case asks it to serve an image.
 *
 * Distinct from {@link WEBRTC_REQUESTOR_ENDPOINT}, which a case enabling the WebRTC requestor
 * installs on the same controller: one number cannot carry both.
 */
const OTA_PROVIDER_ENDPOINT = 2;

/** Endpoint id for {@link OTA_PROVIDER_ENDPOINT}, which is also how a later call finds it again. */
const OTA_PROVIDER_ENDPOINT_ID = "ota-provider";

/**
 * Budget for the whole OTA exchange {@link InProcessCertNodeApi.serveOtaUpdate} drives: the
 * announcement, the node's own `QueryImage`, and the BDX transfer that follows.
 *
 * It has to outlast the peer's own BDX-layer response timeout rather than fit inside it — a peer that
 * gives up is what this should report, and reporting it needs the give-up to have happened.
 */
const OTA_TRANSFER_TIMEOUT = Seconds(90);

/**
 * How long {@link InProcessCertNodeApi.serveOtaUpdate} waits for the peer to ask to apply what it
 * downloaded, once the transfer itself is complete.
 *
 * Short, because the request follows the last block immediately: this is here so a case's teardown
 * does not land between the two, not to wait out a peer that decided against applying.
 */
const OTA_APPLY_TIMEOUT = Seconds(10);

/**
 * How long {@link InProcessCertNodeApi.announceOtaProvider} waits for the node's own `QueryImage`.
 *
 * An announcement naming `UpdateAvailable` asks the node to query at once, so this covers the node's
 * own connection back to the provider rather than any query interval of its own.
 */
const OTA_QUERY_TIMEOUT = Seconds(30);

/** An OTA image the controller offered a node was not transferred. */
export class OtaTransferError extends MatterError {}

/**
 * The controller's own OTA provider, which keeps the commands it answered.
 *
 * A provider's answer is not observable from outside it. The requestor's log states what it received,
 * and its own rendering carries neither the update token's length nor the image URI's exact text —
 * both of which the SU cases whose DUT is the provider assert on. So the provider records what it
 * answered, and the requestor's log is what corroborates that the answer reached it.
 *
 * Recording only: every answer is `super`'s, so a case reads the provider matter.js ships rather than
 * one this harness shaped for it. An answer is recorded once `super` has produced it, so a command
 * this provider rejected leaves nothing in the record.
 *
 * {@link OtaExchangeRecording} owns the record's lifetime; nothing else clears it or reads it live.
 */
class RecordingOtaProviderServer extends OtaSoftwareUpdateProviderServer {
    declare readonly internal: RecordingOtaProviderServer.Internal;

    static override Internal = class extends OtaSoftwareUpdateProviderServer.Internal {
        exchanges: OtaProviderExchanges = emptyOtaExchanges();

        /** Answers still to give in place of this provider's own, oldest first. */
        script: Required<OtaProviderScript> = { queryImage: [], applyUpdate: [] };

        /** Emits once this provider has recorded another answer, so a caller can wait for one. */
        recorded = Observable<[]>();
    };

    override async queryImage(request: OtaSoftwareUpdateProvider.QueryImageRequest) {
        const scripted = this.internal.script.queryImage.shift();

        // A scripted status is answered without asking `super` at all. Its answer is a side effect as
        // much as a value — it stages an in-progress entry and registers the peer for BDX — and a
        // status written over the top afterwards would leave the provider expecting a transfer the
        // requestor was just told not to start.
        const response: OtaSoftwareUpdateProvider.QueryImageResponse =
            scripted?.status === undefined
                ? withUserConsent(await super.queryImage(request), scripted?.userConsentNeeded)
                : {
                      status: scripted.status,
                      delayedActionTime: scripted.delayedActionTime,
                      userConsentNeeded: scripted.userConsentNeeded,
                  };

        this.internal.exchanges.queryImage.push({
            request: {
                vendorId: request.vendorId,
                productId: request.productId,
                softwareVersion: request.softwareVersion,
                protocolsSupported: [...request.protocolsSupported],
                hardwareVersion: request.hardwareVersion,
                location: request.location,
                requestorCanConsent: request.requestorCanConsent,
                metadataForProvider: hexOrUndefined(request.metadataForProvider),
            },
            response: {
                status: response.status,
                delayedActionTime: response.delayedActionTime,
                imageUri: response.imageUri,
                softwareVersion: response.softwareVersion,
                softwareVersionString: response.softwareVersionString,
                updateToken: hexOrUndefined(response.updateToken),
                userConsentNeeded: response.userConsentNeeded,
                metadataForRequestor: hexOrUndefined(response.metadataForRequestor),
            },
        });
        this.internal.recorded.emit();
        return response;
    }

    override async applyUpdateRequest(request: OtaSoftwareUpdateProvider.ApplyUpdateRequest) {
        const scripted = this.internal.script.applyUpdate.shift();

        // As in `queryImage`, and for the same reason: `super` closes the BDX registration on its way
        // to answering, which a deferred apply needs to keep so the requestor's next attempt can use
        // what it already downloaded.
        const response =
            scripted?.action === undefined
                ? await super.applyUpdateRequest(request)
                : { action: scripted.action, delayedActionTime: scripted.delayedActionTime ?? 0 };

        this.internal.exchanges.applyUpdate.push({
            request: { updateToken: Bytes.toHex(request.updateToken), newVersion: request.newVersion },
            response: { action: response.action, delayedActionTime: response.delayedActionTime },
        });
        this.internal.recorded.emit();
        return response;
    }

    override notifyUpdateApplied(request: OtaSoftwareUpdateProvider.NotifyUpdateAppliedRequest) {
        return MaybePromise.then(super.notifyUpdateApplied(request), result => {
            this.internal.exchanges.notifyUpdateApplied.push({
                updateToken: Bytes.toHex(request.updateToken),
                softwareVersion: request.softwareVersion,
            });
            this.internal.recorded.emit();
            return result;
        });
    }
}

namespace RecordingOtaProviderServer {
    export type Internal = InstanceType<(typeof RecordingOtaProviderServer)["Internal"]>;
}

/**
 * One window of a provider's answers: opened before the stimulus, read once it is over.
 *
 * The record lives on the behavior and keeps growing, so a caller that held it directly would hand a
 * case an array the requestor is still appending to — a `NotifyUpdateApplied` or a periodic
 * `QueryImage` arriving after the call would turn a step's "the provider answered one QueryImage"
 * into an intermittent failure. This owns the whole lifetime instead: opening clears the record and
 * attaches the observer in one `act`, so no answer can fall between the two, and reading it copies.
 */
class OtaExchangeRecording {
    #provider: Endpoint;
    #observers = new ObserverGroup();
    #queried: Promise<void>;
    #queryResolver: () => void;

    private constructor(provider: Endpoint, queried: Promise<void>, queryResolver: () => void) {
        this.#provider = provider;
        this.#queried = queried;
        this.#queryResolver = queryResolver;

        // The race in `awaitQueryImage` stops awaiting when the budget expires first
        queried.catch(() => {});
    }

    static async open(provider: Endpoint): Promise<OtaExchangeRecording> {
        const { promise, resolver } = createPromise<void>();
        const recording = new OtaExchangeRecording(provider, promise, resolver);

        await provider.act(agent => {
            const behavior = agent.get(RecordingOtaProviderServer);
            behavior.internal.exchanges = emptyOtaExchanges();
            recording.#observers.on(behavior.internal.recorded, () => {
                if (behavior.internal.exchanges.queryImage.length > 0) {
                    recording.#queryResolver();
                }
            });
        });

        return recording;
    }

    /** Resolves once the provider has answered a `QueryImage`, rejecting where it never does. */
    async awaitQueryImage(nodeId: NodeId, timeout: Duration) {
        const expiry = Time.sleep("cert OTA query", timeout);
        try {
            await Promise.race([
                this.#queried,
                expiry.then(() => {
                    throw new OtaTransferError(
                        `Node id ${nodeId} did not query the announced OTA provider within ${timeout}`,
                    );
                }),
            ]);
        } finally {
            expiry.cancel();
        }
    }

    /** What the provider has answered so far, copied so later answers cannot reach the caller. */
    async read(): Promise<OtaProviderExchanges> {
        const live = await this.#provider.act(agent => agent.get(RecordingOtaProviderServer).internal.exchanges);
        return {
            queryImage: [...live.queryImage],
            applyUpdate: [...live.applyUpdate],
            notifyUpdateApplied: [...live.notifyUpdateApplied],
        };
    }

    close() {
        this.#observers.close();
    }
}

/** `response` with `UserConsentNeeded` set, where a script asked for it. */
function withUserConsent(
    response: OtaSoftwareUpdateProvider.QueryImageResponse,
    userConsentNeeded: boolean | undefined,
): OtaSoftwareUpdateProvider.QueryImageResponse {
    return userConsentNeeded === undefined ? response : { ...response, userConsentNeeded };
}

function emptyOtaExchanges(): OtaProviderExchanges {
    return {
        queryImage: new Array<OtaQueryImageExchange>(),
        applyUpdate: new Array<OtaApplyUpdateExchange>(),
        notifyUpdateApplied: new Array<OtaNotifyUpdateAppliedRecord>(),
    };
}

/** A `Bytes` field as hex, keeping an absent field absent rather than rendering it as an empty string. */
function hexOrUndefined(value: Bytes | undefined) {
    return value === undefined ? undefined : Bytes.toHex(value);
}

/** What the controller holds about a node, which is what its OTA provider matches an image against. */
interface PeerOtaIdentity {
    vendorId: VendorId;
    productId: number;
    softwareVersion: number;
}

/** The `*Init` a BDX responder answered, as a plain record a step can assert against. */
function bdxProposalOf(init: BdxInit): BdxTransferProposal {
    const { transferProtocol, maxBlockSize, startOffset, maxLength, fileDesignator } = init;
    const definiteLength = maxLength === undefined ? undefined : Number(maxLength);
    return {
        version: transferProtocol.version ?? 0,
        senderDrive: !!transferProtocol.senderDrive,
        receiverDrive: !!transferProtocol.receiverDrive,
        asynchronousTransfer: !!transferProtocol.asynchronousTransfer,
        maxBlockSize,
        startOffset: startOffset === undefined ? undefined : Number(startOffset),

        // A zero length means indefinite on the wire as an absent field does (§ 11.22.5.1)
        definiteLength: definiteLength === 0 ? undefined : definiteLength,

        // FileDesignator.text, not a bare UTF-8 decode: a designator that is not a printable name
        // renders as hex rather than as replacement characters a reader would take for the real value
        fileDesignator: new FileDesignator(fileDesignator).text,
        fileDesignatorLength: Bytes.of(fileDesignator).byteLength,
    };
}

/**
 * The `*Accept` a BDX responder granted, read back from the parameters its own flow settled on.
 *
 * matter.js answers the version it supports rather than echoing the proposal, and the accept schema
 * refuses any other, so {@link BDX_VERSION} is what went on the wire.
 */
function bdxAcceptOf(parameters: Flow.NegotiatedParameters): BdxTransferAccept {
    const { transferMode, asynchronousTransfer, blockSize, dataLength } = parameters;
    return {
        version: BDX_VERSION,
        mode: transferMode === Flow.DriverMode.SenderDrive ? "senderDrive" : "receiverDrive",
        asynchronousTransfer,
        maxBlockSize: blockSize,
        definiteLength: dataLength,
    };
}

/**
 * Stages an OTA image for `identity` in the controller's own image catalog, one software version newer
 * than the node reports, and returns what was staged.
 *
 * The payload is the harness's own test payload, which `OtaRequestorTestInstance` recomputes and compares
 * byte for byte once the transfer lands — so a transfer that completes having delivered the wrong bytes
 * fails at the receiver rather than passing here.
 */
async function stageOtaImage(controller: ServerNode, identity: PeerOtaIdentity) {
    const { vendorId, productId, softwareVersion: currentSoftwareVersion } = identity;
    const softwareVersion = currentSoftwareVersion + 1;
    const softwareVersionString = otaTestSoftwareVersionString(controller.id.slice(-20));

    const { image } = await OtaImageWriter.create(controller.env.get(Crypto), {
        vendorId,
        productId,
        softwareVersion,
        softwareVersionString,
        minApplicableSoftwareVersion: 0,
        maxApplicableSoftwareVersion: currentSoftwareVersion,
        payload: otaTestPayload(OTA_TEST_PAYLOAD_SIZE),
    });

    // DclOtaUpdateService has no Environmental.create factory of its own; loading DclBehavior on the
    // root endpoint is the door SoftwareUpdateManager itself uses to reach it.
    const { otaUpdateService } = await controller.act(agent => agent.load(DclBehavior));
    await otaUpdateService.construction;

    await otaUpdateService.store(
        new ReadableStream<Uint8Array>({
            start(streamController) {
                streamController.enqueue(Bytes.of(image));
                streamController.close();
            },
        }),
        {
            vid: vendorId,
            pid: productId,
            softwareVersion,
            softwareVersionString,
            minApplicableSoftwareVersion: 0,
            maxApplicableSoftwareVersion: currentSoftwareVersion,
            cdVersionNumber: 1,
            softwareVersionValid: true,
            schemaVersion: 0,
            source: "dcl-test",
        },
        "test",
    );

    return { softwareVersion, fileSize: image.byteLength };
}

const DESCRIPTOR_ID = DescriptorClient.cluster.id;
const DEVICE_TYPE_LIST_ID = DescriptorClient.cluster.attributes.deviceTypeList.id;
const PARTS_LIST_ID = DescriptorClient.cluster.attributes.partsList.id;

/**
 * The value the controller holds for one attribute, or `undefined` where it holds none.
 *
 * Read through the behavior the endpoint actually has rather than through a concrete type or the
 * certification model: a discovered peer carries generated behaviors whose members are synthesized
 * from what the peer reports, so an attribute the model does not carry still has a value here, and a
 * cluster the peer serves may not inherit the type this repository would use for it.
 */
function heldValue(endpoint: Endpoint, cluster: ClusterId, attribute: number): unknown {
    const behavior = endpoint.behaviors.forCluster(cluster);
    if (behavior === undefined) {
        return undefined;
    }

    const name = behavior.schema?.attributes.find(member => member.id === attribute)?.propertyName;
    if (name === undefined) {
        return undefined;
    }

    const state: Record<string, unknown> | undefined = endpoint.maybeStateOf(behavior);
    return state?.[name];
}

function toEventIds(path: EventPathSpec) {
    return {
        endpointId: path.endpoint !== undefined ? EndpointNumber(path.endpoint) : undefined,
        clusterId: path.cluster !== undefined ? ClusterId(path.cluster) : undefined,
        eventId: path.event !== undefined ? EventId(path.event) : undefined,
    };
}

function isConcreteEventPath(path: EventPathSpec) {
    return path.endpoint !== undefined && path.cluster !== undefined && path.event !== undefined;
}

function toWireEvents(values: ReadResult.EventValue[]): EventReadEntry[] {
    return values.map(({ path: { endpointId, clusterId, eventId }, number, value }) => ({
        endpoint: endpointId,
        cluster: clusterId,
        event: eventId,
        eventNumber: number,
        value,
    }));
}

function eventFiltersFor(options?: ReadEventOptions) {
    return options?.minEventNumber === undefined ? undefined : [{ eventMin: options.minEventNumber }];
}

/**
 * A concrete path the device answered with a status is a failed read of that path, the same way
 * {@link CertNodeApi.readAttribute}'s is: the step asked for that attribute and got none, so reporting
 * the read as successful would have it read as "the device has no value for it".
 *
 * A wildcard path's statuses are per-item results of the expansion instead (UNSUPPORTED_ATTRIBUTE for
 * a path the expansion reached but that does not apply there), so those are dropped.
 */
function assertNoConcreteAttributeStatus(
    paths: AttributePathSpec[],
    statuses: ReadResult.AttributeStatus[],
    operation: string,
) {
    for (const status of statuses) {
        const { endpointId, clusterId, attributeId } = status.path;
        const requested = paths.some(
            path =>
                isConcretePath(path) &&
                path.endpoint === endpointId &&
                path.cluster === clusterId &&
                path.attribute === attributeId,
        );
        if (requested) {
            throw new StatusResponseError(
                `${operation} ${JSON.stringify({ endpoint: endpointId, cluster: clusterId, attribute: attributeId })} failed`,
                status.status,
                status.clusterStatus,
            );
        }
    }
}

/**
 * A status for a path the step named concretely means it will never see that event; per-path statuses
 * of a wildcard expansion are results of the expansion instead (see {@link CertNodeApi.readEvents}).
 *
 * A subscribe whose every path the device refuses is rejected by the interaction itself, but one that
 * also carries a path the device serves is established, and only the priming report's status says the
 * other path went unanswered.
 */
function assertNoConcreteEventStatus(paths: EventPathSpec[], statuses: ReadResult.EventStatus[], operation: string) {
    for (const status of statuses) {
        const { endpointId, clusterId, eventId } = status.path;
        const requested = paths.some(
            path =>
                isConcreteEventPath(path) &&
                path.endpoint === endpointId &&
                path.cluster === clusterId &&
                path.event === eventId,
        );
        if (requested) {
            throw new StatusResponseError(
                `${operation} ${JSON.stringify({ endpoint: endpointId, cluster: clusterId, event: eventId })} failed`,
                status.status,
                status.clusterStatus,
            );
        }
    }
}

function toWireValues(values: ReadResult.AttributeValue[]) {
    return values.map(({ path: { endpointId, clusterId, attributeId }, value, version }) => ({
        endpoint: endpointId,
        cluster: clusterId,
        attribute: attributeId,
        value,
        version,
    }));
}

function attributeSpecFor(cluster: number, attribute: number, value: unknown) {
    const clusterModel = findCertCluster(cluster);
    const attributeModel = clusterModel?.attributes(attribute) ?? inferAttributeModel(attribute, value);
    return {
        cluster: { id: ClusterId(cluster), name: clusterModel?.name ?? `cluster_${cluster}` },
        attributes: { id: AttributeId(attribute), name: attributeModel.name, schema: attributeModel },
    };
}

/**
 * Best-effort attribute schema for a write when the model has no definition for the attribute (e.g. an
 * intentionally out-of-model attribute a TC writes to test error handling).
 */
function inferAttributeModel(id: number, value: unknown): AttributeModel {
    let type: string;
    if (typeof value === "bigint") type = "uint64";
    else if (typeof value === "string") type = "string";
    else if (typeof value === "boolean") type = "bool";
    else if (typeof value === "number" || value === null) type = "int32";
    else throw new ImplementationError(`Cannot infer a TLV type for attribute ${id} from a ${typeof value} value`);
    return new AttributeModel({
        id,
        name: `attr_${id}`,
        type,
        quality: value === null ? "X" : undefined,
        access: "RW",
    });
}

interface ResolvedCommissioningTarget {
    identifierData: CommissionableDeviceIdentifiers;
    passcode: number;

    /** What the payload names, so a device advertising another identity is passed over. */
    vendorId?: VendorId;
    productId?: number;
}

/**
 * A `manualPairingCode` (from an enhanced commissioning window) only carries a short discriminator
 * (§ 5.1.4.1's 4-bit form) and the window's freshly-generated passcode — never the device's original
 * setup passcode/discriminator, which `openEnhancedCommissioningWindow` deliberately replaces per
 * window. `target.passcode`/`target.discriminator` are for the device's original setup code instead.
 *
 * A `qrPairingCode` carries the full 12-bit discriminator, so it discovers by the long form. Its
 * remaining fields (vendor and product id, commissioning flow, discovery capabilities) describe the
 * commissionee rather than how to reach it; a step asserting on them decodes the payload itself.
 */
function resolveCommissioningTarget(target: CommissioningTarget): ResolvedCommissioningTarget {
    if (target.qrPairingCode) {
        const { discriminator, passcode, vendorId, productId } = singleQrPayload(target.qrPairingCode);
        return {
            identifierData: { longDiscriminator: discriminator },
            passcode,
            vendorId: vendorId === undefined ? undefined : VendorId(vendorId, false),
            productId,
        };
    }
    if (target.manualPairingCode !== undefined) {
        const code = target.manualPairingCode;
        const { shortDiscriminator, passcode, vendorId, productId } = refusalOf(
            () => ManualPairingCodeCodec.decode(code),
            `manual pairing code ${code}`,
        );
        if (shortDiscriminator === undefined) {
            throw new ImplementationError("Manual pairing code did not decode to a short discriminator");
        }
        return { identifierData: { shortDiscriminator }, passcode, vendorId, productId };
    }
    if (target.passcode === undefined || target.discriminator === undefined) {
        throw new ImplementationError(
            "commission() requires a target.qrPairingCode, a target.manualPairingCode, or both target.passcode " +
                "and target.discriminator",
        );
    }
    return { identifierData: { longDiscriminator: target.discriminator }, passcode: target.passcode };
}

/**
 * The adapter's controller holds no {@link ClientNode} for the ref a step handed in. Besides a step
 * naming a node it never commissioned, this is what every node operation reports once the device
 * removed the controller's fabric: the controller reacts to the device's Leave event by deleting the
 * peer ("Peer ... has left the fabric"), so the refusal is derived from the device's own notice.
 */
export class NoCommissionedPeerError extends MatterError {}

/**
 * Thrown when a session operation names a session the controller does not hold, or one whose
 * transport has nothing to sever.
 *
 * A state error rather than a refusal: a step that reached it has already established something
 * untrue about the session it captured, so it must fail rather than be recorded as skipped.
 */
export class SessionStateError extends MatterError {}

/**
 * A session's {@link MessageChannel}, or undefined for one that can no longer describe itself.
 *
 * `Session.channel` throws once the channel is detached, and `Peer.sessions` holds such a session
 * until it is removed, so every reader has to tolerate it — reporting a session half-known would be
 * worse than omitting it.
 */
function channelOf(session: NodeSession) {
    try {
        return session.channel;
    } catch (error) {
        SessionClosedError.accept(error);
        return undefined;
    }
}

/** {@link ChannelType} as {@link CertSessionInfo} names it; a new transport fails to compile here. */
function transportNameOf(type: ChannelType): CertSessionInfo["transport"] {
    switch (type) {
        case ChannelType.TCP:
            return "tcp";
        case ChannelType.UDP:
            return "udp";
        case ChannelType.BLE:
            return "ble";
    }
}

class InProcessCertNodeApi implements CertNodeApi {
    readonly #adapterId: string;
    readonly #controller: ServerNode;
    readonly #fabric: Fabric;
    readonly #nodeId: NodeId;

    constructor(adapterId: string, controller: ServerNode, fabric: Fabric, ref: CertNodeRef) {
        this.#adapterId = adapterId;
        this.#controller = controller;
        this.#fabric = fabric;
        this.#nodeId = NodeId(ref);
    }

    get #peer(): ClientNode {
        const peer = this.#controller.peers.get(this.#fabric.addressOf(this.#nodeId));
        if (peer === undefined) {
            throw new NoCommissionedPeerError(
                `Controller "${this.#adapterId}" has no commissioned peer with node id ${this.#nodeId}`,
            );
        }
        return peer;
    }

    /** The protocol-level peer behind {@link #peer}, which carries the negotiated session parameters. */
    get #protocolPeer(): ProtocolPeer | undefined {
        return this.#controller.env.get(PeerSet).get(this.#fabric.addressOf(this.#nodeId));
    }

    invoke(
        cluster: string | number,
        command: string,
        args?: object,
        endpoint = 0,
        options?: TimedInteractionOptions,
    ): Promise<unknown> {
        return runTagged(this.#adapterId, async () => {
            const request = Invoke({
                ...timedInteraction(options),
                commands: [commandRequestFor({ cluster, command, args, endpoint })],
            });
            for await (const chunk of this.#peer.interaction.invoke(request)) {
                for (const entry of chunk) {
                    switch (entry.kind) {
                        case "cmd-status":
                            if (entry.status !== Status.Success) {
                                throw StatusResponseError.create(entry.status, undefined, entry.clusterStatus);
                            }
                            return undefined;

                        case "cmd-response":
                            return entry.data;
                    }
                }
            }
            return undefined;
        });
    }

    invokeBatch(commands: BatchCommandSpec[], options?: TimedInteractionOptions): Promise<BatchCommandResult[]> {
        return runTagged(this.#adapterId, async () => {
            if (commands.length === 0) {
                throw new ImplementationError("invokeBatch requires at least one command");
            }

            // `ClientInteraction.invoke` splits a request the peer cannot take in one message into
            // several single-command exchanges, which is right for an ordinary caller and wrong here:
            // the whole point of this call is the one request, and a step proving how a device answers
            // a batch would silently prove nothing. This reads the same value the interaction's own
            // exchange provider does.
            const advertised = this.#protocolPeer?.sessionParameters.maxPathsPerInvoke;
            if (commands.length > (advertised ?? 1)) {
                throw new ImplementationError(
                    `invokeBatch of ${commands.length} commands, but ` +
                        (advertised === undefined
                            ? `node ${this.#nodeId} has no protocol peer yet, so its limit is unknown and taken as 1`
                            : `node ${this.#nodeId} accepts ${advertised} path(s) per invoke`) +
                        "; the request would be split into separate interactions",
                );
            }

            // Refs number from 1, matching matter.js's own allocator, so the device's echoed ref maps
            // back to a request position without further bookkeeping.
            const request = Invoke({
                ...timedInteraction(options),
                commands: commands.map((command, index) => commandRequestFor(command, index + 1)),
            });

            const results = new Array<BatchCommandResult>();
            for await (const chunk of this.#peer.interaction.invoke(request)) {
                for (const entry of chunk) {
                    const index = entry.commandRef === undefined ? undefined : entry.commandRef - 1;
                    if (index === undefined || index < 0 || index >= commands.length) {
                        throw new UnexpectedDataError(
                            `Invoke response carries commandRef ${entry.commandRef}, which belongs to no command of ` +
                                `this ${commands.length}-command request; ${results.length} result(s) had arrived ` +
                                `first: ${Diagnostic.json(results)}`,
                        );
                    }

                    if (entry.kind === "cmd-status") {
                        results.push({ index, status: entry.status, clusterStatus: entry.clusterStatus });
                    } else {
                        results.push({ index, data: entry.data });
                    }
                }
            }

            return results;
        });
    }

    readAttribute(path: AttributePathSpec, options?: ReadAttributeOptions): Promise<unknown> {
        return runTagged(this.#adapterId, async () => {
            const { endpointId, clusterId, attributeId } = toIds(path);
            const values = new Array<ReadResult.AttributeValue>();
            const statuses = new Array<ReadResult.AttributeStatus>();
            // A cert step asserts on what the device actually reports, so the read must never be answered
            // with "unchanged" against versions the node's own subscription cached.
            const request: ClientRead = {
                ...Read({
                    attributes: [{ endpointId, clusterId, attributeId }],
                    fabricFilter: options?.fabricFiltered,
                }),
                includeKnownVersions: true,
                largeMessage: options?.largeMessage,
            };
            for await (const chunk of this.#peer.interaction.read(request)) {
                for await (const report of chunk) {
                    if (report.kind === "attr-value") {
                        values.push(report);
                    } else if (report.kind === "attr-status") {
                        statuses.push(report);
                    }
                }
            }
            if (isConcretePath(path)) {
                if (statuses.length) {
                    throw new StatusResponseError(`readAttribute ${JSON.stringify(path)} failed`, statuses[0].status);
                }
                if (values.length === 0) {
                    throw new InternalError(`readAttribute ${JSON.stringify(path)} returned no data`);
                }
                return values[0].value;
            }
            // A wildcard expansion legitimately mixes data with per-item statuses (e.g.
            // UNSUPPORTED_ATTRIBUTE for a path the expansion reached but that doesn't apply there) —
            // unlike a concrete path's status, that's not itself a read failure.
            return toWireValues(values);
        });
    }

    readAttributes(paths: AttributePathSpec[], options?: ReadAttributeOptions): Promise<AttributeReadEntry[]> {
        return runTagged(this.#adapterId, async () => {
            if (paths.length === 0) {
                throw new ImplementationError("readAttributes requires at least one path");
            }
            const values = new Array<ReadResult.AttributeValue>();
            const statuses = new Array<ReadResult.AttributeStatus>();
            const request: ClientRead = {
                ...Read({ attributes: paths.map(toIds), fabricFilter: options?.fabricFiltered }),
                includeKnownVersions: true,
                largeMessage: options?.largeMessage,
            };
            for await (const chunk of this.#peer.interaction.read(request)) {
                for await (const report of chunk) {
                    if (report.kind === "attr-value") {
                        values.push(report);
                    } else if (report.kind === "attr-status") {
                        statuses.push(report);
                    }
                }
            }
            assertNoConcreteAttributeStatus(paths, statuses, "readAttributes");
            return toWireValues(values);
        });
    }

    writeAttribute(path: AttributePathSpec, value: unknown, options?: TimedInteractionOptions): Promise<void> {
        return runTagged(this.#adapterId, async () => {
            const { endpoint, cluster, attribute } = path;
            if (endpoint === undefined || cluster === undefined || attribute === undefined) {
                throw new ImplementationError("writeAttribute requires a concrete endpoint/cluster/attribute path");
            }
            const result = await this.#peer.interaction.write(
                Write(
                    timedInteraction(options),
                    Write.Attribute({
                        endpoint: EndpointNumber(endpoint),
                        ...attributeSpecFor(cluster, attribute, value),
                        value,
                    }),
                ),
            );
            WriteResult.assertSuccess(result);
        });
    }

    writeAttributes(entries: AttributeWriteEntry[]): Promise<AttributeWriteStatus[]> {
        return runTagged(this.#adapterId, async () => {
            if (entries.length === 0) {
                throw new ImplementationError("writeAttributes requires at least one attribute");
            }
            const attributes = entries.map(({ path: { endpoint, cluster, attribute }, value, dataVersion }) => {
                if (cluster === undefined || attribute === undefined) {
                    throw new ImplementationError("writeAttributes requires a concrete cluster and attribute");
                }
                const spec = attributeSpecFor(cluster, attribute, value);
                if (endpoint === undefined) {
                    return Write.Attribute({ ...spec, value, version: dataVersion });
                }
                return Write.Attribute({
                    endpoint: EndpointNumber(endpoint),
                    ...spec,
                    value,
                    version: dataVersion,
                });
            });
            const result = await this.#peer.interaction.write(Write(...attributes));
            return result.map(({ path: { endpointId, clusterId, attributeId }, status }) => ({
                endpoint: endpointId,
                cluster: clusterId,
                attribute: attributeId,
                status,
            }));
        });
    }

    subscribe(path: AttributePathSpec, opts: SubscribeOptions): Promise<unknown> {
        return runTagged(this.#adapterId, async () => {
            const { endpointId, clusterId, attributeId } = toIds(path);
            const seed = new Array<ReadResult.AttributeValue>();
            let seeding = true;
            const request = Subscribe({
                attributes: [{ endpointId, clusterId, attributeId }],
                keepSubscriptions: true,
                minIntervalFloor: Seconds(opts.minIntervalFloorSeconds),
                maxIntervalCeiling: Seconds(opts.maxIntervalCeilingSeconds),
            });
            request.updated = async data => {
                for await (const chunk of data) {
                    for await (const report of chunk) {
                        if (report.kind !== "attr-value") {
                            continue;
                        }
                        if (seeding) {
                            seed.push(report);
                        } else {
                            opts.onUpdate?.(report.value);
                        }
                    }
                }
            };
            await this.#peer.interaction.subscribe(request);
            seeding = false;
            if (isConcretePath(path)) {
                return seed[0]?.value;
            }
            return toWireValues(seed);
        });
    }

    clientEndpoints(): Promise<ClientEndpointEntry[]> {
        return runTagged(this.#adapterId, async () => {
            const entries = new Array<ClientEndpointEntry>();
            this.#peer.visit(endpoint => {
                if (endpoint.number === undefined) {
                    return;
                }
                const deviceTypeList = heldValue(endpoint, DESCRIPTOR_ID, DEVICE_TYPE_LIST_ID);
                const partsList = heldValue(endpoint, DESCRIPTOR_ID, PARTS_LIST_ID);
                entries.push({
                    endpoint: endpoint.number,
                    deviceTypes: (Array.isArray(deviceTypeList) ? deviceTypeList : []).map(entry =>
                        Number(entry === null || typeof entry !== "object" ? NaN : Reflect.get(entry, "deviceType")),
                    ),
                    parts: (Array.isArray(partsList) ? partsList : []).map(Number),
                });
            });
            return entries.sort((a, b) => a.endpoint - b.endpoint);
        });
    }

    clientAttribute(path: ClientAttributePath): Promise<unknown> {
        return runTagged(this.#adapterId, async () => {
            let endpoint: Endpoint | undefined;
            this.#peer.visit(candidate => {
                if (candidate.number === path.endpoint) {
                    endpoint = candidate;
                }
            });
            if (endpoint === undefined) {
                return undefined;
            }

            return heldValue(endpoint, ClusterId(path.cluster), path.attribute);
        });
    }

    sessions(): Promise<CertSessionInfo[]> {
        return runTagged(this.#adapterId, async () => {
            const entries = new Array<CertSessionInfo>();
            for (const session of this.#usableSessions) {
                const channel = channelOf(session);
                if (channel === undefined) {
                    continue;
                }
                entries.push({
                    id: session.id,
                    transport: transportNameOf(channel.type),
                    largePayload: session.supportsLargeMessages,
                    maxPayloadSize: channel.maxPayloadSize,
                });
            }
            return entries;
        });
    }

    /**
     * The peer's sessions the controller would actually use, which is a narrower set than the peer
     * holds.
     *
     * `Peer.sessions` keeps a session until its `closing` fires, so it still contains one the
     * controller has already written off — `handlePeerClose` sets `isPeerLost` and then awaits an
     * emit before closing. Every other consumer in the protocol layer applies this same predicate
     * (`Peer.newestSession`, `Peer.hasSession`, `SessionManager`), and a cert step reads these as
     * sessions the controller *holds*, so reporting one it will not use would answer a different
     * question than the step asks.
     */
    get #usableSessions() {
        const peer = this.#protocolPeer;
        if (peer === undefined) {
            throw new NoCommissionedPeerError(
                `Controller "${this.#adapterId}" has no peer with node id ${this.#nodeId}, so it holds no sessions`,
            );
        }
        return [...peer.sessions].filter(session => !session.isClosing && !session.isPeerLost);
    }

    severTransportConnection(sessionId: number): Promise<void> {
        return runTagged(this.#adapterId, async () => {
            const session = this.#usableSessions.find(candidate => candidate.id === sessionId);
            if (session === undefined) {
                throw new SessionStateError(
                    `Controller "${this.#adapterId}" holds no session ${sessionId} with node id ${this.#nodeId}`,
                );
            }

            const channel = channelOf(session);
            if (channel === undefined) {
                throw new SessionStateError(
                    `Session ${sessionId} with node id ${this.#nodeId} has no channel to sever`,
                );
            }

            const { transportChannel } = channel;
            if (transportChannel.type !== ChannelType.TCP) {
                throw new SessionStateError(
                    `Session ${sessionId} with node id ${this.#nodeId} runs over ` +
                        `${transportNameOf(transportChannel.type)}, which holds no connection to sever`,
                );
            }

            // The stimulus must not tell the peer anything: the peer forgetting the session is the
            // outcome a case asserts, so it cannot also be what this does
            await transportChannel.close();
        });
    }

    scriptOtaProvider(script: OtaProviderScript): Promise<void> {
        return runTagged(this.#adapterId, async () => {
            const provider = await this.#otaProvider();
            await provider.act(agent => {
                agent.get(RecordingOtaProviderServer).internal.script = {
                    queryImage: [...(script.queryImage ?? [])],
                    applyUpdate: [...(script.applyUpdate ?? [])],
                };
            });
        });
    }

    announceOtaProvider(options?: AnnounceOtaProviderOptions): Promise<OtaAnnouncement> {
        return runTagged(this.#adapterId, async () => {
            const announced = options?.provider;

            const announcement: OtaAnnouncementRecord =
                announced === undefined
                    ? {
                          providerNodeId: this.#fabric.rootNodeId.toString(),
                          vendorId: this.#controllerVendorId,
                          announcementReason: this.#announcementReason(options),
                          endpoint: OTA_PROVIDER_ENDPOINT,
                      }
                    : {
                          providerNodeId: announced,
                          vendorId: this.#controllerVendorId,
                          announcementReason: this.#announcementReason(options),
                          endpoint: this.#otaProviderEndpointOn(NodeId(BigInt(announced))),
                      };

            // Only where the controller is the provider: a node told about another node queries that
            // node, and nothing of that exchange passes through here.
            const recording =
                announced === undefined ? await OtaExchangeRecording.open(await this.#otaProvider()) : undefined;

            try {
                await this.invoke(
                    OtaSoftwareUpdateRequestor.Cluster.id,
                    "announceOtaProvider",
                    {
                        providerNodeId: NodeId(BigInt(announcement.providerNodeId)),
                        vendorId: VendorId(announcement.vendorId),
                        announcementReason: announcement.announcementReason,
                        endpoint: EndpointNumber(announcement.endpoint),
                    },
                    this.#otaRequestorEndpointOnPeer,
                );

                if (recording !== undefined && options?.expectQuery !== false) {
                    await recording.awaitQueryImage(
                        this.#nodeId,
                        options?.timeoutMs === undefined ? OTA_QUERY_TIMEOUT : Millis(options.timeoutMs),
                    );
                }

                return { announcement, exchanges: (await recording?.read()) ?? emptyOtaExchanges() };
            } finally {
                recording?.close();
            }
        });
    }

    /** The reason an announcement carries, defaulting to the one that asks the node to query now. */
    #announcementReason(options?: AnnounceOtaProviderOptions) {
        return options?.announcementReason ?? OtaSoftwareUpdateRequestor.AnnouncementReason.UpdateAvailable;
    }

    /**
     * The endpoint another commissioned node carries its OTA provider cluster on.
     *
     * Read from what the controller holds for that node rather than assumed, as
     * {@link #otaRequestorEndpointOnPeer} is: an announcement naming the wrong endpoint sends the
     * requestor to a cluster that is not there.
     */
    #otaProviderEndpointOn(nodeId: NodeId): number {
        const peer = this.#controller.peers.get(this.#fabric.addressOf(nodeId));
        if (peer === undefined) {
            throw new OtaTransferError(`Controller "${this.#adapterId}" holds no node id ${nodeId} to announce`);
        }
        for (const endpoint of peer.endpoints) {
            if (endpoint.number !== undefined && endpoint.behaviors.has(OtaSoftwareUpdateProviderClient)) {
                return endpoint.number;
            }
        }
        throw new OtaTransferError(
            `Node id ${nodeId} exposes no OTA provider cluster, so it cannot be announced as a provider`,
        );
    }

    /**
     * The peer's own endpoint carrying the OTA requestor cluster.
     *
     * Read from the endpoints the controller holds rather than assumed: matter.js's requestor subject
     * puts the cluster on endpoint 1 and chip's `ota-requestor-app` on the root, and an announcement
     * to the wrong endpoint is answered `UnsupportedEndpoint` rather than ignored.
     */
    get #otaRequestorEndpointOnPeer(): number {
        for (const endpoint of this.#peer.endpoints) {
            if (endpoint.number !== undefined && endpoint.behaviors.has(OtaSoftwareUpdateRequestorClient)) {
                return endpoint.number;
            }
        }
        throw new OtaTransferError(
            `Node id ${this.#nodeId} exposes no OTA requestor cluster, so it cannot be announced to`,
        );
    }

    /** Vendor id the controller announces as, which is its own `BasicInformation` value. */
    get #controllerVendorId(): VendorId {
        return this.#controller.state.basicInformation.vendorId;
    }

    serveOtaUpdate(options?: ServeOtaUpdateOptions): Promise<OtaBdxTransfer> {
        return runTagged(this.#adapterId, async () => {
            const peerAddress = this.#fabric.addressOf(this.#nodeId);
            const identity = this.#otaIdentity;
            const provider = await this.#otaProvider();
            const { softwareVersion, fileSize } = await stageOtaImage(this.#controller, identity);

            // Opened before the announcement rather than filtered afterwards: a case serving two
            // updates has to be able to say which exchanges belong to the second.
            const recording = await OtaExchangeRecording.open(provider);

            // Armed before the transfer starts, not after it ends: the peer asks to apply as soon as the
            // last block lands, and an observer attached afterwards can miss its own event.
            const applied =
                options?.expectApply === false
                    ? undefined
                    : await this.#applyAllowed(
                          provider,
                          peerAddress,
                          options?.applyTimeoutMs === undefined ? OTA_APPLY_TIMEOUT : Millis(options.applyTimeoutMs),
                      );

            try {
                return await this.#serveStagedImage(
                    provider,
                    peerAddress,
                    identity,
                    softwareVersion,
                    fileSize,
                    applied,
                    recording,
                    options,
                );
            } finally {
                // The transfer rejecting is the path that leaves these attached: a node that never opened
                // one never reaches the settled() that would otherwise close them.
                applied?.close();
                recording.close();
            }
        });
    }

    async #serveStagedImage(
        provider: Endpoint,
        peerAddress: PeerAddress,
        identity: PeerOtaIdentity,
        softwareVersion: number,
        fileSize: number,
        applied: { settled: () => Promise<boolean>; close: () => void } | undefined,
        recording: OtaExchangeRecording,
        options?: ServeOtaUpdateOptions,
    ): Promise<OtaBdxTransfer> {
        const session = await this.#runOtaTransfer(
            peerAddress,
            await provider.act(agent => agent.get(RecordingOtaProviderServer).updateStorage.scope),
            async () =>
                provider.act(agent =>
                    agent.get(SoftwareUpdateManager).forceUpdate(peerAddress, {
                        vendorId: identity.vendorId,
                        productId: identity.productId,
                        targetSoftwareVersion: softwareVersion,
                    }),
                ),
            async () =>
                provider.act(agent => agent.get(SoftwareUpdateManager).removeConsent(peerAddress, softwareVersion)),
            options?.timeoutMs === undefined ? OTA_TRANSFER_TIMEOUT : Millis(options.timeoutMs),
        );

        // A BDX transfer is not the end of the exchange: the peer answers a completed download with
        // ApplyUpdateRequest, and a provider that goes away before answering leaves the peer waiting
        // out its own unreachable-peer budget. The caller tears this controller down when the case
        // ends, so the exchange has to be over before this resolves.
        const applyAcknowledged = applied === undefined ? false : await applied.settled();

        // After the apply wait, so a provider that answered an ApplyUpdateRequest while this was
        // waiting reports that answer rather than the state before it.
        const exchanges = await recording.read();

        const initMessage = session.initMessage;
        const parameters = session.transferParameters;
        if (initMessage === undefined || parameters === undefined) {
            throw new InternalError(
                `BDX session with node id ${this.#nodeId} completed without recording what it negotiated`,
            );
        }

        return {
            providerEndpoint: OTA_PROVIDER_ENDPOINT,
            providerNodeId: this.#fabric.rootNodeId.toString(),
            softwareVersion,
            fileSize,
            proposal: bdxProposalOf(initMessage),
            accept: bdxAcceptOf(parameters),
            transferredBytes: session.transferredBytes,
            applyAcknowledged,
            exchanges,
        };
    }

    /**
     * Vendor, product and software version the controller holds for this node.
     *
     * Read from the controller's own client state rather than from the wire, because this is the same
     * state the provider's own applicability check reads (`SoftwareUpdateManager` validates a
     * `QueryImage`'s claimed identity against it) — an image staged from a fresh read could be
     * applicable to what the node says and inapplicable to what the controller believes, which
     * answers `NotAvailable` with nothing to point at.
     */
    get #otaIdentity(): PeerOtaIdentity {
        const peer = this.#peer;
        const basicInformation = peer.maybeStateOf(BasicInformationClient);
        const vendorId = basicInformation?.vendorId;
        const productId = basicInformation?.productId;
        const softwareVersion = basicInformation?.softwareVersion;
        if (vendorId === undefined || productId === undefined || softwareVersion === undefined) {
            throw new OtaTransferError(
                `Controller "${this.#adapterId}" holds no vendor/product/software version for node id ` +
                    `${this.#nodeId}, so it cannot stage an image that node's provider check would accept`,
            );
        }
        return { vendorId, productId, softwareVersion };
    }

    /**
     * The controller's own OTA provider endpoint, added on first use.
     *
     * Every other cert test's controller is a plain commissioner, and an OTA provider that is always
     * present would put a cluster, an ACL entry and a `SoftwareUpdateManager` into every run's
     * evidence for the sake of two cases.
     */
    async #otaProvider(): Promise<Endpoint> {
        const existing = this.#controller.parts.get(OTA_PROVIDER_ENDPOINT_ID);
        if (existing !== undefined) {
            return existing;
        }

        const provider = new Endpoint(OtaProviderEndpoint.with(RecordingOtaProviderServer), {
            id: OTA_PROVIDER_ENDPOINT_ID,
            number: OTA_PROVIDER_ENDPOINT,
        });
        await this.#controller.add(provider);

        // A staged image is a test image: it carries no DCL signature, which is what a provider
        // otherwise requires before it will offer one.
        await provider.act(agent => {
            agent.get(SoftwareUpdateManager).state.allowTestOtaImages = true;
        });

        return provider;
    }

    /**
     * Watches for this provider allowing `peerAddress` to apply what it downloaded, which is the last
     * thing the peer needs from it.
     *
     * Resolves rather than rejecting when the peer never asks: the image was still served, which is
     * what the BDX cases are about, and `applyAcknowledged` reports what happened instead.
     */
    async #applyAllowed(provider: Endpoint, peerAddress: PeerAddress, timeout: Duration) {
        const observers = new ObserverGroup();
        const { promise, resolver } = createPromise<boolean>();

        await provider.act(agent => {
            const events = agent.get(SoftwareUpdateManager).events;
            observers.on(events.updateApplying, peer => {
                if (PeerAddress.is(peer, peerAddress)) {
                    resolver(true);
                }
            });
            observers.on(events.updateFailed, peer => {
                if (PeerAddress.is(peer, peerAddress)) {
                    resolver(false);
                }
            });
        });

        // Arming and awaiting are two calls: the observers attach before the transfer and settle after
        // it, and a single awaited promise would collapse both into one wait on the wrong side of it.
        return {
            settled: async () => {
                const expiry = Time.sleep("cert OTA apply", timeout);
                try {
                    return await Promise.race([promise, expiry.then(() => false)]);
                } finally {
                    expiry.cancel();
                }
            },

            close: () => observers.close(),
        };
    }

    /**
     * Runs `trigger` and resolves with the BDX session the node opened back to this controller for it.
     *
     * The session is what carries the evidence, so nothing here settles on the trigger alone: a node
     * that never queried, one the provider answered `NotAvailable`, and one whose transfer stalled all
     * reach the budget and reject.
     */
    async #runOtaTransfer(
        peerAddress: PeerAddress,
        scope: StorageScope,
        trigger: () => Promise<unknown>,
        abandon: () => Promise<unknown>,
        timeout: Duration,
    ): Promise<BdxSession> {
        const observers = new ObserverGroup();
        const { promise, resolver, rejecter } = createPromise<BdxSession>();

        // The race below stops awaiting `promise` when the budget expires first, and a session closing
        // after that would then reject it with nobody listening
        promise.catch(() => {});

        let transfer: BdxSession | undefined;
        observers.on(this.#controller.env.get(BdxProtocol).sessionStarted, (session, sessionScope) => {
            const { fabricIndex, nodeId } = session.peerAddress;

            // Scope as well as peer: this controller may hold another BDX transfer with the same node —
            // a diagnostic-log retrieval is one — and reporting its bytes as the OTA transfer's would
            // be evidence for a different exchange entirely.
            if (
                transfer !== undefined ||
                sessionScope !== scope ||
                fabricIndex !== peerAddress.fabricIndex ||
                nodeId !== peerAddress.nodeId
            ) {
                return;
            }
            transfer = session;
            observers.on(session.progressFinished, () => resolver(session));
            observers.on(session.closed, () =>
                rejecter(
                    new OtaTransferError(
                        `BDX transfer to node id ${this.#nodeId} ended after ${session.transferredBytes} of ` +
                            `${session.dataLength ?? "an indefinite number of"} bytes without completing`,
                    ),
                ),
            );
        });

        const expiry = Time.sleep("cert OTA transfer", timeout);

        // Anything but a completed transfer leaves the update queued, and a later forceUpdate() for this
        // node then finds an active session and declines to start a replacement. Tracked here rather than
        // per failure branch: a throw from the announce, a session that closed, and the budget expiring all
        // have to undo it, and attaching that to one branch is what let two of them escape before.
        let served = false;
        try {
            // The announce is inside the race, not before it: it waits on the peer, so a provider the node
            // never answers would otherwise hold this call open past the budget it documents.
            const completed = await Promise.race([trigger().then(() => promise), expiry.then(() => undefined)]);
            if (completed === undefined) {
                throw new OtaTransferError(
                    `Node id ${this.#nodeId} did not take the offered OTA image within ${Duration.format(timeout)}` +
                        (transfer === undefined ? " — it opened no BDX transfer at all" : ""),
                );
            }
            served = true;
            return completed;
        } finally {
            expiry.cancel();
            observers.close();
            if (!served) {
                await abandon();
            }
        }
    }

    readEvents(paths: EventPathSpec[], options?: ReadEventOptions): Promise<EventReadEntry[]> {
        return runTagged(this.#adapterId, async () => {
            if (paths.length === 0) {
                throw new ImplementationError("readEvents requires at least one path");
            }
            const values = new Array<ReadResult.EventValue>();
            const statuses = new Array<ReadResult.EventStatus>();
            const request = Read({
                events: paths.map(toEventIds),
                eventFilters: eventFiltersFor(options),
                fabricFilter: options?.fabricFiltered,
            });
            for await (const chunk of this.#peer.interaction.read(request)) {
                for await (const report of chunk) {
                    if (report.kind === "event-value") {
                        values.push(report);
                    } else if (report.kind === "event-status") {
                        statuses.push(report);
                    }
                }
            }
            assertNoConcreteEventStatus(paths, statuses, "readEvents");
            return toWireEvents(values);
        });
    }

    subscribeEvents(paths: EventPathSpec[], opts: SubscribeEventOptions): Promise<EventReadEntry[]> {
        return runTagged(this.#adapterId, async () => {
            if (paths.length === 0) {
                throw new ImplementationError("subscribeEvents requires at least one path");
            }
            const seed = new Array<ReadResult.EventValue>();
            const seedStatuses = new Array<ReadResult.EventStatus>();
            // A subscription this rejects stays established on the device and nothing here can revoke
            // it; dropping its reports is what keeps them away from the `onUpdate` of a step that has
            // already failed on the rejection, which is what the chip-tool adapter does too.
            let phase: "seeding" | "live" | "refused" = "seeding";
            const request = Subscribe({
                events: paths.map(path => ({ ...toEventIds(path), isUrgent: opts.urgent })),
                eventFilters: eventFiltersFor(opts),
                fabricFilter: opts.fabricFiltered,
                keepSubscriptions: true,
                minIntervalFloor: Seconds(opts.minIntervalFloorSeconds),
                maxIntervalCeiling: Seconds(opts.maxIntervalCeilingSeconds),
            });
            request.updated = async data => {
                for await (const chunk of data) {
                    for await (const report of chunk) {
                        if (phase === "refused") {
                            continue;
                        }
                        if (report.kind === "event-status") {
                            if (phase === "seeding") {
                                seedStatuses.push(report);
                            }
                            continue;
                        }
                        if (report.kind !== "event-value") {
                            continue;
                        }
                        if (phase === "seeding") {
                            seed.push(report);
                        } else {
                            opts.onUpdate?.(toWireEvents([report])[0]);
                        }
                    }
                }
            };
            await this.#peer.interaction.subscribe(request);
            try {
                assertNoConcreteEventStatus(paths, seedStatuses, "subscribeEvents");
            } catch (e) {
                phase = "refused";
                throw e;
            }
            phase = "live";
            return toWireEvents(seed);
        });
    }

    openCommissioningWindow(opts: {
        timeout: number;
        enhanced: boolean;
    }): Promise<{ manualPairingCode?: string; qrPairingCode?: string }> {
        return runTagged(this.#adapterId, async () => {
            const peer = this.#peer;
            if (opts.enhanced) {
                return await peer.openEnhancedCommissioningWindow(Seconds(opts.timeout));
            }
            await peer.openBasicCommissioningWindow(Seconds(opts.timeout));
            return {};
        });
    }

    decommission(): Promise<void> {
        return runTagged(this.#adapterId, async () => {
            const peer = this.#peer;

            // Decommissioning acts through the peer's OperationalCredentials behavior, which the first
            // report carrying that cluster installs; a peer whose structure read aborted has none, and
            // reading it here is what installs it. Only that condition may be pre-empted: any other
            // failure is the step's outcome, including a refusal a step means to assert.
            if (peer.lifecycle.isCommissioned && !peer.behaviors.has(OperationalCredentialsClient)) {
                logger.info(`Reading ${peer.id}'s credentials, which decommissioning it needs`);
                await this.readAttribute({ endpoint: 0, cluster: OperationalCredentials.id });
            }

            await peer.decommission();
        });
    }

    operationalMdnsInstanceName(): Promise<string> {
        return runTagged(this.#adapterId, async () => {
            return getOperationalDeviceQname(this.#fabric.globalId, this.#nodeId);
        });
    }
}

/**
 * A cert step's own checks bound how long they wait (e.g. TC-CADMIN-1.17 step 8's 25s
 * `expectRejection`), so a connect attempt that can't succeed must fail well inside that budget —
 * `PeerTimingParameters.defaults.defaultConnectionTimeout` (90s) is right for a real user's
 * session but would still be "pending" when a cert step's own check gives up. Test-ergonomics bound
 * only, scoped to each cert adapter's own {@link PeerSet} below; every other consumer keeps the 90s
 * default.
 */
const CERT_PEER_CONNECTION_TIMEOUT = Seconds(15);

/**
 * How long to wait for a peer to hold a subscription before continuing without one.
 *
 * Longer than the interaction's own wait for the peer, so a peer that stops answering reports why
 * before this decides it never will. A read waits `calculateMaximumPeerResponseTime`, which is ~35s
 * at the session parameters chip's apps negotiate; below that, the run records "held no subscription"
 * and the reason arrives seconds later, reading as an unrelated failure of the step already running.
 */
const CERT_PEER_SETTLE_TIMEOUT = Seconds(45);

/**
 * Budget that expresses {@link CommissioningTarget.singleHandshakeAttempt}. Below every retry interval commissioning's
 * operational connection uses — `delayBeforeNextAddress` (15s), the `NoSharedTrustRoots` fast retry (15s) and
 * `delayAfterNetworkError` (15s) — so commissioning ends on the first handshake attempt, whether or not that attempt
 * produced an answer: initial contact retransmits until the device responds, so a silent device is cut off mid-attempt.
 *
 * This bounds only how long commissioning waits, not the handshake itself, so the rejection it produces reports a
 * budget that expired rather than what the device answered. A step needing the device's own answer reads it from the
 * controller log or from the counterparty's evidence.
 */
const SINGLE_HANDSHAKE_TIMEOUT = Seconds(10);

/**
 * Waits for the peer's sustained subscription to become active (`isConnected` tracks `subscriptionActive`,
 * and the subscription bootstraps with the structure read, so this covers both).
 *
 * A step's own subscription must not be in flight while that sustained one is still establishing: it carries
 * `keepSubscriptions: false`, so the device drops the step's subscription and answers it `InvalidAction`.
 *
 * A peer that never gets there is reported, not failed: a step addresses the peer through raw interaction
 * paths, which work without a subscription, so refusing to continue would fail test cases whose device holds
 * a cluster matter.js cannot build a behavior for.
 */
async function settlePeer(peer: ClientNode) {
    if (peer.lifecycle.isConnected) {
        return;
    }
    const observers = new ObserverGroup();
    const expiry = Time.sleep("cert peer settling", CERT_PEER_SETTLE_TIMEOUT);
    try {
        const connected = new Promise<void>(resolve => {
            const check = () => {
                if (peer.lifecycle.isConnected) {
                    resolve();
                }
            };
            observers.on(peer.lifecycle.connectionStateChanged, check);
            check();
        });
        if (!(await Promise.race([connected.then(() => true), expiry.then(() => false)]))) {
            logger.warn(
                `Peer ${peer.id} held no subscription after ${Duration.format(CERT_PEER_SETTLE_TIMEOUT)} ` +
                    `(seeded: ${peer.lifecycle.isSeeded}, state: ${peer.lifecycle.connectionState}); continuing`,
            );
        }
    } finally {
        expiry.cancel();
        observers.close();
    }
}

/**
 * Endpoint the controller's requestor cluster lives on. Fixed: a provider addresses its `Offer` at
 * whatever endpoint the solicitation named, and a case states that endpoint when it solicits.
 */
const WEBRTC_REQUESTOR_ENDPOINT = EndpointNumber(1);

/**
 * Exposes the controller's {@link WebRtcTransportRequestorServer} to a cert test: which sessions it
 * tracks, and which signaling it accepted or refused.
 */
class InProcessWebRtcRequestorApi implements WebRtcRequestorApi {
    readonly endpoint = Number(WEBRTC_REQUESTOR_ENDPOINT);

    readonly #adapterId: string;
    readonly #node: Endpoint<typeof CameraControllerDevice>;
    readonly #controller: ServerNode;
    readonly #fabric: Fabric;
    readonly #signals = new Array<WebRtcSignalRecord>();
    readonly #waiters = new Set<(signal: WebRtcSignalRecord | undefined) => void>();
    readonly #observers = new ObserverGroup();
    readonly #dispatch = new Array<WebRtcSignalRecord>();
    #dispatching?: Timer;
    #closed = false;

    constructor(
        adapterId: string,
        endpoint: Endpoint<typeof CameraControllerDevice>,
        controller: ServerNode,
        fabric: Fabric,
    ) {
        this.#adapterId = adapterId;
        this.#node = endpoint;
        this.#controller = controller;
        this.#fabric = fabric;

        const events = endpoint.eventsOf(WebRtcTransportRequestorServer);
        this.#observers.on(events.offer, (session, request) =>
            this.#record("offer", session.id, "accepted", { sdp: request.sdp }),
        );
        this.#observers.on(events.answer, (session, sdp) => this.#record("answer", session.id, "accepted", { sdp }));
        this.#observers.on(events.iceCandidates, (session, candidates) =>
            this.#record("iceCandidates", session.id, "accepted", {
                candidates: candidates.map(({ candidate, sdpMid, sdpmLineIndex }) => ({
                    candidate,
                    sdpMid,
                    sdpmLineIndex,
                })),
            }),
        );
        this.#observers.on(events.end, session => this.#record("end", session.id, "accepted"));
        this.#observers.on(events.refused, (signal, sessionId) => this.#record(signal, sessionId, "refused"));
    }

    async upsertSession(session: WebRtcSessionSpec): Promise<void> {
        const peerNodeId = this.#peerNodeIdOf(session.peer);
        const videoStreams =
            session.videoStreamId === undefined || session.videoStreamId === null ? undefined : [session.videoStreamId];
        const audioStreams =
            session.audioStreamId === undefined || session.audioStreamId === null ? undefined : [session.audioStreamId];

        await runTagged(this.#adapterId, async () =>
            this.#node.act(agent =>
                agent.get(WebRtcTransportRequestorServer).upsertSession({
                    id: session.id,
                    peerNodeId,
                    peerEndpointId: EndpointNumber(session.peerEndpointId),
                    streamUsage: session.streamUsage,
                    metadataEnabled: session.metadataEnabled ?? false,
                    videoStreams,
                    audioStreams,
                    fabricIndex: this.#fabric.fabricIndex,
                }),
            ),
        );
    }

    async removeSession(id: number): Promise<void> {
        await runTagged(this.#adapterId, async () =>
            this.#node.act(agent => agent.get(WebRtcTransportRequestorServer).removeSession(id)),
        );
    }

    async sessions(): Promise<readonly WebRtcSessionRecord[]> {
        return runTagged(this.#adapterId, async () =>
            this.#node
                .stateOf(WebRtcTransportRequestorServer)
                .currentSessions.map(({ id, videoStreamId, audioStreamId }) => ({
                    id,
                    videoStreamId: videoStreamId ?? null,
                    audioStreamId: audioStreamId ?? null,
                })),
        );
    }

    signals(): readonly WebRtcSignalRecord[] {
        return [...this.#signals];
    }

    async nextSignal(
        predicate: (signal: WebRtcSignalRecord) => boolean,
        timeoutMs: number,
    ): Promise<WebRtcSignalRecord | undefined> {
        const already = this.#signals.find(predicate);
        if (already !== undefined) {
            return already;
        }
        if (this.#closed) {
            return undefined;
        }

        return new Promise<WebRtcSignalRecord | undefined>(resolve => {
            let waiter: (signal: WebRtcSignalRecord | undefined) => void;

            const timer = Time.getTimer("webrtc signal wait", Millis(timeoutMs), () => {
                this.#waiters.delete(waiter);
                resolve(undefined);
            });

            waiter = signal => {
                if (signal !== undefined && !predicate(signal)) {
                    return;
                }
                timer.stop();
                this.#waiters.delete(waiter);
                resolve(signal);
            };

            this.#waiters.add(waiter);
            timer.start();
        });
    }

    /** Settles every wait: a controller that has closed will never see the signal one is waiting for. */
    close() {
        this.#closed = true;
        this.#observers.close();
        this.#dispatching?.stop();
        this.#dispatching = undefined;
        this.#dispatch.length = 0;
        for (const waiter of [...this.#waiters]) {
            waiter(undefined);
        }
        this.#waiters.clear();
    }

    /**
     * A session names the peer it belongs to, and the requestor cluster judges the peer's signaling
     * against it, so a session registered for a node this controller never commissioned can only
     * refuse everything the real peer sends.
     */
    #peerNodeIdOf(ref: CertNodeRef): NodeId {
        let nodeId: NodeId;
        try {
            nodeId = NodeId(BigInt(ref));
        } catch (cause) {
            throw new ImplementationError(`Node reference "${ref}" is not one this adapter minted`, { cause });
        }

        if (this.#controller.peers.get(this.#fabric.addressOf(nodeId)) === undefined) {
            throw new NoCommissionedPeerError(
                `Controller "${this.#adapterId}" has no commissioned peer with node id ${nodeId} to hold a WebRTC ` +
                    "session with",
            );
        }

        return nodeId;
    }

    #record(
        kind: WebRtcSignalRecord["kind"],
        sessionId: number,
        outcome: WebRtcSignalRecord["outcome"],
        payload?: Pick<WebRtcSignalRecord, "sdp" | "candidates">,
    ) {
        const signal: WebRtcSignalRecord = { kind, sessionId, outcome, ...payload, at: Time.nowUs };
        this.#signals.push(signal);

        // These events fire inside the transaction handling the peer's command, which holds the
        // cluster's state lock; a waiter resumed here writes to that state and fails to lock it
        this.#dispatch.push(signal);
        if (this.#dispatching === undefined) {
            this.#dispatching = Time.getTimer("webrtc signal dispatch", Millis(0), () => {
                this.#dispatching = undefined;
                const pending = this.#dispatch.splice(0);
                for (const each of pending) {
                    for (const waiter of [...this.#waiters]) {
                        waiter(each);
                    }
                }
            }).start();
        }
    }
}

/**
 * Wraps a controller {@link ServerNode} as a {@link ControllerAdapter} for cert tests.
 *
 * Each instance gets its own {@link Environment} (child of {@link Environment.default}) with in-memory
 * storage, so multiple adapters (e.g. "dut", "th_cr2") in the same process never share fabric/session
 * state.
 */
export class InProcessControllerAdapter implements ControllerAdapter {
    readonly id: string;
    readonly log: LogFollower;
    readonly #env: Environment;
    readonly #releaseLogOrigin: () => void;
    readonly #logStream = new LineQueue();
    #controller?: ServerNode;
    #fabric?: Fabric;
    readonly #transport?: ControllerTransport;
    readonly #hostsWebRtcRequestor: boolean;
    #webRtcRequestor?: InProcessWebRtcRequestorApi;

    constructor(id: string, options?: ControllerAdapterOptions) {
        if (adapterStreams.has(id)) {
            throw new InternalError(
                `InProcessControllerAdapter "${id}" is already registered; two live adapters with the same id ` +
                    "would misattribute each other's logs (adapterStreams is keyed by id) — give each controller " +
                    "role a unique id",
            );
        }

        this.id = id;
        this.#transport = options?.transport;
        this.#hostsWebRtcRequestor = options?.webRtcRequestor === true;
        this.#env = new Environment(`cert-${id}`, Environment.default);
        this.#releaseLogOrigin = registerLogOrigin(this.#env.logOrigin, "adapter", this.#logStream);
        new MockStorageService(this.#env);

        // Blob storage is not covered by the mock KV store: opening it detects a driver from a
        // `driver.json` under the Filesystem service, which without this resolves to the developer's
        // own `~/.matter` — where an OTA image a case stages would then be written, and where an
        // existing "dir" driver makes the open fail outright against the in-memory blob driver.
        this.#env.set(Filesystem, new MockFilesystem());
        this.log = new LogFollower(this.#logStream.follow(), id);

        adapterStreams.set(id, this.#logStream);
    }

    get #startedController(): ServerNode {
        if (this.#controller === undefined) {
            throw new ImplementationError(`Controller adapter "${this.id}" was used before start()`);
        }
        return this.#controller;
    }

    get #adminFabric(): Fabric {
        if (this.#fabric === undefined) {
            throw new ImplementationError(`Controller adapter "${this.id}" was used before start()`);
        }
        return this.#fabric;
    }

    start(): Promise<void> {
        return runTagged(this.id, async () => {
            const controller = await ServerNode.create(ServerNode.RootEndpoint.with(ControllerBehavior), {
                environment: this.#env,
                id: this.id,
                commissioning: { enabled: false },
                controller: { adminFabricLabel: this.id },
                network: {
                    autoStartCommissionedPeers: false,

                    // Outgoing only: this controller is a TCP client, and `tcp: true` would also have it
                    // listen and advertise as a TCP server, which no cert test asks of a controller.
                    ...(this.#transport === "tcp"
                        ? { tcp: { outgoing: true }, transportPreference: "tcp" as const }
                        : {}),
                },
                subscriptions: { persistenceEnabled: false },
            });
            this.#controller = controller;

            const fabricAuthority = await controller.env.load(FabricAuthority);
            this.#fabric = await fabricAuthority.defaultFabric({ adminFabricLabel: this.id });

            await controller.start();

            if (this.#hostsWebRtcRequestor) {
                const endpoint = await controller.add(CameraControllerDevice, {
                    id: "webrtc-requestor",
                    number: WEBRTC_REQUESTOR_ENDPOINT,
                });
                this.#webRtcRequestor = new InProcessWebRtcRequestorApi(
                    this.id,
                    endpoint,
                    controller,
                    this.#adminFabric,
                );
            }

            controller.env.get(PeerSet).timing = {
                defaultConnectionTimeout: CERT_PEER_CONNECTION_TIMEOUT,
            };
        });
    }

    async close(): Promise<void> {
        try {
            await runTagged(this.id, async () => {
                this.#webRtcRequestor?.close();
                await this.#controller?.close();
            });
        } finally {
            this.#releaseLogOrigin();
            adapterStreams.delete(this.id);
            this.#logStream.close();
        }
    }

    async parseQrPayload(code: string): Promise<OnboardingPayloadFields> {
        const { version, vendorId, productId, flowType, discoveryCapabilities, discriminator, passcode } =
            singleQrPayload(code);
        return { version, vendorId, productId, flowType, discoveryCapabilities, discriminator, passcode };
    }

    async parseManualPairingCode(code: string): Promise<ManualPairingCodeFields> {
        const { shortDiscriminator, passcode, vendorId, productId } = refusalOf(
            () => ManualPairingCodeCodec.decode(code),
            `manual pairing code ${code}`,
        );
        if (shortDiscriminator === undefined) {
            throw new InternalError(`Manual pairing code ${code} decoded to no short discriminator`);
        }
        return { shortDiscriminator, passcode, vendorId, productId };
    }

    commission(target: CommissioningTarget): Promise<CertNodeRef> {
        return runTagged(this.id, async () => {
            const { identifierData, passcode, vendorId, productId } = resolveCommissioningTarget(target);
            // A commissioned peer holds the sustained wildcard subscription that bootstraps its own structure
            // read, so the standalone post-commissioning read is suppressed — one read, not two.
            const peer = await this.#startedController.peers.commission({
                ...identifierData,
                passcode,
                vendorId,
                productId,
                autoStateInitialize: false,
                caseConnectionTimeout: target.singleHandshakeAttempt ? SINGLE_HANDSHAKE_TIMEOUT : undefined,
                timeout: target.giveUpAfterMs === undefined ? undefined : Millis(target.giveUpAfterMs),
                regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor,
                regulatoryCountryCode: "XX",
                onAttestationFailure: findings => {
                    // Accepting is what lets a test device commission at all; the evidence still has
                    // to say what was accepted, or a step asserting a clean attestation proves nothing
                    logger.notice(
                        `Accepting device attestation findings: ${findings
                            .map(({ level, type, message }) => `${level} ${type}: ${message}`)
                            .join("; ")}`,
                    );
                    return true;
                },
            });
            const address = peer.peerAddress;
            if (address === undefined) {
                throw new InternalError(`Commissioned peer ${peer.id} has no peer address`);
            }
            await settlePeer(peer);
            return address.nodeId.toString();
        });
    }

    get webRtcRequestor(): WebRtcRequestorApi | undefined {
        return this.#webRtcRequestor;
    }

    node(ref: CertNodeRef): CertNodeApi {
        return new InProcessCertNodeApi(this.id, this.#startedController, this.#adminFabric, ref);
    }

    group(groupId: number): CertGroupApi {
        return new InProcessCertGroupApi(this.id, this.#startedController, this.#adminFabric, groupId);
    }
}

/**
 * Sends a command to a group rather than to a node. matter.js addresses a group as a peer whose node
 * id encodes the group (Matter Core § 2.5.4), so the fabric's own address for that node id resolves
 * to a {@link ClientGroup} and its interaction sends the groupcast.
 */
class InProcessCertGroupApi implements CertGroupApi {
    readonly #adapterId: string;
    readonly #controller: ServerNode;
    readonly #fabric: Fabric;
    readonly #groupId: number;

    constructor(adapterId: string, controller: ServerNode, fabric: Fabric, groupId: number) {
        this.#adapterId = adapterId;
        this.#controller = controller;
        this.#fabric = fabric;
        this.#groupId = groupId;
    }

    /**
     * The fabric the sending path itself resolves. The adapter's own handle is a different object for
     * the same fabric index, and group state written on that one is invisible to the session manager,
     * which asks its own fabric for the key when it opens the group session.
     */
    get #sendingFabric(): Fabric {
        return this.#controller.env.get(SessionManager).fabricFor(this.#address);
    }

    get #address() {
        return this.#fabric.addressOf(NodeId.fromGroupId(this.#groupId));
    }

    async defineKeySet(keySet: GroupKeySetSpec): Promise<void> {
        await runTagged(this.#adapterId, async () => {
            const fabric = this.#sendingFabric;
            await fabric.groups.setFromGroupKeySet({
                ...keySet,
                epochKey1: null,
                epochStartTime1: null,
                epochKey2: null,
                epochStartTime2: null,
            });
            fabric.groups.groupKeyIdMap.set(GroupId(this.#groupId), keySet.groupKeySetId);
        });
    }

    async invoke(cluster: string | number, command: string, args?: object): Promise<void> {
        await runTagged(this.#adapterId, async () => {
            const group = await this.#controller.peers.forAddress(this.#address);

            const request = Invoke({ commands: [groupCommandRequestFor(cluster, command, args)] });

            // A groupcast is unacknowledged and answered by nobody, so the iteration ends without
            // yielding; draining it is what sends the message
            for await (const _chunk of group.interaction.invoke(request)) {
            }
        });
    }
}
