/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, Seconds } from "#general";
import { CommissionableDeviceIdentifiers } from "#protocol";
import { ManualPairingCodeCodec, VendorId } from "#types";
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
                            });
                    },
                    async argv => {
                        const { ble = false, pairingCode, vendorId, productId, deviceType, timeoutSeconds } = argv;
                        let { discriminator, shortDiscriminator } = argv;

                        if (typeof pairingCode === "string") {
                            const { shortDiscriminator: pairingCodeShortDiscriminator } =
                                ManualPairingCodeCodec.decode(pairingCode);
                            shortDiscriminator = pairingCodeShortDiscriminator;
                            discriminator = undefined;
                        }

                        await theNode.start();
                        if (theNode.commissioningController === undefined) {
                            throw new Error("CommissioningController not initialized");
                        }

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
                            )} for ${timeoutSeconds} seconds.`,
                        );

                        const results = await theNode.commissioningController.discoverCommissionableDevices(
                            identifierData,
                            {
                                ble,
                                onIpNetwork: true,
                            },
                            device => console.log(`Discovered device ${Diagnostic.json(device)}`),
                            Seconds(timeoutSeconds),
                        );

                        console.log(`Discovered ${results.length} devices`, results);
                    },
                ),
        handler: async (argv: any) => {
            argv.unhandled = true;
        },
    };
}
