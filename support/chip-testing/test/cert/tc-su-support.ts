/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "@matter/model";
import type {
    CertNodeApi,
    CertNodeRef,
    CertStepContext,
    CheckRecord,
    OtaAnnouncementRecord,
    OtaApplyUpdateExchange,
    OtaProviderExchanges,
    OtaQueryImageExchange,
    OtaQueryImageResponseRecord,
} from "@matter/testing";
import { resolveDeviceFlavor } from "@matter/testing";
import { otaFastRetryEnabled } from "../../src/OtaRequestorTestInstance.js";
import { CertCheckFailedError, record, requireId } from "./tc-support.js";

/** `QueryStatus` of a `QueryImageResponse`, which the SU plans name by word (Matter Core § 11.20.6.6). */
export const OtaQueryStatus = {
    UpdateAvailable: 0,
    Busy: 1,
    NotAvailable: 2,
    DownloadProtocolNotSupported: 3,
} as const;

/** `Action` of an `ApplyUpdateResponse` (§ 11.20.6.10). */
export const OtaApplyAction = {
    Proceed: 0,
    AwaitNextAction: 1,
    Discontinue: 2,
} as const;

/** `DownloadProtocol`, as a `QueryImage`'s `ProtocolsSupported` lists them (§ 11.20.6.5). */
export const OtaDownloadProtocol = {
    BdxSynchronous: 0,
    BdxAsynchronous: 1,
    Https: 2,
    VendorSpecific: 3,
} as const;

/** The name a status number has in the cluster, for a check's own detail text. */
export function queryStatusName(status: number) {
    return nameOf(OtaQueryStatus, status);
}

/** The name an apply action has in the cluster, for a check's own detail text. */
export function applyActionName(action: number) {
    return nameOf(OtaApplyAction, action);
}

function nameOf(values: Record<string, number>, value: number) {
    for (const [name, candidate] of Object.entries(values)) {
        if (candidate === value) {
            return name;
        }
    }
    return `unknown (${value})`;
}

/**
 * The one `QueryImage` exchange a served update produced.
 *
 * A step asserting on "the response" has to be able to say there was one: a served update that
 * answered twice is a different exchange from the one the plan describes, and reading the first of
 * two would assert about a response the requestor may have discarded.
 */
export function singleQueryImage(exchanges: OtaProviderExchanges): OtaQueryImageExchange {
    return only(exchanges.queryImage, "QueryImage");
}

/** The one `ApplyUpdateRequest` exchange a served update produced, as {@link singleQueryImage}. */
export function singleApplyUpdate(exchanges: OtaProviderExchanges): OtaApplyUpdateExchange {
    return only(exchanges.applyUpdate, "ApplyUpdateRequest");
}

function only<T>(exchanges: T[], what: string): T {
    if (exchanges.length !== 1) {
        throw new CertCheckFailedError(
            `the DUT's provider answered ${exchanges.length} ${what} commands during this update, and this step is ` +
                "about the one the plan describes",
        );
    }
    return exchanges[0];
}

/** Byte length of a hex-rendered field, which is what the plan's size rules are about. */
export function hexByteLength(hex: string) {
    return hex.length / 2;
}

/**
 * What each flavor's requestor writes for a `QueryImageResponse` it received.
 *
 * chip's `DefaultOTARequestor` prints the response field by field under `[SWU]`
 * (`LogQueryImageResponse`), including the update token's *length* rather than its value. matter.js's
 * requestor logs no line for the response itself, so its own account is the download it then ran.
 *
 * Ordered rather than adjacent on both: chip interleaves the fields with nothing, but matter.js puts
 * its own work between the lines it writes.
 */
export function queryImageResponseLines(response: OtaQueryImageResponseRecord) {
    const chip = [/\[SWU\] QueryImageResponse:\s*$/, new RegExp(`\\[SWU\\]\\s+status: ${response.status}\\s*$`)];

    if (response.imageUri !== undefined) {
        chip.push(new RegExp(`\\[SWU\\]\\s+imageURI: ${escapeForPattern(response.imageUri)}\\s*$`));
    }
    if (response.softwareVersion !== undefined) {
        chip.push(new RegExp(`\\[SWU\\]\\s+softwareVersion: ${response.softwareVersion}\\s*$`));
    }
    if (response.softwareVersionString !== undefined) {
        chip.push(
            new RegExp(`\\[SWU\\]\\s+softwareVersionString: ${escapeForPattern(response.softwareVersionString)}\\s*$`),
        );
    }
    if (response.updateToken !== undefined) {
        chip.push(new RegExp(`\\[SWU\\]\\s+updateToken: ${hexByteLength(response.updateToken)}\\s*$`));
    }

    return {
        chip: { ordered: chip },

        // No matterjs pattern, and none is possible: its requestor writes no line for a
        // QueryImageResponse at all. A pattern matching what it does next would be matching what the
        // precondition already required, so the step would record a pass it cannot fail.
        matterjs: undefined,
    };
}

/** A literal that goes into a `RegExp`, with the characters a pattern would otherwise read escaped. */
export function escapeForPattern(literal: string) {
    return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Every way `uri` departs from the BDX image URI the plan describes (§ 11.20.3.3.1, TC-SU-3.2 step 3),
 * empty where it conforms.
 *
 * Reported as a list rather than a boolean because a URI can be wrong in more than one way at once,
 * and a check naming only the first would send a reader looking for one defect where there are two.
 */
export function bdxImageUriFindings(uri: string, providerNodeId: CertNodeRef): string[] {
    // The URI's own rendering of the node id, which is the only place it appears in this form
    const expectedAuthority = BigInt(providerNodeId).toString(16).toUpperCase().padStart(16, "0");

    const findings = new Array<string>();

    if (!uri.startsWith("bdx://")) {
        findings.push(`it does not begin with the lowercase scheme "bdx://"`);

        // Everything below reads the parts of a bdx URI, which this is not
        return findings;
    }

    if (uri.length < 24) {
        findings.push(`it is ${uri.length} characters, where the plan requires 24 or more`);
    }

    const rest = uri.slice("bdx://".length);
    const pathStart = rest.indexOf("/");
    if (pathStart < 0) {
        findings.push("it carries no path naming the software image");
        return findings;
    }

    const authority = rest.slice(0, pathStart);
    const pathAndBeyond = rest.slice(pathStart);

    // Split off what a URI's own grammar separates, so a query field is reported as a query field
    // rather than a second time as a character the path cannot hold
    const path = pathAndBeyond.split(/[?#]/, 1)[0];

    if (authority.includes("@")) {
        findings.push(`its authority carries a user section ("${authority}")`);
    }

    if (authority !== expectedAuthority) {
        findings.push(
            `its authority is "${authority}", not the provider's own node id as sixteen uppercase hex ` +
                `characters ("${expectedAuthority}")`,
        );
    }

    if (pathAndBeyond.includes("?")) {
        findings.push("it carries a query field");
    }
    if (pathAndBeyond.includes("#")) {
        findings.push("it carries a fragment field");
    }
    if (path === "/") {
        findings.push("its path names no software image");
    }

    // Unreserved, sub-delims and the path-legal delimiters of RFC 3986's `path-absolute`. A percent
    // is legal only as the start of an escape, so it is matched with the two digits that complete it
    // and a lone one is left behind for the report.
    const illegal = path.replace(/%[0-9A-Fa-f]{2}|[A-Za-z0-9\-._~!$&'()*+,;=:@/]/g, "");
    if (illegal.length > 0) {
        findings.push(`its path carries characters a URI cannot hold ("${illegal}")`);
    }

    return findings;
}

/** `AnnouncementReason` of an `AnnounceOTAProvider` (Matter Core § 11.20.7.6). */
export const OtaAnnouncementReason = {
    SimpleAnnouncement: 0,
    UpdateAvailable: 1,
    UrgentUpdateAvailable: 2,
} as const;

/** The name an announcement reason has in the cluster, for a check's own detail text. */
export function announcementReasonName(reason: number) {
    return nameOf(OtaAnnouncementReason, reason);
}

/**
 * What each flavor's requestor writes for an `AnnounceOTAProvider` it received.
 *
 * chip's `DefaultOTARequestor` prints the command's own fields under `[SWU]`, matter.js names the
 * whole command and every field on one line. So chip's is an ordered run and matter.js's is a single
 * pattern built from the same record, and neither is a translation of the other.
 */
export function announcementLines(announcement: OtaAnnouncementRecord) {
    const nodeId = BigInt(announcement.providerNodeId);

    return {
        chip: {
            ordered: [
                /\[SWU\] OTA Requestor received AnnounceOTAProvider\s*$/,
                new RegExp(
                    `\\[SWU\\]\\s+ProviderNodeID: 0x${nodeId.toString(16).toUpperCase().padStart(16, "0")}\\s*$`,
                ),
                new RegExp(`\\[SWU\\]\\s+VendorID: 0x${announcement.vendorId.toString(16)}\\s*$`),
                new RegExp(`\\[SWU\\]\\s+AnnouncementReason: ${announcement.announcementReason}\\s*$`),
                new RegExp(`\\[SWU\\]\\s+Endpoint: ${announcement.endpoint}\\s*$`),
            ],
        },
        matterjs: [
            new RegExp(
                "OTA Provider announcement received: announcementReason: " +
                    `${announcementReasonName(announcement.announcementReason)} fabricIndex: \\d+ ` +
                    `providerNodeId: ${nodeId} endpoint: ${announcement.endpoint} ` +
                    `vendorId: ${announcement.vendorId}`,
            ),
        ],
    };
}

/** Smallest Max Block Size the plan requires a provider to grant over a non-TCP transport. */
export const MIN_NON_TCP_BLOCK_SIZE = 1024;

/** Above this, the plan requires the granted size to be a power of two (Matter Core § 11.20.3.5). */
export const EXACT_BLOCK_SIZE_CEILING = 128;

/** The plan's smallest size a receiver may name and expect back unchanged. */
export const EXACT_BLOCK_SIZE_FLOOR = 16;

/** A BDX Max Block Size is a 16-bit field (§ 11.22.5.1), so nothing above this can go on the wire. */
const MAX_BLOCK_SIZE_CEILING = 0xffff;

/**
 * Whether the size a provider granted follows the plan's rule for the size the receiver proposed.
 *
 * The rule has three parts and they do not overlap: a granted size must never exceed the proposal, a
 * proposal of 16 to 128 bytes is granted exactly, and a larger one is granted a power of two. A
 * granted size of zero, or one outside the field's own range, conforms to none of them — the plan
 * does not say so because a transfer cannot run on it, which is exactly why it must not read as a
 * pass here.
 */
export function blockSizeConforms(proposed: number, granted: number) {
    if (!Number.isInteger(granted) || granted < 1 || granted > MAX_BLOCK_SIZE_CEILING || granted > proposed) {
        return false;
    }

    if (proposed > EXACT_BLOCK_SIZE_CEILING) {
        return isPowerOfTwo(granted);
    }

    // Below the plan's floor it states no rule of its own, so a granted size no larger than the
    // proposal is all there is to require, and that is already settled above.
    return proposed < EXACT_BLOCK_SIZE_FLOOR || granted === proposed;
}

function isPowerOfTwo(value: number) {
    return Number.isInteger(Math.log2(value));
}

/**
 * A step body for a plan step whose PICS gate says the DUT does not do the thing the step is about.
 *
 * Two reasons keep a step in this directory from running, and each has one spelling: a capability the
 * *DUT* lacks is a `pics` gate, and a scenario the *harness* cannot stage is `notApplicable`. A step
 * gated on PICS still needs a body, because a run whose PICS answer `1` must fail loudly rather than
 * report a pass having checked nothing — an empty body does exactly that (`cert-test.ts` passes any
 * step that runs without throwing).
 */
export function unsupportedByDut(capability: string) {
    return async () => {
        throw new CertCheckFailedError(
            `this step needs ${capability}, which this DUT's own PICS says it does not send; the run's PICS ` +
                "answered otherwise, so either the declaration or the DUT has changed",
        );
    };
}

/**
 * Whether the TH's own retry intervals are shortened for this run.
 *
 * The plan steps about a delayed provider answer assert on the *provider's* fields; the wait that
 * follows is the TH's, and nothing about it is the DUT's behaviour. `OtaRequestorTestInstance` can
 * lower its two-minute floors, so where it is the TH and the run asked for it, such a step costs no
 * real time. chip's requestor floors the wait at compile time, so there it costs what the plan costs.
 */
export function otaDelaysShortened() {
    return otaFastRetryEnabled() && resolveDeviceFlavor() === "matterjs";
}

/** The plan's own `DelayedActionTime`, in seconds, or the short stand-in a shortened run uses. */
export function delayedActionTime() {
    return otaDelaysShortened() ? SHORT_DELAYED_ACTION_TIME : PLAN_DELAYED_ACTION_TIME;
}

/** What the plans name wherever they ask a provider to defer: three minutes. */
const PLAN_DELAYED_ACTION_TIME = 180;

/**
 * What a shortened run names instead.
 *
 * Above zero, so the answer still carries the field the step is about, and below the TH's own lowered
 * floor, so the wait is the floor rather than this.
 */
const SHORT_DELAYED_ACTION_TIME = 1;

/**
 * Whether the DUT echoed the `DelayedActionTime` the case scripted.
 *
 * Always a pass or a fail, whatever the run shortened: a dropped or altered field is a defect of the
 * DUT on any run. What changes with the shortening is *which* value was scripted, and that is
 * {@link planDelayCoverageCheck}'s claim rather than this one's.
 */
export function delayedActionTimeCheck(sent: number | undefined): CheckRecord {
    const asked = delayedActionTime();
    return {
        type: "response",
        verdict: sent === asked ? "pass" : "fail",
        detail: `the DUT answered DelayedActionTime ${sent}s, against the ${asked}s the case scripted`,
    };
}

/**
 * Whether the value the case scripted was the one the plan names.
 *
 * The plans' expected outcome is that the DUT sends three minutes. A shortened run scripts one second
 * so the TH's wait is short, which leaves that outcome untested — stated here rather than folded into
 * the check above, where a verdict that changed with an environment variable could not fail at all.
 */
export function planDelayCoverageCheck(): CheckRecord {
    if (!otaDelaysShortened()) {
        return {
            type: "response",
            verdict: "pass",
            detail: `the case scripted the plan's ${PLAN_DELAYED_ACTION_TIME}s`,
        };
    }

    return {
        type: "response",
        verdict: "unverified",
        accepted:
            `this run shortened the TH's retry intervals and scripted ${SHORT_DELAYED_ACTION_TIME}s rather than ` +
            `the plan's ${PLAN_DELAYED_ACTION_TIME}s, so the plan's own value is not what the DUT was asked for ` +
            "here; the run that sets MATTER_CERT_LONG_RUNNING scripts it and tests it",
    };
}

/** The reason a step carries when this run cannot shorten the wait it costs. */
export function longRunningReason(what: string) {
    return otaDelaysShortened()
        ? undefined
        : `${what} costs the plan's ${PLAN_DELAYED_ACTION_TIME}s of real time on this flavor`;
}

const OTA_REQUESTOR = Matter.clusters.require("OtaSoftwareUpdateRequestor");
const OTA_REQUESTOR_ID = requireId(OTA_REQUESTOR.id, "OtaSoftwareUpdateRequestor cluster");
const UPDATE_STATE_ID = requireId(OTA_REQUESTOR.attributes.require("updateState").id, "UpdateState attribute");

/** `UpdateState` Idle (Matter Core § 11.20.7.5.3), the state the plans' Test Setup requires. */
const UPDATE_STATE_IDLE = 1;

/**
 * Records the Test Setup every requestor plan shares: "reading the UpdateState Attribute of the OTA
 * Requestor should return the value as Idle".
 *
 * Read on every endpoint, because the two requestors this suite runs carry the cluster on different
 * ones, and a requestor carrying it twice would leave "the" UpdateState undefined.
 */
export async function recordRequestorIdle(cx: CertStepContext, node: CertNodeApi) {
    const entries = await node.readAttributes([{ cluster: OTA_REQUESTOR_ID, attribute: UPDATE_STATE_ID }]);
    const states = entries.map(({ endpoint, value }) => `${value} on endpoint ${endpoint}`);

    record(
        cx,
        {
            type: "response",
            verdict: entries.length === 1 && entries[0].value === UPDATE_STATE_IDLE ? "pass" : "fail",
            detail: `the DUT reported UpdateState ${states.join(", ") || "on no endpoint"}, where Idle is ${UPDATE_STATE_IDLE}`,
        },
        "the DUT's OTA requestor is Idle",
    );
}
