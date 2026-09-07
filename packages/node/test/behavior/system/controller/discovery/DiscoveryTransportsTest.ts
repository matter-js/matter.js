/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ControllerBehavior } from "#behavior/system/controller/ControllerBehavior.js";
import { Discovery } from "#behavior/system/controller/discovery/Discovery.js";
import { ChannelType, Diagnostic, LogDestination, Logger, LogLevel, Seconds } from "@matter/general";
import { MockServerNode } from "@matter/node/testing";
import { CommissionableDevice, CommissionableDeviceIdentifiers, Scanner, ScannerSet } from "@matter/protocol";
import { VendorId } from "@matter/types";

const DISCRIMINATOR = 1234;

class MockScanner implements Scanner {
    readonly requests = new Array<CommissionableDeviceIdentifiers>();

    constructor(readonly type: ChannelType) {}

    async findCommissionableDevicesContinuously(identifier: CommissionableDeviceIdentifiers) {
        this.requests.push(identifier);
        return new Array<CommissionableDevice>();
    }

    getDiscoveredCommissionableDevices() {
        return new Array<CommissionableDevice>();
    }

    cancelCommissionableDeviceDiscovery() {}

    async close() {}
}

interface Captured {
    level: number;
    text: string;
}

interface Outcome {
    /** The scanner types discovery actually queried. */
    scanned: ChannelType[];

    /** What the scanners received as the device to look for. */
    requests: CommissionableDeviceIdentifiers[];

    messages: Captured[];
}

async function discover(scannerTypes: ChannelType[], options: Discovery.Options): Promise<Outcome> {
    const node = await MockServerNode.createOnline();

    // Load before replacing the scanners: controller initialization is what installs the mDNS scanner
    node.behaviors.require(ControllerBehavior);
    await node.act(agent => agent.load(ControllerBehavior));

    const set = node.env.get(ScannerSet);
    set.clear();
    const scanners = scannerTypes.map(type => new MockScanner(type));
    for (const scanner of scanners) {
        set.add(scanner);
    }

    const messages = new Array<Captured>();
    Logger.destinations.capture = LogDestination({
        add(message: Diagnostic.Message) {
            if (message.facility === "Discovery") {
                messages.push({ level: message.level, text: message.values.map(value => String(value)).join(" ") });
            }
        },
    });

    try {
        await MockTime.resolve(node.peers.discover({ timeout: Seconds(5), ...options }), { macrotasks: true });
    } finally {
        delete Logger.destinations.capture;
        await node.close();
    }

    return {
        scanned: scanners.filter(scanner => scanner.requests.length).map(scanner => scanner.type),
        requests: scanners.flatMap(scanner => scanner.requests),
        messages,
    };
}

describe("discovery transport selection", () => {
    it("discovers on every installed transport where the caller states nothing", async () => {
        const { scanned } = await discover([ChannelType.UDP, ChannelType.BLE], { longDiscriminator: DISCRIMINATOR });

        expect(scanned).deep.equals([ChannelType.UDP, ChannelType.BLE]);
    });

    it("discovers on the IP network alone unless the payload names BLE", async () => {
        const { scanned } = await discover([ChannelType.UDP, ChannelType.BLE], {
            longDiscriminator: DISCRIMINATOR,
            discoveryCapabilities: { onIpNetwork: true },
        });

        expect(scanned).deep.equals([ChannelType.UDP]);
    });

    it("discovers on BLE where the payload names it", async () => {
        const { scanned } = await discover([ChannelType.UDP, ChannelType.BLE], {
            longDiscriminator: DISCRIMINATOR,
            discoveryCapabilities: { onIpNetwork: true, ble: true },
        });

        expect(scanned).deep.equals([ChannelType.UDP, ChannelType.BLE]);
    });

    it("names the device to a scanner without the options that steer discovery itself", async () => {
        const { requests } = await discover([ChannelType.UDP], {
            longDiscriminator: DISCRIMINATOR,
            discoveryCapabilities: { onIpNetwork: true },
        });

        expect(requests).deep.equals([{ longDiscriminator: DISCRIMINATOR }]);
    });

    it("names every identifier the caller states", async () => {
        const { requests } = await discover([ChannelType.UDP], {
            vendorId: VendorId(0xfff1),
            productId: 0x8001,
            discoveryCapabilities: { onIpNetwork: true },
        });

        expect(requests).deep.equals([{ vendorId: VendorId(0xfff1), productId: 0x8001 }]);
    });
});

describe("discovery transport reporting", () => {
    it("reports that BLE is installed but was not asked for", async () => {
        const { messages } = await discover([ChannelType.UDP, ChannelType.BLE], {
            longDiscriminator: DISCRIMINATOR,
            discoveryCapabilities: { onIpNetwork: true },
        });

        const note = messages.find(({ text }) => text.includes("(BLE not requested)"));
        expect(note?.level).equals(LogLevel.NOTICE);
    });

    it("stays silent about BLE where BLE is not installed at all", async () => {
        const { messages } = await discover([ChannelType.UDP], {
            longDiscriminator: DISCRIMINATOR,
            discoveryCapabilities: { onIpNetwork: true },
        });

        expect(messages.some(({ text }) => text.includes("(BLE not requested)"))).equals(false);
        expect(messages.some(({ text }) => text.includes("BLE is not enabled"))).equals(false);
    });

    it("reports BLE requested where BLE is not enabled", async () => {
        const { messages } = await discover([ChannelType.UDP], {
            longDiscriminator: DISCRIMINATOR,
            discoveryCapabilities: { onIpNetwork: true, ble: true },
        });

        const notice = messages.find(({ text }) => text.includes("BLE is not enabled"));
        expect(notice?.level).equals(LogLevel.NOTICE);
    });

    it("warns where no scanner participates", async () => {
        const { messages } = await discover([], {
            longDiscriminator: DISCRIMINATOR,
            discoveryCapabilities: { onIpNetwork: true, ble: true },
        });

        const warning = messages.find(({ level }) => level === LogLevel.WARN);
        expect(warning?.text).includes("No scanner is available");
        expect(messages.some(({ text }) => text.includes("using IP network only"))).equals(false);
    });
});
