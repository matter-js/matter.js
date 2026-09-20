/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OtaProviderExchanges, OtaQueryImageExchange } from "@matter/testing";
import { expect } from "chai";
import {
    announcementLines,
    bdxImageUriFindings,
    blockSizeConforms,
    delayedActionTime,
    delayedActionTimeCheck,
    planDelayCoverageCheck,
    longRunningReason,
    hexByteLength,
    queryImageResponseLines,
    queryStatusName,
    singleApplyUpdate,
    singleQueryImage,
    unsupportedByDut,
} from "../cert/tc-su-support.js";
import { CertCheckFailedError } from "../cert/tc-support.js";

// The decimal form the API carries a node id in, and the hex form a BDX image URI renders it as
const NODE_ID = "5722633860078098523";
const NODE_ID_HEX = "4F6AE12D0993D85B";
const CONFORMING = `bdx://${NODE_ID_HEX}/ota/fff1.8001.test.2`;

describe("bdxImageUriFindings", () => {
    it("accepts the URI matter.js's own provider answers with", () => {
        expect(bdxImageUriFindings(CONFORMING, NODE_ID)).deep.equal([]);
    });

    it("rejects a scheme that is not lowercase bdx", () => {
        const findings = bdxImageUriFindings(`BDX://${NODE_ID_HEX}/ota/image`, NODE_ID);
        expect(findings).deep.equal(['it does not begin with the lowercase scheme "bdx://"']);
    });

    // The authority is what tells the requestor which node to download from, so a URI naming
    // another node would have it open a BDX transfer with a peer that staged nothing
    it("rejects an authority that is not the answering provider's node id", () => {
        const findings = bdxImageUriFindings(`bdx://0000000000000009/ota/image`, NODE_ID);
        expect(findings).length(1);
        expect(findings[0]).contains(`("${NODE_ID_HEX}")`);
    });

    it("rejects a node id that is not sixteen uppercase hex characters", () => {
        expect(bdxImageUriFindings(`bdx://${NODE_ID_HEX.toLowerCase()}/ota/image`, NODE_ID)).length(1);
        expect(bdxImageUriFindings("bdx://4F6AE12D0993D85/ota/image", NODE_ID)).length(1);
    });

    it("rejects a user section in the authority", () => {
        const findings = bdxImageUriFindings(`bdx://someone@${NODE_ID_HEX}/ota/image`, NODE_ID);
        expect(findings.some(finding => finding.includes("user section"))).equal(true);
    });

    it("rejects a query or a fragment", () => {
        expect(bdxImageUriFindings(`bdx://${NODE_ID_HEX}/ota/image?v=2`, NODE_ID)).deep.equal([
            "it carries a query field",
        ]);
        expect(bdxImageUriFindings(`bdx://${NODE_ID_HEX}/ota/image#top`, NODE_ID)).deep.equal([
            "it carries a fragment field",
        ]);
    });

    it("rejects a path naming no image", () => {
        expect(bdxImageUriFindings(`bdx://${NODE_ID_HEX}/x`, NODE_ID)).deep.equal([]);
        expect(bdxImageUriFindings(`bdx://${NODE_ID_HEX}/`, NODE_ID)).deep.equal([
            "it is 23 characters, where the plan requires 24 or more",
            "its path names no software image",
        ]);
    });

    // A requestor reads the download target out of the path; without one there is nothing to fetch
    it("rejects a URI with no path at all", () => {
        expect(bdxImageUriFindings(`bdx://${NODE_ID_HEX}`, NODE_ID)).deep.equal([
            "it is 22 characters, where the plan requires 24 or more",
            "it carries no path naming the software image",
        ]);
    });

    // A percent is legal only as the start of an escape, and both halves of that rule matter: a
    // complete escape must pass and a lone percent must not
    it("accepts a percent escape and rejects a percent that starts none", () => {
        expect(bdxImageUriFindings(`bdx://${NODE_ID_HEX}/ota/image%2Ebin`, NODE_ID)).deep.equal([]);
        expect(bdxImageUriFindings(`bdx://${NODE_ID_HEX}/ota/image%zz`, NODE_ID)).deep.equal([
            'its path carries characters a URI cannot hold ("%")',
        ]);
    });

    it("rejects a path carrying characters a URI cannot hold", () => {
        const findings = bdxImageUriFindings(`bdx://${NODE_ID_HEX}/ota/image file`, NODE_ID);
        expect(findings.some(finding => finding.includes("characters a URI cannot hold"))).equal(true);
    });

    // A URI can be wrong in more than one way at once, and a check naming only the first would send a
    // reader looking for one defect where there are two
    it("names every departure rather than the first", () => {
        const findings = bdxImageUriFindings(`bdx://someone@0000000000000009/image?v=2`, NODE_ID);
        expect(findings).deep.equal([
            'its authority carries a user section ("someone@0000000000000009")',
            `its authority is "someone@0000000000000009", not the provider's own node id as sixteen uppercase hex characters ("${NODE_ID_HEX}")`,
            "it carries a query field",
        ]);
    });
});

describe("singleQueryImage", () => {
    function exchanges(count: number): OtaProviderExchanges {
        const exchange = {
            request: { vendorId: 1, productId: 1, softwareVersion: 1, protocolsSupported: [0] },
            response: { status: 0 },
        } satisfies OtaQueryImageExchange;
        return {
            queryImage: new Array<OtaQueryImageExchange>(count).fill(exchange),
            applyUpdate: [],
            notifyUpdateApplied: [],
        };
    }

    it("answers the one exchange", () => {
        expect(singleQueryImage(exchanges(1)).response.status).equal(0);
    });

    // Reading the first of two would assert about a response the requestor may have discarded
    it("fails the step where the provider answered more than once, or not at all", () => {
        expect(() => singleQueryImage(exchanges(0))).to.throw(CertCheckFailedError, "answered 0 QueryImage");
        expect(() => singleQueryImage(exchanges(2))).to.throw(CertCheckFailedError, "answered 2 QueryImage");
    });
});

describe("blockSizeConforms", () => {
    // The plan's two rules, and the boundary between them
    it("requires the exact proposal between 16 and 128 bytes", () => {
        expect(blockSizeConforms(128, 128)).equal(true);
        expect(blockSizeConforms(128, 64)).equal(false);
        expect(blockSizeConforms(16, 16)).equal(true);
    });

    it("requires a power of two above 128 bytes", () => {
        expect(blockSizeConforms(1024, 1024)).equal(true);
        expect(blockSizeConforms(1024, 512)).equal(true);
        expect(blockSizeConforms(1024, 1000)).equal(false);
        expect(blockSizeConforms(129, 129)).equal(false);
    });

    it("never allows more than was proposed", () => {
        expect(blockSizeConforms(1024, 2048)).equal(false);
        expect(blockSizeConforms(64, 128)).equal(false);
    });

    // A transfer cannot run on either, so neither may read as a pass; zero in particular satisfies
    // the bitwise power-of-two test that first expressed this rule
    it("rejects a granted size of zero, a fraction, or one the wire field cannot carry", () => {
        expect(blockSizeConforms(1024, 0)).equal(false);
        expect(blockSizeConforms(1024, 512.5)).equal(false);
        expect(blockSizeConforms(0x20000, 0x10000)).equal(false);
    });

    // The plan states no rule below its own floor, so only the proposal bounds the grant there
    it("requires only that the grant fits the proposal below 16 bytes", () => {
        expect(blockSizeConforms(8, 4)).equal(true);
        expect(blockSizeConforms(8, 8)).equal(true);
        expect(blockSizeConforms(8, 9)).equal(false);
    });
});

describe("announcementLines", () => {
    const announcement = {
        providerNodeId: NODE_ID,
        vendorId: 0xfff1,
        announcementReason: 0,
        endpoint: 1,
    };

    // chip prints the node id as sixteen uppercase hex digits and matter.js as the decimal value, so
    // one record has to render two ways or one flavor's pattern never matches
    it("renders the node id the way each flavor's log does", () => {
        const lines = announcementLines(announcement);
        expect(lines.chip.ordered.some(pattern => pattern.source.includes(NODE_ID_HEX))).equal(true);
        expect(lines.matterjs[0].source).contains(`providerNodeId: ${NODE_ID}`);
    });

    it("names the reason by number for chip and by word for matter.js", () => {
        const lines = announcementLines(announcement);
        expect(lines.chip.ordered.some(pattern => pattern.source.includes("AnnouncementReason: 0"))).equal(true);
        expect(lines.matterjs[0].source).contains("announcementReason: SimpleAnnouncement");
    });
});

describe("unsupportedByDut", () => {
    // An empty body would report the step as passed having checked nothing, which is the failure this
    // exists to prevent: a run whose PICS says the DUT does send the field must fail loudly
    it("fails the step it is given to", async () => {
        try {
            await unsupportedByDut("an https image URI")();
            expect.fail("expected the step body to throw");
        } catch (e) {
            expect(e).instanceOf(CertCheckFailedError);
            expect((e as Error).message).contains("an https image URI");
        }
    });
});

describe("queryImageResponseLines", () => {
    // chip logs the token's length rather than its value, so a pattern built from the value would
    // never match the line the response actually produced
    it("names the update token's byte length, as chip's own log does", () => {
        const lines = queryImageResponseLines({ status: 0, updateToken: "00".repeat(32) });
        expect(lines.chip.ordered.some(pattern => pattern.source.includes("updateToken: 32"))).equal(true);
    });

    it("escapes the URI it matches, so its dots are not wildcards", () => {
        const lines = queryImageResponseLines({ status: 0, imageUri: CONFORMING });
        expect(lines.chip.ordered.some(pattern => pattern.source.includes("fff1\\.8001"))).equal(true);
    });

    it("names the software version and its string", () => {
        const lines = queryImageResponseLines({ status: 0, softwareVersion: 2, softwareVersionString: "2.0.0" });
        expect(lines.chip.ordered.some(pattern => pattern.source.includes("softwareVersion: 2"))).equal(true);
        expect(lines.chip.ordered.some(pattern => pattern.source.includes("softwareVersionString: 2\\.0\\.0"))).equal(
            true,
        );
    });

    // matter.js's requestor logs no line for a QueryImageResponse at all. A pattern matching what it
    // does next would match what the precondition already required, so the step would record a pass
    // it cannot fail
    it("states no matterjs pattern, whatever the response carried", () => {
        expect(queryImageResponseLines({ status: 2 }).matterjs).equal(undefined);
        expect(queryImageResponseLines({ status: 0, softwareVersion: 2, imageUri: CONFORMING }).matterjs).equal(
            undefined,
        );
    });
});

describe("singleApplyUpdate", () => {
    function withApplies(count: number): OtaProviderExchanges {
        const exchange = {
            request: { updateToken: "00".repeat(32), newVersion: 2 },
            response: { action: 0, delayedActionTime: 0 },
        };
        return {
            queryImage: [],
            applyUpdate: new Array<typeof exchange>(count).fill(exchange),
            notifyUpdateApplied: [],
        };
    }

    it("answers the one exchange, and names the command it could not settle", () => {
        expect(singleApplyUpdate(withApplies(1)).request.newVersion).equal(2);
        expect(() => singleApplyUpdate(withApplies(0))).to.throw(CertCheckFailedError, "answered 0 ApplyUpdateRequest");
    });
});

describe("delayedActionTime", () => {
    function withFastRetry<T>(enabled: boolean, body: () => T): T {
        const previous = process.env.MATTER_CERT_OTA_FAST_RETRY;
        const previousDevice = process.env.MATTER_CERT_DEVICE;
        if (enabled) {
            process.env.MATTER_CERT_OTA_FAST_RETRY = "1";
            process.env.MATTER_CERT_DEVICE = "matterjs";
        } else {
            delete process.env.MATTER_CERT_OTA_FAST_RETRY;
        }
        try {
            return body();
        } finally {
            // Captured and put back rather than deleted: either may have been set before this ran
            restore("MATTER_CERT_OTA_FAST_RETRY", previous);
            restore("MATTER_CERT_DEVICE", previousDevice);
        }
    }

    function restore(name: string, value: string | undefined) {
        if (value === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = value;
        }
    }

    // The plan's own number, which the daily run sends so its evidence is what the plan asks for
    it("names the plan's three minutes where the wait cannot be shortened", () => {
        withFastRetry(false, () => {
            expect(delayedActionTime()).equal(180);
            expect(longRunningReason("the wait")).contains("180s of real time");

            expect(delayedActionTimeCheck(180).verdict).equal("pass");
            expect(delayedActionTimeCheck(1).verdict).equal("fail");
            expect(planDelayCoverageCheck().verdict).equal("pass");
        });
    });

    // Above zero, so the answer still carries the field the step is about
    it("names a short stand-in where it can", () => {
        withFastRetry(true, () => {
            expect(delayedActionTime()).equal(1);
            expect(longRunningReason("the wait")).equal(undefined);
        });
    });

    // The plan's expected outcome is that the DUT sends three minutes, and a shortened run does not
    // ask for that — a claim about coverage, kept apart from the verdict below so neither can hide
    // the other
    it("states that a shortened run did not script the plan's own value", () => {
        withFastRetry(true, () => {
            const check = planDelayCoverageCheck();
            expect(check.verdict).equal("unverified");
            expect(check.accepted).contains("the plan's 180s");
        });
    });

    // A dropped or altered field is a defect of the DUT on any run, so this verdict never depends on
    // what the run shortened
    it("fails a value the DUT did not echo, shortened or not", () => {
        withFastRetry(true, () => {
            expect(delayedActionTimeCheck(1).verdict).equal("pass");
            expect(delayedActionTimeCheck(180).verdict).equal("fail");
            expect(delayedActionTimeCheck(undefined).verdict).equal("fail");
        });
    });
});

describe("hexByteLength and queryStatusName", () => {
    it("counts bytes rather than characters", () => {
        expect(hexByteLength("00".repeat(32))).equal(32);
    });

    it("names a status the cluster defines, and says so where it does not", () => {
        expect(queryStatusName(2)).equal("NotAvailable");
        expect(queryStatusName(9)).equal("unknown (9)");
    });
});
