/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientInteraction } from "#action/client/ClientInteraction.js";
import { ClientSubscriptions } from "#action/client/subscription/ClientSubscriptions.js";
import { Read } from "#action/request/Read.js";
import { CertificateAuthority } from "#certificate/CertificateAuthority.js";
import { Dac } from "#certificate/kinds/AttestationCertificates.js";
import { Noc } from "#certificate/kinds/Noc.js";
import { Fabric } from "#fabric/Fabric.js";
import { ExchangeManager } from "#protocol/ExchangeManager.js";
import { DedicatedChannelExchangeProvider } from "#protocol/ExchangeProvider.js";
import { NodeSession } from "#session/NodeSession.js";
import { SessionManager } from "#session/SessionManager.js";
import {
    Bytes,
    Crypto,
    Duration,
    Environment,
    ImplementationError,
    isObject,
    Logger,
    MatterError,
    Millis,
    Minutes,
    PublicKey,
    Seconds,
    Time,
    UnexpectedDataError,
} from "@matter/general";
import { CaseAuthenticatedTag, EndpointNumber, FabricIndex, NodeId, StatusResponseError } from "@matter/types";
import { GeneralCommissioning } from "@matter/types/clusters/general-commissioning";
import { OperationalCredentials } from "@matter/types/clusters/operational-credentials";
import { invokeSingleCommand, operationalPublicKeyOfCsr } from "./AdministratorCommands.js";
import { PeerAddress } from "./PeerAddress.js";
import { FabricChangedError } from "./PeerCommunicationError.js";
import { PeerSet } from "./PeerSet.js";

const logger = Logger.get("OperationalCertificateUpdate");

const RootEndpointNumber = EndpointNumber(0);

/** Default fail-safe for the whole update, including the CASE reconnect with the new certificate. */
export const DEFAULT_NOC_UPDATE_FAILSAFE = Minutes.one;

/** Fail-safe time kept back so CommissioningComplete can still arrive after the reconnect. */
const COMMISSIONING_COMPLETE_MARGIN = Seconds(10);

/** Shortest fail-safe that leaves time for the reconnect after {@link COMMISSIONING_COMPLETE_MARGIN}. */
const MIN_FAILSAFE = Seconds(30);

/** ArmFailSafe carries the expiry as uint16 seconds (§ 11.10.7.2). */
const MAX_FAILSAFE = Seconds(0xffff);

/**
 * Thrown when updating the operational certificate of a peer fails.
 *
 * The message states which certificate the peer holds afterwards, or that this could not be determined.
 */
export class OperationalCertificateUpdateError extends MatterError {}

/**
 * Thrown when the update did not start because the fail-safe of the peer may be in use: ArmFailSafe answered
 * BusyWithOtherAdmin, or Breadcrumb was not 0 before arming.  Nothing changed on the peer; the caller may retry later.
 */
export class OperationalCertificateUpdateBusyError extends OperationalCertificateUpdateError {}

/**
 * Thrown when the peer refused ArmFailSafe with an error code other than BusyWithOtherAdmin, or when the certificate
 * the peer reports for its fabric does not verify.  Nothing changed on the peer; a retry fails the same way until the
 * cause on the peer is fixed.
 */
export class OperationalCertificateUpdateRefusedError extends OperationalCertificateUpdateError {}

/**
 * Dependencies of {@link updateOperationalCertificate}.
 */
export interface OperationalCertificateUpdateContext {
    peers: PeerSet;
    sessions: SessionManager;
    exchanges: ExchangeManager;
    ca: CertificateAuthority;
    environment: Environment;
}

/**
 * Options of {@link updateOperationalCertificate}.
 *
 * @see {@link MatterSpecification.v161.Core} § 11.10.7.2
 */
export interface OperationalCertificateUpdateOptions {
    /** The peer whose certificate to replace. */
    address: PeerAddress;

    /**
     * Fail-safe armed for the whole update.  Defaults to {@link DEFAULT_NOC_UPDATE_FAILSAFE}; must lie between 30 s
     * and 65535 s.  A peer ends the fail-safe early at its `MaxCumulativeFailsafeSeconds`.
     */
    failsafe?: Duration;

    /** Aborts waiting for any CASE session the update opens with the peer. */
    abort?: AbortSignal;
}

/**
 * Result of {@link updateOperationalCertificate}.
 *
 * @see {@link MatterSpecification.v161.Core} § 11.18.6.10
 */
export interface OperationalCertificateUpdateResult {
    /** Fabric index under which the peer stores the updated certificate, if its NOCResponse arrived. */
    fabricIndexOnPeer?: FabricIndex;

    /** Public key of the new node operational key pair. */
    operationalPublicKey: Bytes;
}

/**
 * Replace the node operational certificate (NOC) of a commissioned peer with one for a freshly generated key pair.
 *
 * The node ID, fabric, CASE Authenticated Tags and fabric-scoped data on the peer stay unchanged.  The sequence:
 *
 * ```
 * session 1: ArmFailSafe ─ CertificateChainRequest(DAC) ─ CSRRequest(IsForUpdateNOC) ─ UpdateNOC
 * session 2: CommissioningComplete
 * ```
 *
 * CSRRequest and UpdateNOC must share one secure session.  The peer keeps that session only until the NOCResponse is
 * delivered, so CommissioningComplete uses a new CASE session that authenticates the new NOC.  The DAC check of the
 * CSR signature only proves that the CSR comes from the holder of the DAC the peer reports; the CASE session already
 * authenticates the peer.
 *
 * The update arms its fail-safe with a random non-zero Breadcrumb.  The peer resets Breadcrumb to 0 on a successful
 * CommissioningComplete and on fail-safe expiry or disarm (§ 11.10.7.2, § 11.10.7.6).  The fail-safe is bound to the
 * fabric, not to the session, so any operation of the same fabric may re-arm it and overwrite Breadcrumb.  The update
 * therefore sends CommissioningComplete only over a session on which it has just read its own Breadcrumb, and it does
 * not arm when Breadcrumb is not 0 at the start, because an ArmFailSafe would join the fail-safe of another operation.
 * When it reads a foreign Breadcrumb after UpdateNOC, it disarms, so that no other operation can commit the pending NOC
 * later, and decides from a second read; a disarm without an armed fail-safe has no effect (§ 11.10.7.2).
 *
 * Failure handling:
 *
 * | Situation                                  | Action and result                                   |
 * | ------------------------------------------ | --------------------------------------------------- |
 * | aborted before or while a session is       | send nothing on it; reject with the abort reason    |
 * | obtained                                   |                                                     |
 * | Breadcrumb not 0 before arming             | arm nothing; reject as busy, the caller may retry   |
 * | Breadcrumb or NOCs unreadable before       | arm nothing; reject, nothing changed                |
 * | arming                                     |                                                     |
 * | the reported NOC fails to verify against   | arm nothing; reject as refused, nothing changed     |
 * | the fabric root, node ID or fabric ID      |                                                     |
 * | ArmFailSafe answered with an error code    | nothing armed; reject                               |
 * | a later step before UpdateNOC fails, or    | disarm over session 1; previous NOC kept            |
 * | UpdateNOC is refused                       |                                                     |
 * | after UpdateNOC, on a new CASE session     | read Breadcrumb and NOCs, then by the values read:  |
 * | - Breadcrumb ours, NOCs is the new NOC     | CommissioningComplete: OK → resolve; error code or  |
 * |                                            | status → disarm and read again; no answer →         |
 * |                                            | recovery                                            |
 * | - Breadcrumb 0, NOCs is the previous NOC   | send nothing; report previous NOC (fail-safe ended) |
 * | - anything else                            | disarm and read again                               |
 * | read again, on another new session         | 0 and NOCs is the previous NOC → report previous    |
 * |                                            | NOC; 0 and NOCs is the new NOC after a confirmed    |
 * |                                            | disarm → resolve; else report the outcome as        |
 * |                                            | unknown                                             |
 * | UpdateNOC unanswered; or after a confirmed | recovery, once: the same read and decision on       |
 * | UpdateNOC no CASE session, a read or       | another new CASE session; a failure there or an     |
 * | CommissioningComplete unanswered           | abort reports the outcome as unknown                |
 *
 * "NOCs is" a certificate means the fabric's NOCs list holds exactly that one certificate; the previous NOC is the one
 * verified before arming.  An empty list or a NOC of another rotation counts as anything else.
 *
 * The update never lets another operation commit its new NOC unseen.  For that reason the disarm deliberately also
 * reverts what another operation of the same fabric placed in the shared fail-safe context; that operation's
 * CommissioningComplete then fails with NoFailSafe, and it can retry.  Matter offers no read of who holds the
 * fail-safe, so an arm with Breadcrumb 0 by another operation before the update starts stays undetectable.  Breadcrumb
 * is writable (§ 11.10.6.1), so a stale non-zero value written without a fail-safe makes the update refuse until
 * CommissioningComplete, a fail-safe expiry or a restart of the peer resets it.
 *
 * After UpdateNOC and after a rollback the peer clears our sessions without notice, so we close ours, drop the
 * resumption record and restart subscriptions.
 *
 * Rejects with {@link ImplementationError} for an unknown peer, a fabric whose CA we do not hold or a fail-safe out
 * of range, with the connection error when no CASE session can be established at the start, with
 * {@link OperationalCertificateUpdateBusyError} or {@link OperationalCertificateUpdateRefusedError} when no fail-safe
 * was armed, and with {@link OperationalCertificateUpdateError} for every later failure.
 *
 * @see {@link MatterSpecification.v161.Core} § 11.18.6.9
 * @see {@link MatterSpecification.v161.Core} § 11.10.7.2
 * @see {@link MatterSpecification.v161.Core} § 11.10.6.1
 */
export async function updateOperationalCertificate(
    context: OperationalCertificateUpdateContext,
    { address, failsafe = DEFAULT_NOC_UPDATE_FAILSAFE, abort }: OperationalCertificateUpdateOptions,
): Promise<OperationalCertificateUpdateResult> {
    const { peers, ca } = context;

    const peer = peers.get(address);
    if (peer === undefined) {
        throw new ImplementationError(`Cannot update the operational certificate of unknown peer ${address}`);
    }
    const fabric = peer.fabric;
    if (!Bytes.areEqual(fabric.rootCert, ca.rootCert)) {
        throw new ImplementationError(
            `Cannot update the operational certificate of ${address} because we are not the certificate authority of fabric ${fabric.fabricIndex}`,
        );
    }
    if (failsafe < MIN_FAILSAFE || failsafe > MAX_FAILSAFE) {
        throw new ImplementationError(
            `Fail-safe ${Duration.format(failsafe)} for the operational certificate update of ${address} is outside ${Duration.format(MIN_FAILSAFE)} to ${Duration.format(MAX_FAILSAFE)}`,
        );
    }

    const first = await connectCase(context, address, { abort });
    const armedAt = Time.nowUs;
    const failsafeLeft = () => Millis(Math.max(Math.floor(failsafe - (Time.nowUs - armedAt)), 0));

    const failsafeArm: FailsafeArm = { failsafe, breadcrumb: randomBreadcrumb(ca.crypto) };
    let installed: InstalledCertificate;
    try {
        installed = await installNewCertificate(context, first, fabric, failsafeArm);
    } finally {
        await first.interaction.close();
    }

    if (installed.kind === "refused") {
        if (isArmRefusal(installed.cause)) {
            throw installed.cause;
        }
        throw new OperationalCertificateUpdateError(
            `Updating the operational certificate of ${address} failed; it keeps its previous certificate`,
            { cause: installed.cause },
        );
    }

    let cause = installed.kind === "unconfirmed" ? installed.cause : undefined;
    let completion: Completion | undefined;
    if (installed.kind === "installed") {
        try {
            completion = await completeUpdate(context, address, installed, failsafeArm, {
                abort,
                connectionTimeout: Millis(Math.max(failsafeLeft() - COMMISSIONING_COMPLETE_MARGIN, 0)),
            });
        } catch (error) {
            cause = error;
        }
    }

    const recovered = completion === undefined;
    if (completion === undefined && abort?.aborted) {
        if (installed.kind === "unconfirmed") {
            try {
                await forgetSessions(context, address, "Operational certificate update of the peer was aborted");
            } catch (error) {
                logger.info(`Could not forget the sessions of ${address} after an aborted certificate update:`, error);
            }
        }
        completion = { kind: "unknown" };
    }
    if (completion === undefined) {
        try {
            completion = await completeUpdate(context, address, installed, failsafeArm, { abort });
        } catch (error) {
            logger.info(`Could not complete the operational certificate update of ${address}:`, error);
            completion = { kind: "unknown" };
        }
    }

    switch (completion.kind) {
        case "completed":
            logger.info(
                "Updated operational certificate of",
                address.toString(),
                ...(recovered ? ["after a recovery"] : []),
            );
            return {
                fabricIndexOnPeer: installed.kind === "installed" ? installed.fabricIndexOnPeer : undefined,
                operationalPublicKey: installed.operationalPublicKey,
            };

        case "reverted":
            throw new OperationalCertificateUpdateError(
                `Updating the operational certificate of ${address} failed; it reverted to its previous certificate`,
                { cause: completion.cause ?? cause },
            );

        case "unknown":
            throw new OperationalCertificateUpdateError(
                `Updating the operational certificate of ${address} failed and its outcome is unknown; the peer reverts to its previous certificate when its fail-safe expires, unless this update or another operation of the same fabric completed that fail-safe`,
                { cause: completion.cause ?? cause },
            );
    }
}

/** Outcome of the steps over the first session. */
type InstalledCertificate =
    | { kind: "refused"; cause: unknown }
    | ({ kind: "unconfirmed"; cause: unknown } & NewCertificate)
    | ({ kind: "installed"; fabricIndexOnPeer?: FabricIndex } & NewCertificate);

interface NewCertificate {
    nocValue: Bytes;
    operationalPublicKey: Bytes;

    /** The verified NOC the peer held before the update. */
    previousNoc: Bytes;
}

/**
 * Read Breadcrumb and the current NOC, then run ArmFailSafe, CertificateChainRequest, CSRRequest and UpdateNOC over
 * {@link session}.  The new NOC keeps the CASE Authenticated Tags of the current one.  Does not arm when Breadcrumb is
 * not 0 or the current NOC cannot be read or does not verify.  On a failure after arming and before UpdateNOC reached
 * the peer, disarms the fail-safe over the same session.
 */
async function installNewCertificate(
    { ca }: OperationalCertificateUpdateContext,
    { session, interaction }: AdministratorSession,
    fabric: Fabric,
    failsafeArm: FailsafeArm,
): Promise<InstalledCertificate> {
    let breadcrumb: bigint;
    let nocs: OperationalCertificate[];
    try {
        ({ breadcrumb, nocs } = await readStartState(interaction));
    } catch (cause) {
        return { kind: "refused", cause };
    }

    let previous: { noc: Bytes; caseAuthenticatedTags?: CaseAuthenticatedTag[] };
    try {
        previous = await verifiedCurrentNoc(nocs, fabric, interaction.address.nodeId);
    } catch (cause) {
        return {
            kind: "refused",
            cause: new OperationalCertificateUpdateRefusedError(
                `Cannot update the operational certificate of ${interaction.address}: the certificate it reports did not verify`,
                { cause },
            ),
        };
    }
    if (breadcrumb !== 0n) {
        return {
            kind: "refused",
            cause: new OperationalCertificateUpdateBusyError(
                `Cannot update the operational certificate of ${interaction.address}: its Breadcrumb is ${breadcrumb}, so another operation of the same fabric may hold the fail-safe; retry later`,
            ),
        };
    }

    let certificate: NewCertificate;
    try {
        await armFailsafe(interaction, failsafeArm);
    } catch (cause) {
        if (!isArmRefusal(cause)) {
            await disarmFailsafe(interaction);
        }
        return { kind: "refused", cause };
    }

    try {
        const { certificate: dac } = responseOf(
            await invokeSingleCommand(
                interaction,
                {
                    endpoint: RootEndpointNumber,
                    cluster: OperationalCredentials,
                    command: "certificateChainRequest",
                    fields: { certificateType: OperationalCredentials.CertificateChainType.DacCertificate },
                },
                { useExtendedFailSafeMessageResponseTimeout: true },
            ),
            "CertificateChainRequest",
        );
        const dacPublicKey = PublicKey(Dac.fromAsn1(dac).cert.ellipticCurvePublicKey);

        const csrResponse = responseOf(
            await invokeSingleCommand(
                interaction,
                {
                    endpoint: RootEndpointNumber,
                    cluster: OperationalCredentials,
                    command: "csrRequest",
                    fields: { csrNonce: ca.crypto.randomBytes(32), isForUpdateNoc: true },
                },
                { useExtendedFailSafeMessageResponseTimeout: true },
            ),
            "CSRRequest",
        );
        const operationalPublicKey = await operationalPublicKeyOfCsr(ca.crypto, csrResponse, {
            challenge: session.attestationChallengeKey,
            dacPublicKey,
        });
        certificate = {
            operationalPublicKey,
            previousNoc: previous.noc,
            nocValue: await ca.generateNoc(
                operationalPublicKey,
                fabric.fabricId,
                interaction.address.nodeId,
                previous.caseAuthenticatedTags,
            ),
        };
    } catch (cause) {
        await disarmFailsafe(interaction);
        return { kind: "refused", cause };
    }

    let response: OperationalCredentials.NocResponse;
    try {
        response = responseOf(
            await invokeSingleCommand(
                interaction,
                {
                    endpoint: RootEndpointNumber,
                    cluster: OperationalCredentials,
                    command: "updateNoc",
                    fields: { nocValue: certificate.nocValue, icacValue: ca.icacCert },
                },
                { useExtendedFailSafeMessageResponseTimeout: true },
            ),
            "UpdateNOC",
        );
    } catch (cause) {
        if (cause instanceof StatusResponseError) {
            await disarmFailsafe(interaction);
            return { kind: "refused", cause };
        }

        // The peer may have applied UpdateNOC and then dropped the session before its NOCResponse arrived
        return { kind: "unconfirmed", cause, ...certificate };
    }

    const { statusCode, debugText, fabricIndex } = response;
    if (statusCode !== OperationalCredentials.NodeOperationalCertStatus.Ok) {
        await disarmFailsafe(interaction);
        return {
            kind: "refused",
            cause: new OperationalCertificateUpdateError(
                `UpdateNOC failed with ${OperationalCredentials.NodeOperationalCertStatus[statusCode]} (${statusCode})${debugText ? `, ${debugText}` : ""}`,
            ),
        };
    }

    return { kind: "installed", fabricIndexOnPeer: fabricIndex, ...certificate };
}

/** The fail-safe this update arms and the Breadcrumb that marks it. */
interface FailsafeArm {
    failsafe: Duration;
    breadcrumb: bigint;
}

/** A random non-zero uint64, so the Breadcrumb tells this update's fail-safe from any other. */
function randomBreadcrumb(crypto: Crypto) {
    const value = BigInt(`0x${Bytes.toHex(crypto.randomBytes(8))}`);
    return value === 0n ? 1n : value;
}

/** Result of {@link completeUpdate}. */
type Completion = { kind: "completed" } | { kind: "reverted"; cause?: unknown } | { kind: "unknown"; cause?: unknown };

/** The fail-safe was disarmed after UpdateNOC, so only another read can tell the outcome. */
interface Disarmed {
    kind: "disarmed";
    disarmed: boolean;
    cause?: unknown;
}

/**
 * Send CommissioningComplete over a new CASE session, but only after reading on that session this update's
 * Breadcrumb and the new NOC pending.  Otherwise, and when CommissioningComplete fails, disarm and decide from a read
 * on another new session; see the table at {@link updateOperationalCertificate}.
 *
 * Rejects when the peer cannot be reached, a read fails or CommissioningComplete is not answered.
 */
async function completeUpdate(
    context: OperationalCertificateUpdateContext,
    address: PeerAddress,
    certificate: NewCertificate,
    { breadcrumb }: FailsafeArm,
    options: { abort?: AbortSignal; connectionTimeout?: Duration },
): Promise<Completion> {
    await forgetSessions(context, address, "Operational certificate of the peer was updated");
    const step = await withCase(context, address, options, async ({ interaction }): Promise<Completion | Disarmed> => {
        const state = await certificateState(interaction);
        const held = heldNoc(state, certificate);
        if (state.breadcrumb === breadcrumb && held === "new") {
            const response = await commissioningComplete(interaction);
            if (
                !(response instanceof StatusResponseError) &&
                response.errorCode === GeneralCommissioning.CommissioningError.Ok
            ) {
                return { kind: "completed" };
            }
            return {
                kind: "disarmed",
                cause:
                    response instanceof StatusResponseError
                        ? response
                        : new OperationalCertificateUpdateError(
                              `CommissioningComplete failed with ${commissioningErrorText(response.errorCode, response.debugText)}`,
                          ),
                disarmed: await disarmFailsafe(interaction),
            };
        }
        if (state.breadcrumb === 0n && held === "previous") {
            return { kind: "reverted" };
        }
        return { kind: "disarmed", disarmed: await disarmFailsafe(interaction) };
    });
    if (step.kind !== "disarmed") {
        return step;
    }

    await forgetSessions(context, address, "Peer may have reverted to its previous operational certificate");
    const state = await withCase(context, address, options, ({ interaction }) => certificateState(interaction));
    const held = heldNoc(state, certificate);
    if (state.breadcrumb === 0n && held === "previous") {
        return { kind: "reverted", cause: step.cause };
    }
    if (state.breadcrumb === 0n && held === "new" && step.disarmed) {
        return { kind: "completed" };
    }
    return { kind: "unknown", cause: step.cause };
}

/** Send CommissioningComplete; resolves to the error when the peer answers with a status instead of a response. */
async function commissioningComplete(interaction: ClientInteraction) {
    try {
        return responseOf(
            await invokeSingleCommand(
                interaction,
                { endpoint: RootEndpointNumber, cluster: GeneralCommissioning, command: "commissioningComplete" },
                { useExtendedFailSafeMessageResponseTimeout: true },
            ),
            "CommissioningComplete",
        );
    } catch (error) {
        if (error instanceof StatusResponseError) {
            return error;
        }
        throw error;
    }
}

/** One entry of the NOCs attribute. */
interface OperationalCertificate {
    noc: Bytes;
    icac?: Bytes;
}

interface CertificateState {
    /** The Breadcrumb attribute, if the peer reported it. */
    breadcrumb?: bigint;

    /** The NOCs of the accessing fabric, if the peer reported the NOCs attribute. */
    nocs?: OperationalCertificate[];
}

/**
 * Which of the two certificates {@link state} shows as the only NOC of the fabric; undefined for anything else, such
 * as no NOCs value, an empty list or a NOC of another rotation.
 */
function heldNoc({ nocs }: CertificateState, { nocValue, previousNoc }: NewCertificate) {
    if (nocs?.length !== 1) {
        return undefined;
    }
    const [{ noc }] = nocs;
    if (Bytes.areEqual(noc, nocValue)) {
        return "new";
    }
    if (Bytes.areEqual(noc, previousNoc)) {
        return "previous";
    }
    return undefined;
}

/** Read Breadcrumb and the NOCs of the accessing fabric; rejects when the peer does not report both. */
async function readStartState(interaction: ClientInteraction) {
    const { breadcrumb, nocs } = await certificateState(interaction);
    if (breadcrumb === undefined) {
        throw new UnexpectedDataError(`${interaction.address} reported no Breadcrumb value`);
    }
    if (nocs === undefined) {
        throw new UnexpectedDataError(`${interaction.address} reported no NOCs value`);
    }
    return { breadcrumb, nocs };
}

/**
 * The one NOC the peer reports for the accessing fabric, and its CASE Authenticated Tags.  The NOCs value is peer data,
 * so the NOC must chain to the root of {@link fabric} and name {@link nodeId} and the fabric ID before our CA copies
 * its tags; otherwise a peer could obtain tags it never held.  Rejects when any of this fails.
 */
async function verifiedCurrentNoc(nocs: OperationalCertificate[], fabric: Fabric, nodeId: NodeId) {
    if (nocs.length !== 1) {
        throw new UnexpectedDataError(`Peer reported ${nocs.length} NOCs for its fabric instead of one`);
    }
    const [{ noc, icac }] = nocs;
    await fabric.verifyCredentials(noc, icac);
    const { subject } = Noc.fromTlv(noc).cert;
    if (subject.nodeId !== nodeId || subject.fabricId !== fabric.fabricId) {
        throw new UnexpectedDataError(
            `Reported NOC is for node ${NodeId.strOf(subject.nodeId)} of fabric ${subject.fabricId}, not node ${NodeId.strOf(nodeId)} of fabric ${fabric.fabricId}`,
        );
    }
    return { noc, caseAuthenticatedTags: subject.caseAuthenticatedTags };
}

/** Read Breadcrumb and the NOCs of the accessing fabric in one request. */
async function certificateState(interaction: ClientInteraction): Promise<CertificateState> {
    const state: CertificateState = {};
    for await (const chunk of interaction.read(
        Read(
            { fabricFilter: true },
            Read.Attribute({ endpoint: RootEndpointNumber, cluster: GeneralCommissioning, attributes: "breadcrumb" }),
            Read.Attribute({ endpoint: RootEndpointNumber, cluster: OperationalCredentials, attributes: "nocs" }),
        ),
    )) {
        for await (const report of chunk) {
            if (report.kind !== "attr-value") {
                continue;
            }
            const { value } = report;
            if (report.path.clusterId === GeneralCommissioning.id) {
                if (typeof value === "number" || typeof value === "bigint") {
                    state.breadcrumb = BigInt(value);
                }
                continue;
            }
            if (Array.isArray(value)) {
                state.nocs = value.flatMap(entry =>
                    isObject(entry) && Bytes.isBytes(entry.noc)
                        ? [{ noc: entry.noc, icac: Bytes.isBytes(entry.icac) ? entry.icac : undefined }]
                        : [],
                );
            }
        }
    }
    return state;
}

/**
 * Close our sessions with a peer that cleared them without notice, drop the resumption record that belongs to the
 * replaced certificate, and re-establish subscriptions instead of waiting for them to time out.
 */
async function forgetSessions(
    { peers, sessions, environment }: OperationalCertificateUpdateContext,
    address: PeerAddress,
    reason: string,
) {
    try {
        await peers.for(address).disconnect(new FabricChangedError(reason));
        await sessions.deleteResumptionRecord(address);
    } finally {
        environment.maybeGet(ClientSubscriptions)?.closeForPeer(address);
    }
}

interface AdministratorSession {
    session: NodeSession;
    interaction: ClientInteraction;
}

/** Obtain a CASE session with the peer and an interaction bound to exactly that session. */
async function connectCase(
    { peers, exchanges, environment }: OperationalCertificateUpdateContext,
    address: PeerAddress,
    options: { abort?: AbortSignal; connectionTimeout?: Duration },
): Promise<AdministratorSession> {
    const session = await peers.for(address).connect(options);
    options.abort?.throwIfAborted();
    NodeSession.assert(session, `Peer ${address} did not yield a CASE session`);
    return {
        session,
        interaction: new ClientInteraction({
            environment,
            exchangeProvider: new DedicatedChannelExchangeProvider(exchanges, session),
            address,
        }),
    };
}

/** Run {@link fn} with a CASE session from {@link connectCase} and close its interaction afterwards. */
async function withCase<T>(
    context: OperationalCertificateUpdateContext,
    address: PeerAddress,
    options: { abort?: AbortSignal; connectionTimeout?: Duration },
    fn: (session: AdministratorSession) => Promise<T>,
) {
    const session = await connectCase(context, address, options);
    try {
        return await fn(session);
    } finally {
        await session.interaction.close();
    }
}

/** The update armed no fail-safe, so nothing on the peer needs to be undone. */
function isArmRefusal(cause: unknown) {
    return (
        cause instanceof OperationalCertificateUpdateBusyError ||
        cause instanceof OperationalCertificateUpdateRefusedError
    );
}

async function armFailsafe(interaction: ClientInteraction, { failsafe, breadcrumb }: FailsafeArm) {
    const { errorCode, debugText } = responseOf(
        await invokeSingleCommand(interaction, {
            endpoint: RootEndpointNumber,
            cluster: GeneralCommissioning,
            command: "armFailSafe",
            fields: { expiryLengthSeconds: Math.ceil(Seconds.of(failsafe)), breadcrumb },
        }),
        "ArmFailSafe",
    );
    if (errorCode === GeneralCommissioning.CommissioningError.Ok) {
        return;
    }
    if (errorCode === GeneralCommissioning.CommissioningError.BusyWithOtherAdmin) {
        throw new OperationalCertificateUpdateBusyError(
            `Cannot update the operational certificate of ${interaction.address}: ArmFailSafe failed because another administrator holds the fail-safe or a commissioning window is open; retry later`,
        );
    }
    throw new OperationalCertificateUpdateRefusedError(
        `Cannot update the operational certificate of ${interaction.address}: ArmFailSafe failed with ${commissioningErrorText(errorCode, debugText)}`,
    );
}

/**
 * Expire the fail-safe at once so the peer rolls back.  Failure is logged; it only delays the rollback until the
 * fail-safe expires.  Resolves to whether the peer confirmed the disarm.
 */
async function disarmFailsafe(interaction: ClientInteraction): Promise<boolean> {
    let failure: unknown;
    try {
        const { errorCode, debugText } = responseOf(
            await invokeSingleCommand(interaction, {
                endpoint: RootEndpointNumber,
                cluster: GeneralCommissioning,
                command: "armFailSafe",
                fields: { expiryLengthSeconds: 0, breadcrumb: 0 },
            }),
            "ArmFailSafe",
        );
        if (errorCode === GeneralCommissioning.CommissioningError.Ok) {
            return true;
        }
        failure = commissioningErrorText(errorCode, debugText);
    } catch (error) {
        failure = error;
    }
    logger.info(
        `Could not disarm the fail-safe of ${interaction.address}; it rolls back when the fail-safe expires:`,
        failure,
    );
    return false;
}

function commissioningErrorText(errorCode: GeneralCommissioning.CommissioningError, debugText?: string) {
    return `${GeneralCommissioning.CommissioningError[errorCode]} (${errorCode})${debugText ? `, ${debugText}` : ""}`;
}

/** A response command, which {@link invokeSingleCommand} omits when the peer answers with a bare success status. */
function responseOf<T>(response: T | undefined, command: string): T {
    if (response === undefined) {
        throw new UnexpectedDataError(`${command} was answered with a status instead of a response`);
    }
    return response;
}
