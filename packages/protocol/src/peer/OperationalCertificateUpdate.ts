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

/** Time added to the fail-safe before the peer is assumed to have rolled back an unconfirmed update. */
const FAILSAFE_EXPIRY_MARGIN = Seconds(10);

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

    /** Aborts waiting for the first CASE session with the peer. */
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
 * Failure handling:
 *
 * | Failure                             | Action                                                                  |
 * | ----------------------------------- | ----------------------------------------------------------------------- |
 * | UpdateNOC not reached or refused    | disarm the fail-safe over session 1; the peer keeps its previous NOC    |
 * | UpdateNOC unanswered, or a failure  | disarm over a new session; once the disarm is confirmed, or once the    |
 * | after it                            | armed fail-safe has certainly expired, read the NOCs attribute to learn |
 * |                                     | which NOC the peer kept; resolve if it kept the new one                 |
 *
 * The NOCs attribute shows a pending NOC while the fail-safe is armed (§ 11.18.6.9), so it is read only once the
 * peer's state is final.
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

    let installed: InstalledCertificate;
    try {
        installed = await installNewCertificate(context, first, fabric.fabricId, failsafe);
    } finally {
        await first.interaction.close();
    }
    // The peer armed the fail-safe before it answered ArmFailSafe, so it expires before this
    const failsafeExpiredAt = Time.nowUs + failsafe + FAILSAFE_EXPIRY_MARGIN;

    if (installed.kind === "refused") {
        if (installed.cause instanceof FailsafeRefusedError) {
            throw installed.cause;
        }
        throw new OperationalCertificateUpdateError(
            `Updating the operational certificate of ${address} failed; it keeps its previous certificate`,
            { cause: installed.cause },
        );
    }

    if (installed.kind === "unconfirmed") {
        return await settle(context, address, installed, failsafeExpiredAt, installed.cause);
    }

    await forgetSessions(context, address, "Operational certificate of the peer was updated");

    try {
        await withCase(
            context,
            address,
            { connectionTimeout: Millis(Math.max(failsafeLeft() - COMMISSIONING_COMPLETE_MARGIN, 0)) },
            async ({ interaction }) => {
                const { errorCode, debugText } = responseOf(
                    await invokeSingleCommand(
                        interaction,
                        {
                            endpoint: RootEndpointNumber,
                            cluster: GeneralCommissioning,
                            command: "commissioningComplete",
                        },
                        { useExtendedFailSafeMessageResponseTimeout: true },
                    ),
                    "CommissioningComplete",
                );
                if (errorCode !== GeneralCommissioning.CommissioningError.Ok) {
                    throw new OperationalCertificateUpdateError(
                        `CommissioningComplete failed with ${commissioningErrorText(errorCode, debugText)}`,
                    );
                }
            },
        );
    } catch (error) {
        return await settle(context, address, installed, failsafeExpiredAt, error);
    }

    logger.info("Updated operational certificate of", address.toString());

    return { fabricIndexOnPeer: installed.fabricIndexOnPeer, operationalPublicKey: installed.operationalPublicKey };
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
 * Run ArmFailSafe, CertificateChainRequest, CSRRequest and UpdateNOC over {@link session}.  On a failure before
 * UpdateNOC reached the peer, disarms the fail-safe over the same session.
 */
async function installNewCertificate(
    { ca }: OperationalCertificateUpdateContext,
    { session, interaction }: AdministratorSession,
    fabricId: FabricId,
    failsafe: Duration,
): Promise<InstalledCertificate> {
    let certificate: NewCertificate;
    try {
        await armFailsafe(interaction, failsafe);
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

/**
 * Bring a peer whose UpdateNOC may have taken effect to a final state and report it.
 *
 * A confirmed disarm makes the state final: it reverts a pending update and does nothing once CommissioningComplete
 * went through.  Without a confirmed disarm the state is final once the armed fail-safe has expired, at
 * {@link failsafeExpiredAt} on the {@link Time.nowUs} clock.  The NOCs attribute then shows which certificate the peer
 * kept.
 */
async function settle(
    context: OperationalCertificateUpdateContext,
    address: PeerAddress,
    { nocValue, operationalPublicKey }: NewCertificate,
    failsafeExpiredAt: number,
    cause: unknown,
): Promise<OperationalCertificateUpdateResult> {
    let kept: boolean;
    try {
        await forgetSessions(context, address, "Operational certificate update of the peer failed");
        let disarmed = false;
        try {
            disarmed = await withCase(context, address, {}, ({ interaction }) => disarmFailsafe(interaction));
        } catch (error) {
            logger.info(`Could not reach ${address} to disarm its fail-safe:`, error);
        }

        // A rollback ends the fabric's sessions without notice, and the disarm answer may be lost with them
        await forgetSessions(context, address, "Peer may have reverted to its previous operational certificate");

        if (!disarmed) {
            const wait = Math.ceil(failsafeExpiredAt - Time.nowUs);
            if (wait > 0) {
                logger.info(
                    `Waiting ${Duration.format(Millis(wait))} for the fail-safe of ${address} to expire before reading its certificate`,
                );
                await Time.sleep("operational certificate rollback", Millis(wait));
            }
            await forgetSessions(context, address, "Fail-safe of the peer expired");
        }

        kept = await withCase(context, address, {}, ({ interaction }) => holdsNoc(interaction, nocValue));
    } catch (error) {
        logger.info(`Could not determine the operational certificate of ${address} after a failed update:`, error);
        throw new OperationalCertificateUpdateError(
            `Updating the operational certificate of ${address} failed and its outcome is unknown; the peer reverts to its previous certificate when its fail-safe expires unless CommissioningComplete reached it`,
            { cause },
        );
    }

    if (kept) {
        logger.info("Updated operational certificate of", address.toString(), "although a confirmation was lost");
        return { operationalPublicKey };
    }

    throw new OperationalCertificateUpdateError(
        `Updating the operational certificate of ${address} failed; it reverted to its previous certificate`,
        { cause },
    );
}

/** Whether the NOCs attribute of the accessing fabric holds {@link nocValue}. */
async function holdsNoc(interaction: ClientInteraction, nocValue: Bytes) {
    for await (const chunk of interaction.read(
        Read(
            { fabricFilter: true },
            Read.Attribute({ endpoint: RootEndpointNumber, cluster: OperationalCredentials, attributes: "nocs" }),
        ),
    )) {
        for await (const report of chunk) {
            if (report.kind !== "attr-value") {
                continue;
            }
            const nocs = report.value;
            if (
                Array.isArray(nocs) &&
                nocs.some(entry => isObject(entry) && Bytes.isBytes(entry.noc) && Bytes.areEqual(entry.noc, nocValue))
            ) {
                return true;
            }
        }
    }
    return false;
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
    options: { connectionTimeout?: Duration },
    fn: (session: AdministratorSession) => Promise<T>,
) {
    const session = await connectCase(context, address, options);
    try {
        return await fn(session);
    } finally {
        await session.interaction.close();
    }
}

/** The peer answered ArmFailSafe with an error code, so no fail-safe was armed for us. */
class FailsafeRefusedError extends OperationalCertificateUpdateError {}

async function armFailsafe(interaction: ClientInteraction, failsafe: Duration) {
    const { errorCode, debugText } = responseOf(
        await invokeSingleCommand(interaction, {
            endpoint: RootEndpointNumber,
            cluster: GeneralCommissioning,
            command: "armFailSafe",
            fields: { expiryLengthSeconds: Math.ceil(Seconds.of(failsafe)), breadcrumb: 0 },
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
 * Expire the fail-safe at once so the peer rolls back.  Returns whether the peer confirmed.  Failure only delays the
 * rollback until the fail-safe expires.
 */
async function disarmFailsafe(interaction: ClientInteraction) {
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
