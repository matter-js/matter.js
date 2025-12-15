# Multi-Controller with External Certificates

This example demonstrates how to set up a **multi-controller scenario** where two controllers share the same fabric and can control the same device **without re-commissioning**.

The controller provides a simple CLI to send OnOff commands (`toggle`, `on`, `off`, `read`) to a commissioned Matter device.

## Overview

In Matter, multiple controllers can manage the same device if they share:
1. **Same Root CA (RCAC)** - The root of trust
2. **Same Fabric ID** - The logical network identifier
3. **Same IPK (Identity Protection Key)** - Used for secure communication

Each controller can have its own **Intermediate CA (ICAC)** and **Node Operational Certificate (NOC)**, as long as they chain back to the same RCAC.

## Architecture

```
                    ┌─────────────────┐
                    │      RCAC       │
                    │  (Root CA Cert) │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
      ┌───────┴───────┐             ┌───────┴───────┐
      │    ICAC 1     │             │    ICAC 2     │
      │ (chip-tool)   │             │ (matter.js)   │
      └───────┬───────┘             └───────┬───────┘
              │                             │
      ┌───────┴───────┐             ┌───────┴───────┐
      │    NOC 1      │             │    NOC 2      │
      │  Node ID: 100 │             │  Node ID: 200 │
      └───────────────┘             └───────────────┘
              │                             │
              │         ┌─────────┐         │
              └────────►│ Device  │◄────────┘
                        │ Node: 1 │
                        └─────────┘
```

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run matter-cmd toggle` | Toggle the device ON/OFF |
| `npm run matter-cmd on` | Turn device ON |
| `npm run matter-cmd off` | Turn device OFF |
| `npm run matter-cmd read` | Read current OnOff state |

## Prerequisites

### 1. Generate External Certificates

Use chip-tool to generate the certificate chain:

```bash
cd /path/to/connectedhomeip

# Create certificates directory
mkdir -p certificates

# Generate RCAC (Root CA)
./out/linux-x64-chip-tool/chip-cert gen-att-cert \
  --type r \
  --subject-cn "Matter Test Root CA" \
  --valid-from "2024-01-01 00:00:00" \
  --lifetime 3650 \
  --out-key certificates/rcac_key.pem \
  --out certificates/rcac.pem

# Convert RCAC to Matter TLV format
./out/linux-x64-chip-tool/chip-cert convert-cert \
  certificates/rcac.pem certificates/rcac.chip --chip

# Generate ICAC 1 (for chip-tool controller)
./out/linux-x64-chip-tool/chip-cert gen-att-cert \
  --type i \
  --subject-cn "Matter Test ICA 1" \
  --ca-cert certificates/rcac.pem \
  --ca-key certificates/rcac_key.pem \
  --valid-from "2024-01-01 00:00:00" \
  --lifetime 3650 \
  --out-key certificates/icac1_key.pem \
  --out certificates/icac1.pem

# Convert ICAC 1 to Matter formats
./out/linux-x64-chip-tool/chip-cert convert-cert \
  certificates/icac1.pem certificates/icac1.chip --chip
./out/linux-x64-chip-tool/chip-cert convert-key \
  certificates/icac1_key.pem certificates/icac1_key.bin --chip

# Generate ICAC for matter.js controller
./out/linux-x64-chip-tool/chip-cert gen-att-cert \
  --type i \
  --subject-cn "Matter Test ICA" \
  --ca-cert certificates/rcac.pem \
  --ca-key certificates/rcac_key.pem \
  --valid-from "2024-01-01 00:00:00" \
  --lifetime 3650 \
  --out-key certificates/icac_key.pem \
  --out certificates/icac.pem

# Convert ICAC to Matter formats
./out/linux-x64-chip-tool/chip-cert convert-cert \
  certificates/icac.pem certificates/icac.chip --chip
./out/linux-x64-chip-tool/chip-cert convert-key \
  certificates/icac_key.pem certificates/icac_key.bin --chip
```

### 2. Commission Device with Controller 1 (chip-tool)

Start your Matter device (e.g., all-clusters-app):

```bash
./out/linux-x64-all-clusters/chip-all-clusters-app \
  --discriminator 3840 \
  --KVS /tmp/chip_kvs
```

Commission using chip-tool with external certificates:

```bash
./out/linux-x64-chip-tool/chip-tool pairing code \
  --use-external-certs 1 \
  --rcac-cert certificates/rcac.chip \
  --icac-cert certificates/icac1.chip \
  --icac-key certificates/icac1_key.bin \
  --external-fabric-id 1 \
  --external-node-id 100 \
  --storage-directory /tmp/chip_controller1 \
  1 MT:-24J0AFN00KA0648G00
```

### 3. Add Controller 2 to Device ACL

The device must allow Controller 2 (Node ID 200) to access it:

```bash
./out/linux-x64-chip-tool/chip-tool accesscontrol write acl '[
  {
    "fabricIndex": 1,
    "privilege": 5,
    "authMode": 2,
    "subjects": [100],
    "targets": null
  },
  {
    "fabricIndex": 1,
    "privilege": 5,
    "authMode": 2,
    "subjects": [200],
    "targets": null
  }
]' 1 0 \
  --use-external-certs 1 \
  --rcac-cert certificates/rcac.chip \
  --icac-cert certificates/icac1.chip \
  --icac-key certificates/icac1_key.bin \
  --external-fabric-id 1 \
  --external-node-id 100 \
  --storage-directory /tmp/chip_controller1
```

## Running the Multi-Controller

### Configuration

The multi-controller reads certificates from environment variables or defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `MATTER_CERTDIR` | `./certificates` | Certificate directory (must contain rcac.chip, icac.chip, icac_key.bin) |
| `MATTER_FABRICID` | `1` | Fabric ID |
| `MATTER_NODEID` | `200` | This controller's Node ID |
| `MATTER_TARGETNODEID` | `1` | Target device Node ID |
| `MATTER_ENDPOINT` | `1` | Target endpoint on the device |

### Running

```bash
cd packages/examples

# Toggle the device ON/OFF
npm run matter-cmd toggle

# Turn device ON
npm run matter-cmd on

# Turn device OFF
npm run matter-cmd off

# Read current OnOff state
npm run matter-cmd read
```

### With Custom Environment Variables

```bash
MATTER_CERTDIR=/path/to/certificates \
MATTER_FABRICID=1 \
MATTER_NODEID=200 \
MATTER_TARGETNODEID=1 \
MATTER_ENDPOINT=1 \
npm run matter-cmd toggle
```

## How It Works

### 1. Certificate Loading

The controller loads only **three files** (no RCAC private key needed!):
- **RCAC certificate** (`rcac.chip`) - The shared root CA (public key only)
- **ICAC certificate** (`icac.chip`) - This controller's intermediate CA
- **ICAC key** (`icac_key.bin`) - For signing NOCs

**Security Note**: The RCAC private key is NOT required when using ICAC. This is the proper
security model - the RCAC private key should remain securely stored and only used to sign
new ICACs. Controllers only need their ICAC to sign NOCs.

### 2. IPK (Identity Protection Key)

**Critical**: Both controllers must use the same IPK.

chip-tool uses `"temporary ipk 01"` as the default raw IPK:
```
Raw IPK: 74656d706f726172792069706b203031 (ASCII: "temporary ipk 01")
```

The operational IPK is derived via HKDF:
```
Operational IPK = HKDF-SHA256(
  salt = compressedFabricId,
  ikm = rawIPK,
  info = "GroupKey v1.0",
  length = 16
)
```

### 3. CASE Session Establishment

The controller connects to the device using CASE (Certificate Authenticated Session Establishment):

1. **Sigma1**: Controller sends random, destination ID, and session parameters
2. **Sigma2**: Device responds with its certificate chain and signature
3. **Sigma3**: Controller sends its certificate chain and signature
4. **StatusReport**: Device confirms session establishment

The **Destination ID** is computed as:
```
HMAC-SHA256(
  key = operationalIPK,
  message = random || rootPublicKey || fabricId_LE || nodeId_LE
)
```

Both controllers must compute the same Destination ID for the device to accept the connection.

### 4. Fabric Matching

The device identifies the fabric by matching:
- **Compressed Fabric ID**: `HKDF-SHA256(fabricId_BE, rootPublicKey[1:], "CompressedFabric", 8)`
- **Destination ID**: Must match one computed from the device's known fabrics

## Troubleshooting

### NoSharedTrustRoots Error

**Cause**: The destination ID doesn't match any fabric on the device.

**Solutions**:
1. Verify both controllers use the same RCAC
2. Verify both controllers use the same raw IPK (not operational IPK)
3. Verify the fabric ID matches

### UNSUPPORTED_ACCESS Error (Status 128)

**Cause**: Controller's Node ID is not in the device's ACL.

**Solution**: Add the controller's Node ID to the ACL using chip-tool (see step 3 above).

### MRP Backoff Time Invalid

**Cause**: Session parameters not properly initialized.

**Solution**: This was fixed in matter.js by properly handling undefined session parameters during CASE session establishment.

## Key Concepts

### Matter PKI Hierarchy

```
RCAC (Root CA Certificate)
  └── ICAC (Intermediate CA Certificate)
        └── NOC (Node Operational Certificate)
```

### Fabric Identity

A fabric is uniquely identified by:
- **Fabric ID**: 64-bit identifier (e.g., `0x0000000000000001`)
- **Root Public Key**: From the RCAC
- **Compressed Fabric ID**: 8-byte hash derived from above

### Session Parameters (MRP)

- **SII** (Session Idle Interval): 500ms default
- **SAI** (Session Active Interval): 300ms default
- **SAT** (Session Active Threshold): 4000ms default

## Files

| File | Description |
|------|-------------|
| `ControllerCommand.ts` | Main controller implementation with CLI commands (toggle, on, off, read) |
| `README.md` | This documentation |

## References

- [Matter Specification](https://csa-iot.org/developer-resource/specifications-download-request/)
- [chip-tool Documentation](https://github.com/project-chip/connectedhomeip/tree/master/examples/chip-tool)
- [matter.js Documentation](https://github.com/matter-js/matter.js)
