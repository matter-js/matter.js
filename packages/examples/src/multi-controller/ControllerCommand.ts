#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Simple command-based Matter controller for multi-controller scenario.
 * Sends commands directly without interactive mode.
 *
 * Usage:
 *   npm run matter-cmd toggle    - Toggle the device
 *   npm run matter-cmd on        - Turn device ON
 *   npm run matter-cmd off       - Turn device OFF
 *   npm run matter-cmd read      - Read OnOff state
 */

import { Bytes, Crypto, Environment, Logger, LogLevel, StorageService, Time } from "@matter/main";
import { FabricId, FabricIndex, NodeId, VendorId, EndpointNumber } from "@matter/main/types";
import { OnOff } from "@matter/main/clusters";
import { CommissioningController } from "@project-chip/matter.js";
import { CertificateAuthority, FabricBuilder, Rcac } from "@matter/protocol";
import * as fs from "fs";
import * as path from "path";

const logger = Logger.get("MatterCmd");

// Suppress unhandled rejections during shutdown (expected when closing connections)
let shuttingDown = false;
process.on("unhandledRejection", (reason: unknown) => {
    if (shuttingDown) {
        // Expected during shutdown - peer closed, end of stream, etc.
        return;
    }
    console.error("Unhandled rejection:", reason);
});

// Get command from args
const command = process.argv[2]?.toLowerCase();

if (!command || !["toggle", "on", "off", "read"].includes(command)) {
    console.log(`
Matter Controller - Multi-Controller Command Line Interface

This controller uses external certificates (RCAC + ICAC) to join an existing
fabric without re-commissioning. Useful for multi-controller scenarios where
multiple controllers share the same fabric.

Usage:
  npm run matter-cmd toggle    - Toggle the device ON/OFF
  npm run matter-cmd on        - Turn device ON
  npm run matter-cmd off       - Turn device OFF
  npm run matter-cmd read      - Read current OnOff state

Environment Variables:
  MATTER_CERTDIR        - Certificate directory (required, default: ./certificates)
                          Must contain: rcac.chip, icac.chip, icac_key.bin
  MATTER_FABRICID       - Fabric ID (default: 1)
  MATTER_NODEID         - This controller's Node ID (default: 200)
  MATTER_TARGETNODEID   - Target device Node ID (default: 1)
  MATTER_ENDPOINT       - Target endpoint (default: 1)

Certificate Requirements:
  - rcac.chip     : Root CA certificate in Matter TLV format
  - icac.chip     : Intermediate CA certificate in Matter TLV format
  - icac_key.bin  : Intermediate CA private key in chip-tool binary format

See README.md for detailed setup instructions.
`);
    process.exit(1);
}

const environment = Environment.default;
const storageService = environment.get(StorageService);

function parseChipKeyBinary(keyPath: string): { publicKey: Bytes; privateKey: Bytes } {
    const keyBuffer = fs.readFileSync(keyPath);
    const keyBytes = Bytes.of(new Uint8Array(keyBuffer));
    if (keyBytes.length !== 97 || keyBytes[0] !== 4) {
        throw new Error(`Invalid chip-tool key format`);
    }
    return {
        publicKey: Bytes.of(keyBytes.slice(0, 65)),
        privateKey: Bytes.of(keyBytes.slice(65, 97)),
    };
}

function loadTlvCertificate(certPath: string): Bytes {
    return Bytes.of(new Uint8Array(fs.readFileSync(certPath)));
}

async function computeKeyIdentifier(publicKey: Bytes): Promise<Bytes> {
    const nodeCrypto = await import("crypto");
    const publicKeyBuffer = Buffer.from(Bytes.of(publicKey));
    const sha1 = nodeCrypto.createHash("sha1").update(publicKeyBuffer).digest();
    return Bytes.of(new Uint8Array(sha1));
}

function getDefaultChipToolIpk(): Bytes {
    return Bytes.of(new Uint8Array(Buffer.from("temporary ipk 01", "ascii")));
}

async function main() {
    const certDir = process.env.MATTER_CERTDIR ?? "./certificates";
    const fabricId = BigInt(process.env.MATTER_FABRICID ?? "1");
    const nodeId = Number(process.env.MATTER_NODEID ?? "200");
    const targetDeviceNodeId = Number(process.env.MATTER_TARGETNODEID ?? "1");
    const targetEndpoint = Number(process.env.MATTER_ENDPOINT ?? "1");

    // Certificate paths - Note: RCAC private key is NOT required when using ICAC
    // Only need: RCAC cert (public), ICAC cert, ICAC private key
    const rcacCertPath = path.join(certDir, "rcac.chip");
    const icacCertPath = path.join(certDir, "icac.chip");
    const icacKeyPath = path.join(certDir, "icac_key.bin");

    // Verify files exist
    for (const [name, filePath] of [
        ["RCAC certificate", rcacCertPath],
        ["ICAC certificate", icacCertPath],
        ["ICAC key", icacKeyPath],
    ] as const) {
        if (!fs.existsSync(filePath)) {
            console.error(`Error: ${name} not found at ${filePath}`);
            process.exit(1);
        }
    }

    // Load certificates
    const rcacCertBytes = loadTlvCertificate(rcacCertPath);
    const icacCertBytes = loadTlvCertificate(icacCertPath);
    const icacKeyPair = parseChipKeyBinary(icacKeyPath);

    // Parse RCAC certificate to extract public key (no private key needed!)
    const rcacCert = Rcac.fromTlv(rcacCertBytes);
    const rcacPublicKey = Bytes.of(rcacCert.cert.ellipticCurvePublicKey);

    const ipk = getDefaultChipToolIpk();
    const crypto = environment.get(Crypto);

    // Compute key identifiers from public keys
    const rcacKeyIdentifier = await computeKeyIdentifier(rcacPublicKey);
    const icacKeyIdentifier = await computeKeyIdentifier(icacKeyPair.publicKey);

    // Create Certificate Authority - NO RCAC private key needed when using ICAC!
    // The ICAC key will be used to sign NOCs
    const certificateAuthority = await CertificateAuthority.create(crypto, {
        rootCertId: BigInt("0xCACACACA00000001"),
        // rootKeyPair is NOT provided - we don't have/need the RCAC private key
        rootKeyIdentifier: rcacKeyIdentifier,
        rootCertBytes: rcacCertBytes,
        nextCertificateId: BigInt(3),
        intermediateCert: true,
        icacCertId: BigInt("0xCACACACA00000102"),
        icacKeyPair: { publicKey: icacKeyPair.publicKey, privateKey: icacKeyPair.privateKey },
        icacKeyIdentifier,
        icacCertBytes,
    });

    // Build fabric
    const fabricBuilder = await FabricBuilder.create(crypto);
    await fabricBuilder.setRootCert(certificateAuthority.rootCert);
    fabricBuilder
        .setRootNodeId(NodeId(BigInt(nodeId)))
        .setIdentityProtectionKey(ipk)
        .setRootVendorId(VendorId(65521))
        .setLabel("Matter.js Controller");

    const noc = await certificateAuthority.generateNoc(
        fabricBuilder.publicKey,
        FabricId(fabricId),
        NodeId(BigInt(nodeId)),
    );
    await fabricBuilder.setOperationalCert(noc, certificateAuthority.icacCert);
    const fabric = await fabricBuilder.build(FabricIndex(1));

    // Get controller storage
    const controllerStorage = (await storageService.open("matter-cmd")).createContext("data");
    const uniqueId = (await controllerStorage.has("uniqueid"))
        ? await controllerStorage.get<string>("uniqueid")
        : `matter-cmd-${Time.nowMs.toString()}`;
    await controllerStorage.set("uniqueid", uniqueId);

    // Create CommissioningController with our pre-built fabric
    const commissioningController = new CommissioningController({
        environment: {
            environment,
            id: uniqueId,
        },
        autoConnect: false,
        adminFabricLabel: "Matter.js Controller",
        adminFabricId: FabricId(fabricId),
        rootNodeId: NodeId(BigInt(nodeId)),
        adminVendorId: VendorId(65521),
        rootCertificateAuthority: certificateAuthority,
        rootFabric: fabric,
    });

    await commissioningController.start();

    let node;
    try {
        logger.info(`Connecting to device (Node ID: ${targetDeviceNodeId})...`);

        node = await commissioningController.getNode(NodeId(targetDeviceNodeId), true);
        node.connect();

        if (!node.initialized) {
            await node.events.initialized;
        }

        // Get OnOff cluster client using low-level API
        const onOffCluster = node.getClusterClientForDevice(EndpointNumber(targetEndpoint), OnOff.Complete);
        if (!onOffCluster) {
            console.error(`Error: OnOff cluster not found on endpoint ${targetEndpoint}`);
            shuttingDown = true;
            await commissioningController.close().catch(() => {});
            process.exit(1);
        }

        logger.info(`Found OnOff cluster on endpoint ${targetEndpoint}`);

        // Execute command
        switch (command) {
            case "toggle":
                await onOffCluster.toggle();
                const stateAfterToggle = await onOffCluster.getOnOffAttribute();
                console.log(`Toggled! OnOff is now: ${stateAfterToggle ? "ON" : "OFF"}`);
                break;
            case "on":
                await onOffCluster.on();
                console.log("Device turned ON");
                break;
            case "off":
                await onOffCluster.off();
                console.log("Device turned OFF");
                break;
            case "read":
                const currentState = await onOffCluster.getOnOffAttribute();
                console.log(`OnOff state: ${currentState ? "ON" : "OFF"}`);
                break;
        }

        console.log("Done!");
    } catch (error) {
        console.error(`Error: ${error}`);
        shuttingDown = true;
        Logger.level = LogLevel.FATAL; // Suppress INFO/WARN logs during shutdown
        await commissioningController.close().catch(() => {});
        process.exit(1);
    }

    // Clean shutdown - suppress logs and disconnect node first, then close controller
    shuttingDown = true;
    Logger.level = LogLevel.FATAL; // Suppress INFO/WARN logs during shutdown
    if (node) {
        await node.disconnect().catch(() => {});
    }
    await commissioningController.close().catch(() => {});
    process.exit(0);
}

main().catch(error => {
    console.error(`Fatal error: ${error}`);
    process.exit(1);
});
