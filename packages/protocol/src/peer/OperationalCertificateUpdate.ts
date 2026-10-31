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
import { EndpointNumber, FabricId, FabricIndex, StatusResponseError } from "@matter/types";
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
 * The node ID, fabric and fabric-scoped data on the peer stay unchanged.  The sequence:
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
 * | Situation                                      | Action and result                                   |
 * | ---------------------------------------------- | --------------------------------------------------- |
 * | Breadcrumb not 0, or unreadable, before arming | arm nothing; reject, the caller may retry later     |
 * | ArmFailSafe answered with an error code        | nothing armed; reject                               |
 * | a later step before UpdateNOC fails, or        | disarm over session 1; previous NOC kept            |
 * | UpdateNOC is refused                           |                                                     |
 * | after UpdateNOC, on a new CASE session         | read Breadcrumb and NOCs, then by the values read:  |
 * | - Breadcrumb ours, new NOC pending             | CommissioningComplete: OK → resolve; error code or  |
 * |                                                | status → disarm, report previous NOC; no answer →   |
 * |                                                | recovery                                            |
 * | - Breadcrumb ours, new NOC not pending         | disarm, report previous NOC                         |
 * | - Breadcrumb 0, NOCs lacks the new NOC         | send nothing; report previous NOC (fail-safe ended) |
 * | - anything else                                | disarm, then read again on another new session:     |
 * |                                                | 0 and old NOC → report previous NOC; 0 and new NOC  |
 * |                                                | after a confirmed disarm → resolve; else report the |
 * |                                                | outcome as unknown                                  |
 * | UpdateNOC unanswered; or after a confirmed     | recovery, once: the same read and decision on       |
 * | UpdateNOC no CASE session, or the read or      | another new CASE session; a failure there or an     |
 * | CommissioningComplete unanswered               | abort reports the outcome as unknown                |
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
 * of range, with the connection error when no CASE session can be established at the start, and with
 * {@link OperationalCertificateUpdateError} for every later failure.
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
        installed = await installNewCertificate(context, first, fabric.fabricId, failsafeArm);
    } finally {
        await first.interaction.close();
    }

    if (installed.kind === "refused") {
        if (installed.cause instanceof FailsafeRefusedError) {
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

        case "rolledBack":
            throw new OperationalCertificateUpdateError(
                completion.disarmed
                    ? `Updating the operational certificate of ${address} failed; it reverted to its previous certificate`
                    : `Updating the operational certificate of ${address} failed; it keeps its previous certificate once its fail-safe, armed for ${Duration.format(failsafe)}, expires`,
                { cause: completion.cause ?? cause },
            );

        case "reverted":
            throw new OperationalCertificateUpdateError(
                `Updating the operational certificate of ${address} failed; it reverted to its previous certificate`,
                { cause },
            );

        case "unknown":
            throw new OperationalCertificateUpdateError(
                `Updating the operational certificate of ${address} failed and its outcome is unknown; the peer reverts to its previous certificate when its fail-safe expires, unless this update or another operation of the same fabric completed that fail-safe`,
                { cause },
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
}

/**
 * Read Breadcrumb, then run ArmFailSafe, CertificateChainRequest, CSRRequest and UpdateNOC over {@link session}.  Does
 * not arm when Breadcrumb is not 0.  On a failure after arming and before UpdateNOC reached the peer, disarms the
 * fail-safe over the same session.
 */
async function installNewCertificate(
    { ca }: OperationalCertificateUpdateContext,
    { session, interaction }: AdministratorSession,
    fabricId: FabricId,
    failsafeArm: FailsafeArm,
): Promise<InstalledCertificate> {
    let breadcrumb: bigint;
    try {
        breadcrumb = await readBreadcrumb(interaction);
    } catch (cause) {
        return { kind: "refused", cause };
    }
    if (breadcrumb !== 0n) {
        return {
            kind: "refused",
            cause: new FailsafeRefusedError(
                `Cannot update the operational certificate of ${interaction.address}: its Breadcrumb is ${breadcrumb}, so another operation of the same fabric may hold the fail-safe; retry later`,
            ),
        };
    }

    let certificate: NewCertificate;
    try {
        await armFailsafe(interaction, failsafeArm);
    } catch (cause) {
        if (!(cause instanceof FailsafeRefusedError)) {
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
            nocValue: await ca.generateNoc(operationalPublicKey, fabricId, interaction.address.nodeId),
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
type Completion =
    | { kind: "completed" }
    | { kind: "rolledBack"; cause?: unknown; disarmed: boolean }
    | { kind: "reverted" }
    | { kind: "unknown" };

/**
 * Send CommissioningComplete over a new CASE session, but only after reading on that session this update's
 * Breadcrumb and the new NOC pending; see the table at {@link updateOperationalCertificate}.
 *
 * Rejects when the peer cannot be reached, the read fails or CommissioningComplete is not answered.
 */
async function completeUpdate(
    context: OperationalCertificateUpdateContext,
    address: PeerAddress,
    { nocValue }: NewCertificate,
    { breadcrumb }: FailsafeArm,
    options: { abort?: AbortSignal; connectionTimeout?: Duration },
): Promise<Completion> {
    await forgetSessions(context, address, "Operational certificate of the peer was updated");
    const completion = await withCase(
        context,
        address,
        options,
        async ({ interaction }): Promise<Completion | { kind: "disarmedForeign"; disarmed: boolean }> => {
            const state = await certificateState(interaction, nocValue);
            if (state.breadcrumb !== breadcrumb) {
                if (state.breadcrumb === 0n && state.holdsNoc === false) {
                    return { kind: "reverted" };
                }
                return { kind: "disarmedForeign", disarmed: await disarmFailsafe(interaction) };
            }
            if (state.holdsNoc !== true) {
                return { kind: "rolledBack", disarmed: await disarmFailsafe(interaction) };
            }

            const response = await commissioningComplete(interaction);
            if (response instanceof StatusResponseError) {
                return { kind: "rolledBack", cause: response, disarmed: await disarmFailsafe(interaction) };
            }
            const { errorCode, debugText } = response;
            if (errorCode === GeneralCommissioning.CommissioningError.Ok) {
                return { kind: "completed" };
            }
            return {
                kind: "rolledBack",
                cause: new OperationalCertificateUpdateError(
                    `CommissioningComplete failed with ${commissioningErrorText(errorCode, debugText)}`,
                ),
                disarmed: await disarmFailsafe(interaction),
            };
        },
    );

    if (completion.kind === "rolledBack") {
        await forgetSessions(context, address, "Peer reverted to its previous operational certificate");
    }
    if (completion.kind !== "disarmedForeign") {
        return completion;
    }

    await forgetSessions(context, address, "Peer may have reverted to its previous operational certificate");
    const state = await withCase(context, address, options, ({ interaction }) =>
        certificateState(interaction, nocValue),
    );
    if (state.breadcrumb === 0n && state.holdsNoc === false) {
        return { kind: "reverted" };
    }
    if (state.breadcrumb === 0n && state.holdsNoc === true && completion.disarmed) {
        return { kind: "completed" };
    }
    return { kind: "unknown" };
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

interface CertificateState {
    /** The Breadcrumb attribute, if the peer reported it. */
    breadcrumb?: bigint;

    /** Whether the NOCs attribute of the accessing fabric holds the new NOC, if the peer reported it. */
    holdsNoc?: boolean;
}

/** Read Breadcrumb; rejects when the peer does not report it. */
async function readBreadcrumb(interaction: ClientInteraction) {
    const { breadcrumb } = await certificateState(interaction);
    if (breadcrumb === undefined) {
        throw new UnexpectedDataError(`${interaction.address} reported no Breadcrumb value`);
    }
    return breadcrumb;
}

/** Read Breadcrumb, and with {@link nocValue} also the NOCs of the accessing fabric, in one request. */
async function certificateState(interaction: ClientInteraction, nocValue?: Bytes): Promise<CertificateState> {
    const state: CertificateState = {};
    const breadcrumbPath = Read.Attribute({
        endpoint: RootEndpointNumber,
        cluster: GeneralCommissioning,
        attributes: "breadcrumb",
    });
    const request =
        nocValue === undefined
            ? Read({ fabricFilter: true }, breadcrumbPath)
            : Read(
                  { fabricFilter: true },
                  breadcrumbPath,
                  Read.Attribute({ endpoint: RootEndpointNumber, cluster: OperationalCredentials, attributes: "nocs" }),
              );
    for await (const chunk of interaction.read(request)) {
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
            if (nocValue !== undefined && Array.isArray(value)) {
                state.holdsNoc = value.some(
                    entry => isObject(entry) && Bytes.isBytes(entry.noc) && Bytes.areEqual(entry.noc, nocValue),
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
    await peers.for(address).disconnect(new FabricChangedError(reason));
    await sessions.deleteResumptionRecord(address);
    environment.maybeGet(ClientSubscriptions)?.closeForPeer(address);
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

/** The update did not arm a fail-safe because the peer refused ArmFailSafe or Breadcrumb showed another operation. */
class FailsafeRefusedError extends OperationalCertificateUpdateError {}

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
    const reason =
        errorCode === GeneralCommissioning.CommissioningError.BusyWithOtherAdmin
            ? "another administrator holds the fail-safe or a commissioning window is open"
            : commissioningErrorText(errorCode, debugText);
    throw new FailsafeRefusedError(
        `Cannot update the operational certificate of ${interaction.address}: ArmFailSafe failed because ${reason}`,
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
