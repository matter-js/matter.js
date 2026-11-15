/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, Millis, Seconds, Time } from "@matter/main";
import { CommissioningMode, MdnsService } from "@matter/main/protocol";
import { VendorId } from "@matter/main/types";
import { expect } from "chai";
import { advertiseCommissionableAlias, cachedTxtValue } from "../../src/cert/mdns-alias.js";
import { discoverCommissionable, expectMdns } from "../../src/cert/mdns-check.js";

describe("advertiseCommissionableAlias", function () {
    this.timeout(60_000);

    // A discriminator and port no harness device uses, so only the alias can answer
    const DISCRIMINATOR = 0xabc;
    const PORT = 5599;

    it("publishes the extra TXT entries under a record naming the given port", async () => {
        const alias = await advertiseCommissionableAlias(
            {
                kind: "commissionable",
                mode: CommissioningMode.Basic,
                discriminator: DISCRIMINATOR,
                name: "alias-test",
                deviceType: 0x100,
                vendorId: VendorId(0xfff1),
                productId: 0x8001,
                port: PORT,
            },
            { ZZ: "42" },
        );
        try {
            expect(await cachedTxtValue(alias.qname, "ZZ", Seconds(10))).equal("42");
            expect(await cachedTxtValue(alias.qname, "D", Millis(0)), "the device's own TXT entries stay").equal(
                String(DISCRIMINATOR),
            );
            expect(await cachedTxtValue(alias.qname, "NOPE", Millis(500))).equal(undefined);

            const found = await discoverCommissionable(DISCRIMINATOR, Seconds(10));
            expect(found?.addresses.flatMap(address => ("port" in address ? [address.port] : []))).contains(PORT);
            expect(await discoverCommissionable(DISCRIMINATOR, Seconds(2), () => false)).equal(undefined);
        } finally {
            await alias.close();
        }

        // A record outliving its test would answer a later test's discovery for this discriminator
        const names = Environment.default.get(MdnsService).names;
        for (let polls = 40; names.maybeGet(alias.qname)?.parameters.get("ZZ") !== undefined && polls > 0; polls--) {
            await Time.sleep("alias withdrawal", Millis(250));
        }
        expect(names.maybeGet(alias.qname)?.parameters.get("ZZ")).equal(undefined);
    });

    it("lets expectMdns accept only the named commissionable instances", async () => {
        const discriminator = DISCRIMINATOR + 1;
        const alias = await advertiseCommissionableAlias(
            {
                kind: "commissionable",
                mode: CommissioningMode.Basic,
                discriminator,
                name: "alias-instance-test",
                deviceType: 0x100,
                vendorId: VendorId(0xfff1),
                productId: 0x8001,
                port: PORT + 1,
            },
            {},
        );
        try {
            const device = { commissioning: { discriminator } };
            const [instanceName] = alias.qname.split(".");
            const own = await expectMdns(
                device,
                { commissionable: true },
                { timeoutMs: 10_000, commissionableInstanceNames: [instanceName.toLowerCase()] },
            );
            expect(own.verdict, own.detail).equal("pass");

            const other = await expectMdns(
                device,
                { commissionable: true },
                { timeoutMs: 2_000, commissionableInstanceNames: ["0000000000000000"] },
            );
            expect(other.verdict, other.detail).equal("fail");
        } finally {
            await alias.close();
        }
    });
});
