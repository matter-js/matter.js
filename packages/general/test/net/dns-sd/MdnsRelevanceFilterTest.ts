/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AAAARecord,
    ARecord,
    DnsCodec,
    DnsMessageType,
    DnsRecord,
    DnsRecordClass,
    DnsRecordType,
    MdnsRelevanceFilter,
    PtrRecord,
    SrvRecord,
    TxtRecord,
} from "#index.js";

/** Encode a query packet for a single name. */
function query(name: string, recordType = DnsRecordType.PTR) {
    return DnsCodec.encode({
        messageType: DnsMessageType.Query,
        queries: [{ name, recordType, recordClass: DnsRecordClass.IN, uniCastResponse: false }],
    });
}

/** Encode a response packet from the given answer records. */
function response(...answers: DnsRecord[]) {
    return DnsCodec.encode({ messageType: DnsMessageType.Response, answers });
}

const OWNER = "test";

describe("MdnsRelevanceFilter", () => {
    let filter: MdnsRelevanceFilter;

    beforeEach(() => {
        filter = new MdnsRelevanceFilter();
    });

    describe("activation", () => {
        it("accepts everything when no owner has registered", () => {
            expect(filter.isRelevant(query("_googlecast._tcp.local"))).true;
            expect(filter.isRelevant(response(ARecord("anything.local", "1.2.3.4")))).true;
        });

        it("becomes active once an owner registers a concrete name", () => {
            filter.registerRelevantNames(OWNER, ["_matter._tcp.local"]);
            expect(filter.isRelevant(query("_matter._tcp.local"))).true;
            expect(filter.isRelevant(query("_googlecast._tcp.local"))).false;
        });

        it('an "all" owner disables filtering (accept everything)', () => {
            filter.registerRelevantNames(OWNER, "all");
            expect(filter.isRelevant(query("_googlecast._tcp.local"))).true;
        });

        it('an "all" owner overrides another owner\'s concrete footprints', () => {
            filter.registerRelevantNames("concrete", ["_matter._tcp.local"]);
            filter.registerRelevantNames("generic", "all");
            expect(filter.isRelevant(query("_googlecast._tcp.local"))).true;
        });

        it("treats a registration of only stoplist-folding names as inactive", () => {
            // "local" and "_tcp.local" reduce to no footprint -> owner contributes nothing -> accept all
            filter.registerRelevantNames(OWNER, ["local", "_tcp.local"]);
            expect(filter.isRelevant(query("_googlecast._tcp.local"))).true;
        });

        it("reverts to accept-all after the last owner unregisters", () => {
            filter.registerRelevantNames(OWNER, ["_matter._tcp.local"]);
            expect(filter.isRelevant(query("_googlecast._tcp.local"))).false;
            filter.unregisterRelevantNames(OWNER);
            expect(filter.isRelevant(query("_googlecast._tcp.local"))).true;
        });

        it("ignores unregistering an unknown owner", () => {
            filter.registerRelevantNames(OWNER, ["_matter._tcp.local"]);
            filter.unregisterRelevantNames("never-registered");
            // still active and correct
            expect(filter.isRelevant(query("_matter._tcp.local"))).true;
            expect(filter.isRelevant(query("_googlecast._tcp.local"))).false;
        });
    });

    describe("footprint derivation (rightmost non-stoplist label)", () => {
        beforeEach(() => {
            filter.registerRelevantNames(OWNER, ["_matter._tcp.local", "_matterc._udp.local"]);
        });

        it("matches the bare service type", () => {
            expect(filter.isRelevant(query("_matter._tcp.local"))).true;
        });

        it("matches an instance of the service type", () => {
            expect(filter.isRelevant(query("8C1F64C7E2A40C9B-3DB2B46355FE8C6B._matter._tcp.local"))).true;
        });

        it("matches a commissioning subtype (collapses via _sub to the service label)", () => {
            expect(filter.isRelevant(query("_L840._sub._matterc._udp.local"))).true;
        });

        it("does not match an unrelated service type", () => {
            expect(filter.isRelevant(query("_spotify-connect._tcp.local"))).false;
        });

        it("matches a registered bare hostname", () => {
            filter.registerRelevantNames("host", ["68ec8a0d7fe80000.local"]);
            expect(filter.isRelevant(response(AAAARecord("68EC8A0D7FE80000.local", "fe80::1")))).true;
        });
    });

    describe("case-insensitivity (RFC 4343)", () => {
        it("matches a packet whose labels use different case than the registration", () => {
            filter.registerRelevantNames(OWNER, ["_matter._tcp.local"]);
            expect(filter.isRelevant(query("_MATTER._TCP.LOCAL"))).true;
        });

        it("matches when the registration is upper-case and the packet is lower-case", () => {
            filter.registerRelevantNames(OWNER, ["_MATTER._TCP.LOCAL"]);
            expect(filter.isRelevant(query("_matter._tcp.local"))).true;
        });
    });

    describe("incremental add / remove", () => {
        beforeEach(() => {
            // keep the gate active independent of the tracked names under test
            filter.registerRelevantNames("filters", ["_matter._tcp.local"]);
        });

        it("matches after addRelevantName and stops after removeRelevantName", () => {
            const pkt = () => response(AAAARecord("68EC8A0D7FE80000.local", "fe80::1"));
            expect(filter.isRelevant(pkt())).false;

            filter.addRelevantName("tracked", "68ec8a0d7fe80000.local");
            expect(filter.isRelevant(pkt())).true;

            filter.removeRelevantName("tracked", "68ec8a0d7fe80000.local");
            expect(filter.isRelevant(pkt())).false;
        });

        it("reference-counts a footprint added twice (within an owner)", () => {
            const pkt = () => response(AAAARecord("dup.local", "fe80::1"));
            filter.addRelevantName("tracked", "dup.local");
            filter.addRelevantName("tracked", "dup.local");

            filter.removeRelevantName("tracked", "dup.local");
            expect(filter.isRelevant(pkt())).true; // still one reference

            filter.removeRelevantName("tracked", "dup.local");
            expect(filter.isRelevant(pkt())).false; // last reference gone
        });

        it("tolerates removing a name that was never added", () => {
            filter.removeRelevantName("tracked", "absent.local");
            expect(filter.isRelevant(response(AAAARecord("absent.local", "fe80::1")))).false;
            // gate otherwise intact
            expect(filter.isRelevant(query("_matter._tcp.local"))).true;
        });

        it('ignores addRelevantName on an "all" owner (no corruption)', () => {
            filter.registerRelevantNames("generic", "all");
            filter.addRelevantName("generic", "ignored.local");
            // switching the owner to concrete must start fresh, without the ignored name
            filter.registerRelevantNames("generic", ["_matterc._udp.local"]);
            expect(filter.isRelevant(response(AAAARecord("ignored.local", "fe80::1")))).false;
            expect(filter.isRelevant(query("_matterc._udp.local"))).true;
        });
    });

    describe("multi-owner reference counting", () => {
        it("keeps a shared footprint until the last owner releases it", () => {
            filter.registerRelevantNames("a", ["_matter._tcp.local"]);
            filter.registerRelevantNames("b", ["_matter._tcp.local"]);

            filter.unregisterRelevantNames("a");
            expect(filter.isRelevant(query("_matter._tcp.local"))).true; // b still holds it

            filter.unregisterRelevantNames("b");
            expect(filter.isRelevant(query("_matter._tcp.local"))).true; // no owners -> accept all
            expect(filter.isRelevant(query("_googlecast._tcp.local"))).true;
        });

        it("unions footprints from different owners", () => {
            filter.registerRelevantNames("a", ["_matter._tcp.local"]);
            filter.registerRelevantNames("b", ["_meshcop._udp.local"]);
            expect(filter.isRelevant(query("_matter._tcp.local"))).true;
            expect(filter.isRelevant(query("_meshcop._udp.local"))).true;
            expect(filter.isRelevant(query("_googlecast._tcp.local"))).false;
        });
    });

    describe("register replace semantics", () => {
        it("replaces an owner's previous concrete set", () => {
            filter.registerRelevantNames(OWNER, ["_matter._tcp.local"]);
            filter.registerRelevantNames(OWNER, ["_meshcop._udp.local"]);
            expect(filter.isRelevant(query("_matter._tcp.local"))).false; // replaced away
            expect(filter.isRelevant(query("_meshcop._udp.local"))).true;
        });

        it('transitions an owner from "all" to concrete (re-enables the gate)', () => {
            filter.registerRelevantNames(OWNER, "all");
            expect(filter.isRelevant(query("_googlecast._tcp.local"))).true;
            filter.registerRelevantNames(OWNER, ["_matter._tcp.local"]);
            expect(filter.isRelevant(query("_googlecast._tcp.local"))).false;
            expect(filter.isRelevant(query("_matter._tcp.local"))).true;
        });

        it('transitions an owner from concrete to "all" (disables the gate)', () => {
            filter.registerRelevantNames(OWNER, ["_matter._tcp.local"]);
            filter.registerRelevantNames(OWNER, "all");
            expect(filter.isRelevant(query("_googlecast._tcp.local"))).true;
        });
    });

    describe("packet structure walking", () => {
        beforeEach(() => {
            filter.registerRelevantNames(OWNER, ["_matter._tcp.local"]);
        });

        it("scans question names", () => {
            expect(filter.isRelevant(query("_matter._tcp.local"))).true;
        });

        it("scans answer names after a non-matching first record", () => {
            const pkt = response(
                PtrRecord("_googlecast._tcp.local", "x._googlecast._tcp.local"),
                PtrRecord("_matter._tcp.local", "y._matter._tcp.local"),
            );
            expect(filter.isRelevant(pkt)).true;
        });

        it("skips RDATA — a footprint only inside record data does not match", () => {
            filter.registerRelevantNames("host", ["a.local"]);
            // SRV for an unrelated name whose RDATA target is a.local; a.local appears only in RDATA here
            const pkt = response(
                SrvRecord("unrelated._x._tcp.local", { priority: 0, weight: 0, port: 1, target: "a.local" }),
            );
            // The record name "unrelated._x._tcp.local" folds to "_x" (not registered); a.local is only in RDATA.
            expect(filter.isRelevant(pkt)).false;
        });

        it("correctly advances past A/AAAA/TXT records to a later matching name", () => {
            const pkt = response(
                ARecord("first.local", "1.2.3.4"),
                AAAARecord("second.local", "fe80::2"),
                TxtRecord("third.local", ["k=v", "kk=vv"]),
                PtrRecord("_matter._tcp.local", "inst._matter._tcp.local"),
            );
            expect(filter.isRelevant(pkt)).true;
        });
    });

    describe("compression pointers", () => {
        beforeEach(() => {
            filter.registerRelevantNames(OWNER, ["_matter._tcp.local"]);
        });

        it("follows a pointer to a footprint reachable only via the pointer", () => {
            // Answer #1 (TXT, name x.local) carries the literal labels "_matter._tcp.local" in its RDATA at offset 31;
            // answer #2's name is a compression pointer to that RDATA. The only literal "_matter" is in skipped RDATA.
            // prettier-ignore
            const raw = Uint8Array.from([
                0x00, 0x00, 0x84, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, // header: response, 2 answers
                0x01, 0x78, 0x05, 0x6c, 0x6f, 0x63, 0x61, 0x6c, 0x00, // "x.local"
                0x00, 0x10, 0x00, 0x01, 0x00, 0x00, 0x00, 0x78, 0x00, 0x14, // TXT, IN, ttl, rdlength=20
                0x07, 0x5f, 0x6d, 0x61, 0x74, 0x74, 0x65, 0x72, // RDATA @31: "_matter"
                0x04, 0x5f, 0x74, 0x63, 0x70, 0x05, 0x6c, 0x6f, 0x63, 0x61, 0x6c, 0x00, // "_tcp" "local" \0
                0xc0, 0x1f, // #2 name: pointer -> offset 31
                0x00, 0x1c, 0x00, 0x01, 0x00, 0x00, 0x00, 0x78, 0x00, 0x10, // AAAA, IN, ttl, rdlength=16
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            ]);
            expect(filter.isRelevant(raw)).true;
        });

        it("keeps (defers) a packet with a forward/self compression pointer rather than looping", () => {
            // A single answer whose name is a pointer to itself (offset 12) — illegal forward/self ref.
            // prettier-ignore
            const raw = Uint8Array.from([
                0x00, 0x00, 0x84, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, // header: 1 answer
                0xc0, 0x0c, // name: pointer -> offset 12 (itself)
                0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x78, 0x00, 0x04, 0x01, 0x02, 0x03, 0x04,
            ]);
            expect(filter.isRelevant(raw)).true; // defer to decoder, never loop
        });
    });

    describe("malformed / truncated packets are kept (deferred to the decoder)", () => {
        beforeEach(() => {
            filter.registerRelevantNames(OWNER, ["_matter._tcp.local"]);
        });

        it("keeps a packet shorter than the DNS header", () => {
            expect(filter.isRelevant(Uint8Array.from([0x00, 0x00, 0x84, 0x00]))).true;
        });

        it("keeps a packet whose record count exceeds the available bytes", () => {
            // header claims 100 answers, body has none
            // prettier-ignore
            const raw = Uint8Array.from([0x00, 0x00, 0x84, 0x00, 0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x00]);
            expect(filter.isRelevant(raw)).true;
        });

        it("keeps a packet with a name label running past the end", () => {
            // header: 1 answer; name claims a 20-byte label but packet ends
            // prettier-ignore
            const raw = Uint8Array.from([
                0x00, 0x00, 0x84, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
                0x14, 0x5f, 0x6d, 0x61, 0x74, 0x74, 0x65, 0x72, // length 20 but only a few bytes follow
            ]);
            expect(filter.isRelevant(raw)).true;
        });

        it("keeps a packet using a reserved label type (top bits 0b01/0b10)", () => {
            // header: 1 answer; first name octet 0x40 is a reserved label type
            // prettier-ignore
            const raw = Uint8Array.from([
                0x00, 0x00, 0x84, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
                0x40, 0x01, 0x02,
            ]);
            expect(filter.isRelevant(raw)).true;
        });

        it("keeps a packet whose name pointer targets the header", () => {
            // name is a compression pointer to offset 5 (inside the 12-byte header) — illegal
            // prettier-ignore
            const raw = Uint8Array.from([
                0x00, 0x00, 0x84, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
                0xc0, 0x05, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x78, 0x00, 0x00,
            ]);
            expect(filter.isRelevant(raw)).true;
        });

        it("keeps a question packet truncated before QTYPE/QCLASS", () => {
            // query, qd=1, root name (single 0x00) and nothing after it
            // prettier-ignore
            const raw = Uint8Array.from([
                0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            ]);
            expect(filter.isRelevant(raw)).true;
        });

        it("keeps a record whose RDLENGTH runs past the end", () => {
            // response, 1 answer "x.local" A record claiming rdlength=255 with no RDATA present
            // prettier-ignore
            const raw = Uint8Array.from([
                0x00, 0x00, 0x84, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
                0x01, 0x78, 0x05, 0x6c, 0x6f, 0x63, 0x61, 0x6c, 0x00, // "x.local"
                0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x78, 0x00, 0xff, // A, IN, ttl, rdlength=255
            ]);
            expect(filter.isRelevant(raw)).true;
        });
    });
});
