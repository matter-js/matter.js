/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChannelType, Diagnostic, Seconds } from "@matter/general";
import { CommissionableDeviceIdentifiers } from "@matter/protocol";
import { ManualPairingCodeCodec, VendorId } from "@matter/types";
import type { Argv } from "yargs";
import { MatterNode } from "../MatterNode.js";

export default function commands(theNode: MatterNode) {
    return {
        command: "discover",
        describe: "Handle device discovery",
        builder: (yargs: Argv) =>
            yargs
                // Pair
                .command(
                    "commissionable [timeout-seconds]",
                    "Discover commissionable devices",
                    () => {
                        return yargs
                            .positional("timeout-seconds", {
                                describe: "Discovery timeout in seconds",
                                default: 900,
                                type: "number",
                            })
                            .options({
                                pairingCode: {
                                    describe: "pairing code",
                                    default: undefined,
                                    type: "string",
                                },
                                discriminator: {
                                    alias: "d",
                                    description: "Long discriminator",
                                    default: undefined,
                                    type: "number",
                                },
                                shortDiscriminator: {
                                    alias: "s",
                                    description: "Short discriminator",
                                    default: undefined,
                                    type: "number",
                                },
                                vendorId: {
                                    alias: "v",
                                    description: "Vendor ID",
                                    default: undefined,
                                    type: "number",
                                },
                                productId: {
                                    alias: "p",
                                    description: "Product ID",
                                    default: undefined,
                                    type: "number",
                                },
                                deviceType: {
                                    alias: "t",
                                    description: "Device Type",
                                    default: undefined,
                                    type: "number",
                                },
                                ble: {
                                    alias: "b",
                                    description: "Also discover over BLE",
                                    default: false,
                                    type: "boolean",
                                },
                                once: {
                                    description: "Stop after finding the first matching device",
                                    default: false,
                                    type: "boolean",
                                },
                            });
                    },
                    async argv => {
                        const { ble, once, pairingCode, vendorId, productId, deviceType, timeoutSeconds } = argv;
                        let { discriminator, shortDiscriminator } = argv;

                        if (typeof pairingCode === "string") {
                            const { shortDiscriminator: pairingCodeShortDiscriminator } =
                                ManualPairingCodeCodec.decode(pairingCode);
                            shortDiscriminator = pairingCodeShortDiscriminator;
                            discriminator = undefined;
                        }

                        await theNode.start();

                        const identifierData: CommissionableDeviceIdentifiers =
                            discriminator !== undefined
                                ? { longDiscriminator: discriminator }
                                : shortDiscriminator !== undefined
                                  ? { shortDiscriminator }
                                  : vendorId !== undefined
                                    ? { vendorId: VendorId(vendorId) }
                                    : productId !== undefined
                                      ? { productId }
                                      : deviceType !== undefined
                                        ? { deviceType }
                                        : {};

                        console.log(
                            `Discover devices with identifier ${Diagnostic.json(
                                identifierData,
                            )} for ${once ? "first match or " : ""}${timeoutSeconds} seconds.`,
                        );

                        // scannerFilter mirrors the discoveryCapabilities->filter mapping in CommissioningDiscovery.
                        const discovery = theNode.node.peers.discover({
                            ...identifierData,
                            timeout: Seconds(timeoutSeconds),
                            scannerFilter: scanner =>
                                scanner.type === ChannelType.UDP || (ble && scanner.type === ChannelType.BLE),
                        });
                        // A re-advertising device fires `discovered` again for the same node; dedupe by its
                        // canonical identity so the log doesn't spam duplicate lines.
                        const seen = new Set<string>();
                        discovery.discovered.on(node => {
                            const { deviceIdentifier, addresses } = node.state.commissioning;
                            // Prefer the stable device identifier; the address fallback is sorted so re-advertisement
                            // in a different order does not read as a new device (ServerAddress carries no volatile fields).
                            const id =
                                deviceIdentifier ||
                                (addresses ?? [])
                                    .map(a => JSON.stringify(a))
                                    .sort()
                                    .join("|");
                            if (seen.has(id)) {
                                return;
                            }
                            seen.add(id);
                            console.log(`Discovered device ${Diagnostic.json(node.state.commissioning)}`);
                            if (once) {
                                discovery.stop();
                            }
                        });

                        const results = await discovery;

                        console.log(
                            `Discovered ${results.length} devices`,
                            results.map(node => node.state.commissioning),
                        );
                    },
                ),
        handler: async (argv: any) => {
            argv.unhandled = true;
        },
    };
}
