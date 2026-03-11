/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic } from "@matter/general";
import type { Argv } from "yargs";
import { MatterNode } from "../MatterNode.js";

export default function commands(theNode: MatterNode) {
    return {
        command: "vendor",
        describe: "Vendor information management operations",
        builder: (yargs: Argv) =>
            yargs
                .command(
                    ["*", "list"],
                    "List all stored vendor information",
                    () => {},
                    async () => {
                        await theNode.start();
                        const vendorService = await theNode.vendorInfoService();
                        const vendors = [...vendorService.vendors.values()];

                        if (vendors.length === 0) {
                            console.log("No vendor information found in storage.");
                            return;
                        }

                        console.log(`\nFound ${vendors.length} vendor(s):\n`);

                        // Sort vendors by ID for consistent output
                        vendors.sort((a, b) => a.vendorId - b.vendorId);

                        vendors.forEach(vendor => {
                            console.log(
                                `Vendor ID: ${vendor.vendorId} (0x${vendor.vendorId.toString(16).toUpperCase().padStart(4, "0")})`,
                            );
                            console.log(`  Name: ${vendor.vendorName}`);
                            console.log(`  Legal Name: ${vendor.companyLegalName}`);
                            console.log(`  Preferred Name: ${vendor.companyPreferredName}`);
                            console.log(`  Landing Page: ${vendor.vendorLandingPageUrl}`);
                            console.log("");
                        });
                    },
                )
                .command(
                    "get <vendor-id>",
                    "Display detailed information about a vendor",
                    yargs => {
                        return yargs.positional("vendor-id", {
                            describe: "Vendor ID (hex format like 0xFFF1 or decimal)",
                            type: "string",
                            demandOption: true,
                        });
                    },
                    async argv => {
                        const { vendorId: vendorIdStr } = argv;

                        let vendorId: number;
                        if (vendorIdStr.startsWith("0x")) {
                            const hexStr = vendorIdStr.replace(/^0x/i, "");
                            vendorId = parseInt(hexStr, 16);
                        } else {
                            vendorId = parseInt(vendorIdStr, 10);
                        }

                        if (!isFinite(vendorId)) {
                            console.error(`Error: Invalid vendor ID "${vendorIdStr}"`);
                            return;
                        }

                        await theNode.start();
                        const vendor = (await theNode.vendorInfoService()).infoFor(vendorId);
                        if (!vendor) {
                            console.error(`Vendor with ID ${vendorIdStr} not found`);
                            return;
                        }

                        console.log("\nVendor Details:");
                        console.log(Diagnostic.json(vendor));
                    },
                )
                .command(
                    "product <vendor-id> <product-id>",
                    "Fetch and display product details from DCL for a vendor/product ID combination",
                    yargs => {
                        return yargs
                            .positional("vendor-id", {
                                describe: "Vendor ID (hex format like 0xFFF1 or decimal)",
                                type: "string",
                                demandOption: true,
                            })
                            .positional("product-id", {
                                describe: "Product ID (hex format like 0x8000 or decimal)",
                                type: "string",
                                demandOption: true,
                            });
                    },
                    async argv => {
                        const { "vendor-id": vendorIdStr, "product-id": productIdStr } = argv;

                        const vendorId = vendorIdStr.startsWith("0x")
                            ? parseInt(vendorIdStr.replace(/^0x/i, ""), 16)
                            : parseInt(vendorIdStr, 10);
                        const productId = productIdStr.startsWith("0x")
                            ? parseInt(productIdStr.replace(/^0x/i, ""), 16)
                            : parseInt(productIdStr, 10);

                        if (!isFinite(vendorId)) {
                            console.error(`Error: Invalid vendor ID "${vendorIdStr}"`);
                            return;
                        }
                        if (!isFinite(productId)) {
                            console.error(`Error: Invalid product ID "${productIdStr}"`);
                            return;
                        }

                        await theNode.start();
                        const product = await (await theNode.vendorInfoService()).productInfoFor(vendorId, productId);
                        if (!product) {
                            console.error(
                                `Product with vendor ID ${vendorIdStr} and product ID ${productIdStr} not found in DCL`,
                            );
                            return;
                        }

                        console.log("\nProduct Details:");
                        console.log(JSON.stringify(product, null, 2));
                    },
                )
                .command(
                    "update",
                    "Update vendor information from DCL",
                    () => {},
                    async () => {
                        await theNode.start();
                        const vendorService = await theNode.vendorInfoService();
                        console.log("Updating vendor information from DCL...");

                        try {
                            await vendorService.update();
                            console.log(`Successfully updated. ${vendorService.vendors.size} vendor(s) now available.`);
                        } catch (error) {
                            console.error(
                                `Failed to update vendor information: ${error instanceof Error ? error.message : error}`,
                            );
                        }
                    },
                ),
        handler: async (argv: any) => {
            argv.unhandled = true;
        },
    };
}
