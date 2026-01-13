# Bun Support

## Overview

Matter.js provides **experimental support** for [Bun](https://bun.sh), a fast all-in-one JavaScript runtime. However, please note that Bun support is currently **unstable** and has several known limitations.

## Known Issues

### Subpath Import Resolution Bug

Bun has a critical bug with subpath imports (e.g., `#general`, `#platform`) defined in `package.json`:

- **Issue**: Subpath imports may incorrectly resolve to CommonJS (CJS) modules instead of ES Modules (ESM)
- **Impact**: This can cause module loading errors and runtime failures
- **Workaround**: The project includes specific configuration in `dist`'s `package.json` imports field with `bun` conditions to force ESM/CJS resolution. (Dirty)

```json
{
    "imports": {
        "#general": {
            "bun": "@matter/general/dist/esm/index.js",
            "default": "@matter/general"
        },
        "#platform": {
            "bun": "@matter/main/dist/esm/platform/nodejs.js",
            "default": "@matter/main/platform"
        }
    }
}
```

### Other Limitations

- **Crypto API**: Bun's `aes-128-ccm` crypto implementation is incomplete. Matter.js uses `StandardCrypto` for missing cryptographic primitives
- **Module Resolution**: Some edge cases in module resolution may behave differently from Node.js
- **Build Process**: Still using `Node.js` for build. You must be installed `node.js` runtime.

## Current Status

✅ **Working**:
- SQLite storage backend (`BunSqliteDisk`, could be enabled by `MATTER_NODEJS_STORAGE_SQLITE=1`)
- Basic Matter.js functionality with ESM modules (CJS is not recommended)
- Development workflow with `bun run` (uses node.js internally)

⚠️ **Experimental**:
- File System storage backend (`StorageBackendDisk`)
  - There might be `EPERM` errors.
- Cryptographic operations (using fallback implementations)
- Subpath imports (requires dirty workarounds)

❌ **Not Supported**:
- Full feature parity with Node.js runtime
- Execute build as `bun` runtime

## Usage

To use Matter.js with Bun:

```bash
# Init project
bun init
# Install dependencies
bun install @matter/main
```

### index.ts
from: `examples/device-onoff-light/src/LightDevice.ts`

```ts
import { ServerNode } from "@matter/main";
import { OnOffLightDevice } from "@matter/main/devices/on-off-light";

// Create the "node".  In Matter a "node" is a standalone device
const node = await ServerNode.create();

// Create the light "endpoint".  In Matter an "endpoint" is a component of a node
const light = await node.add(OnOffLightDevice);

// Add an event handler to log the light's current status
light.events.onOff.onOff$Changed.on(value => console.log(`Light is now ${value}`));

// Run our server
await node.start();
```

### Run on-off light
```bash
bun index.ts
```


## Recommendations

- **For Production**: We recommend using **Node.js** for production deployments
- **For Development**: You can give Bun a whirl just for fun, but keep in mind that it has its limitations.
- **Testing**: Always test your application with Node.js before deploying

## Related Changes

Recent commits improving Bun support:
- SQLite storage implementation for Bun
- FallbackCrypto for incomplete crypto APIs
- Subpath import resolution fixes
- Conditional build configuration

---

**Last Updated**: 2026-01-13  
**Bun Version Tested**: v1.3.5 (latest as of update date)  
**Status**: ⚠️ Experimental