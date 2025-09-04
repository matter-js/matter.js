# GitHub Copilot Instructions for matter.js

## Project Overview

matter.js is a comprehensive TypeScript implementation of the Matter/Thread smart home protocol. This is a monorepo containing multiple packages that work together to provide Matter protocol support for JavaScript/TypeScript applications.

## Architecture & Key Packages

### Core Packages
- `@matter/general` - Core utilities, crypto, networking abstractions
- `@matter/protocol` - Matter protocol implementation, commissioning, clustering
- `@matter/model` - Matter data model, cluster definitions, device types
- `@matter/node` - Node/endpoint implementations, behaviors, supervision
- `@matter/types` - TypeScript type definitions for Matter clusters and data types

### Platform Packages
- `@matter/nodejs` - Node.js platform implementation
- `@matter/nodejs-ble` - Bluetooth Low Energy support for Node.js
- `@matter/nodejs-shell` - Interactive shell for Matter operations

### Application Packages
- `@matter/main` - Main entry point package
- `@matter/examples` - Example applications and devices
- `@matter/create` - Project scaffolding tool
- `@project-chip/matter.js` - Legacy compatibility package

### Development Tools
- `packages/tools` - Build system, documentation generation, project management
- `support/codegen` - Code generation from Matter specifications
- `support/chip-testing` - Integration with Project CHIP/connectedhomeip for testing

## Code Generation System

This project heavily uses code generation:

### Cluster Generation
- Clusters are generated from Matter specifications in `support/codegen/src/clusters/`
- Use `ClusterFile`, `ClusterComponentGenerator` for cluster definitions
- Generated files follow pattern: `src/clusters/[ClusterName].ts`

### Endpoint Generation  
- Device endpoints generated in `support/codegen/src/endpoints/`
- Use `EndpointFile`, `RequirementGenerator` for device type definitions
- Generated files follow pattern: `src/endpoints/[DeviceType].ts`

### Forward Exports
- Re-export generation in `support/codegen/src/forwards/`
- Creates proxy modules for clean package boundaries
- Generated files include header: `/*** THIS FILE IS GENERATED, DO NOT EDIT ***/`
- Pattern for main package forwards: `packages/main/src/forwards/[category]/[name].ts`

## Development Patterns

### Behaviors
- Core abstraction for endpoint functionality in `@matter/node`
- Extend `Behavior` class for cluster implementations
- Use `@behavior` decorator for registration
- File pattern: `src/behaviors/[cluster-name]/[ClusterName]Behavior.ts`

### Environment and ServerNode
- `Environment` provides platform-specific runtime services registered by each platform (Node.js, React Native, etc.)
- Access the default environment for your platform using `Environment.default`
- Create `ServerNode` instances for Matter devices:
  ```typescript
  const server = await ServerNode.create({
    id: "unique-device-id",
    network: { port: 5540 },
    commissioning: { passcode: 20202021, discriminator: 3840 },
    // ... other config
  });
  ```
- Add endpoints to nodes: `await server.add(endpoint);`
- Start the server non-blocking: `await server.start();` (resolves when online)
- Run the server blocking: `await server.run();` (resolves when server shuts down)
- See `packages/examples/src/device-onoff-advanced/DeviceNodeFull.ts` for comprehensive examples

### Models
- Use `ClusterModel`, `DeviceTypeModel`, `AttributeModel` etc. from `@matter/model`
- Models represent Matter specification elements
- Support variance analysis for conditional features

### Type Safety
- Extensive use of TypeScript generics and conditional types
- **IMPORTANT**: Requires at least `"strictNullChecks": true` or preferably `"strict": true`
- Base TypeScript configuration in `packages/tools/tsc/tsconfig.base.json` uses `"strict": true`
- `MutableCluster` for runtime cluster composition
- Schema validation with `Schema` classes

## CLI Tools and Examples

### Available CLI Tools
- `matter-build` - Build packages and documentation
- `matter-run` - Execute TypeScript files with automatic transpilation and source maps  
- `matter-test` - Run tests across workspace packages
- `matter-create` - Scaffolding tool for new Matter.js projects
- `matter-version` - Version management tool

### Example Applications  
The repository includes ready-to-run example applications:
```bash
npm run matter-device       # Simple on/off device
npm run matter-bridge       # Bridge with multiple devices
npm run matter-composeddevice # Composed device example
npm run matter-multidevice  # Multiple device example
npm run matter-controller   # Controller example
npm run shell              # Interactive Matter shell
```

### Running Examples
Use `matter-run` to execute any TypeScript example directly:
```bash
matter-run packages/examples/src/device-onoff/DeviceNode.ts
matter-run packages/examples/src/controller/ControllerNode.ts
```

## TypeScript Configuration

### Required Settings
- **Minimum required**: `"strictNullChecks": true`
- **Recommended**: `"strict": true` for best type safety
- **Module settings**: `"module": "node16"`, `"moduleResolution": "node16"`
- **Target**: `"es2022"` minimum
- **Key settings from base config**:
  ```json
  {
    "compilerOptions": {
      "strict": true,
      "target": "es2022", 
      "module": "node16",
      "moduleResolution": "node16",
      "composite": true,
      "esModuleInterop": true,
      "noImplicitAny": true,
      "noImplicitOverride": true,
      "isolatedModules": true
    }
  }
  ```

### Project References
- All packages use TypeScript project references
- Managed automatically by build tools in `packages/tools/src/building/tsconfig.ts`
- Incremental compilation via `"composite": true`
- Separate configs for lib, app, and test builds

## Build System

### Project Structure
- Monorepo managed with custom build tools in `packages/tools`
- Use `matter-build` command for building packages (via node_modules/.bin/)
- Custom `matter-run` for executing TypeScript files with source maps
- Custom `matter-test` for running tests across packages
- Support for ESM and CommonJS outputs
- TypeScript project references for incremental builds

### Key Build Commands
```bash
npm run build          # Build all packages
npm run build-clean    # Clean build and rebuild all packages
npm run build-doc      # Generate documentation
npm run clean          # Clean all build outputs
matter-build           # Direct build tool (via node_modules/.bin/matter-build)
```

### Code Generation Commands
Code generation is handled through TypeScript files in `support/codegen/src/`:
```bash
# Run code generation scripts with matter-run
matter-run support/codegen/src/generate-spec.ts        # Generate from Matter spec
matter-run support/codegen/src/generate-clusters.ts    # Generate cluster definitions  
matter-run support/codegen/src/generate-endpoints.ts   # Generate endpoint definitions
matter-run support/codegen/src/generate-forwards.ts    # Generate forward exports
matter-run support/codegen/src/generate-model.ts       # Generate data models
matter-run support/codegen/src/generate-vscode.ts      # Generate VS Code configuration
```

## Testing Patterns

### Unit Tests
- Use custom `matter-test` framework (not Jest directly)
- Test files: `*.test.ts` alongside source files
- Run tests with `npm run test` or `matter-test -w`
- Mock external dependencies, especially platform-specific code
- Tests are run for ESM, CJS, and web (when Playwright is installed) module formats

#### Available CLI Options for `matter-test`:
```bash
matter-test [options] [command]

Commands:
  esm      # Run tests on Node.js (ES6 modules)
  cjs      # Run tests on Node.js (CommonJS modules)  
  web      # Run tests in web browser
  report   # Display details about tests
  manual   # Start web test server for manual testing

Options:
  -p, --prefix <dir>        # Directory of package to test (default: ".")
  -w, --web                 # Enable web tests in default test mode
  --spec <paths>            # One or more test paths (default: "./test/**/*{.test,Test}.ts")
  --all-logs                # Emit log messages in real time
  --debug                   # Enable Mocha debugging
  -e, --environment <name>  # Select named test environment
  -f, --fgrep <string>      # Only run tests matching this string
  --force-exit              # Force Node to exit after tests complete
  -g, --grep <regexp>       # Only run tests matching this regexp
  -i, --invert              # Inverts --grep and --fgrep matches
  --profile                 # Write profiling data to build/profiles (Node only)
  --wtf                     # Enlist wtfnode to detect test leaks
  --trace-unhandled         # Detail unhandled rejections with trace-unhandled
  --clear                   # Clear terminal before testing
  --report                  # Display test summary after testing
  --pull                    # Update containers before testing (default: true)
```

### Integration Tests
- Device commissioning and interaction tests in `support/tests`
- Use `@matter/examples` for test scenarios  
- CHIP tool integration for interoperability testing
- Located in `support/chip-testing` package

### Running Tests
```bash
npm run test           # Run all tests in workspace
matter-test -w         # Run tests with workspace scanning
matter-test <package>  # Run tests for specific package
```

## Coding Guidelines

### File Organization
- One main export per file
- Use barrel exports (`index.ts`) for public APIs
- Separate internal utilities with `.internal.ts` suffix

### Naming Conventions
- PascalCase for classes, interfaces, types
- camelCase for functions, variables, properties
- SCREAMING_SNAKE_CASE for constants
- PascalCase for files containing a major class, otherwise kebab-case

### Import Patterns
```typescript
// Prefer specific imports with package aliases (when available in package)
import { ClusterModel } from "#model";

// Use type-only imports when possible with package aliases
import type { Cluster } from "#types";

// External package imports
import { ClusterModel } from "@matter/model";
import type { Cluster } from "@matter/types";

// Internal imports use relative paths with .js extension
import { someUtility } from "./utils.js";

// Platform imports
import "@matter/main/platform";  // Must be imported first for platform setup
export * from "@matter/node/behaviors";
```

### Error Handling
- Use specific error classes: `CommissioningError`, `ConstraintError`, etc.
- Provide detailed error messages with context
- Use `MatterError` as base class for Matter-specific errors

### Async Patterns
- Prefer `async/await` over Promises
- Use `using` for resource management where applicable
- Handle cancellation with `AbortSignal` when appropriate

## Matter Protocol Specifics

### Clusters
- Implement server behaviors for device functionality
- Use feature flags for conditional cluster elements
- Support both mandatory and optional cluster features

### Commissioning
- Follow Matter commissioning flow patterns
- Handle network credentials securely
- Support both WiFi and Thread network setup

### Data Types
- Use TLV (Tag-Length-Value) encoding for Matter data
- Implement proper schema validation
- Support fabric-scoped data handling

## Documentation

### Code Documentation
- Use JSDoc for all public APIs
- Include `@see` references to Matter specification sections
- Document cluster conformance requirements

### Examples
- Provide working examples in `@matter/examples`
- Include both device and controller examples
- Document setup and usage instructions

## Platform Considerations

### Node.js
- Use platform abstractions from `@matter/general`
- Implement platform-specific code in `@matter/nodejs`
- Support both CommonJS and ESM module systems

### Cross-Platform
- Avoid Node.js-specific APIs in core packages
- Use dependency injection for platform services
- Test on multiple Node.js versions (20.x, 22.x, 24.x)

## Performance Guidelines

- Use lazy initialization for expensive operations
- Cache cluster definitions and models
- Minimize memory allocations in hot paths
- Use efficient data structures for large datasets

## Security Considerations

- Handle cryptographic operations through `@matter/general/crypto`
- Validate all input data with schemas
- Implement proper access control for cluster operations
- Follow Matter security requirements for commissioning

## PR Verification Requirements

**MANDATORY**: All PRs must be verified by running the following commands to prove the changes work correctly:

1. **Build verification**: `npm run build` - Must complete successfully without errors
2. **Lint verification**: `npm run lint` - Must pass with no linting issues  
3. **Format verification**: `npm run format-verify` - Must pass with no formatting issues (run `npm run format` to fix any issues)
4. **Test verification**: `npm run test` - Must pass all relevant tests (ESM/CJS tests required, web tests optional if Playwright setup unavailable)

Alternative test commands if web tests fail due to missing browser setup:
- `node packages/testing/bin/test.js esm` - Run ESM tests only
- `node packages/testing/bin/test.js cjs` - Run CJS tests only

Note: Web tests may still fail if Playwright browsers cannot be installed due to firewall or download issues. The core ESM and CJS tests provide sufficient verification of functionality.

Document verification results in the PR comment to demonstrate that all changes have been properly tested.