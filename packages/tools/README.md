# @matter/tools - Matter.js Tooling

This package supports build and execution infrastructure for other matter.js packages.

> Supports all Node.js LTS versions starting with 20.x

## Rational

Matter.js consists of a large number of generated TypeScript files.  We support multiple module formats targeting
disparate JavaScript runtimes including Node and web browsers.  We publish a moderate (and growing) number of packages
to NPM.  We support Linux, Windows and MacOS.

Previously, TSC analysis and test times had become quite slow.  A proliferation of configuration files for TSC and test
framework was adding significant redundancy to the codebase.

This package standardizes and centralizes configuration for build and test.  It minimizes reliance on TSC and generally
does its best to run build and test as quickly as possible.

## Dev workflow

Although Matter.js relies on third-party tools for build and test, the interface is command-line oriented and unique to
Matter.js.  As such, it will be unfamiliar to new developers.

To minimize developer burden, we also maintain traditional `tsconfig.json` files with project references in each `src/`
and `test/`.  These files support traditional IDE and `tsc --watch` workflows and are largely (but not entirely) ignored
by the tooling package.

These files do add configuration overhead but we minimize this with a shared [tsconfig.base.json](tsconfig.base.json)
supplied by this package.

We also supply a standard `.mocharc.cjs` in packages with tests.  You can use this with your IDE's Mocha integration for
standard testing workflows.

## Build

We use [TSC](https://www.typescriptlang.org/docs/handbook/compiler-options.html) to validate TypeScript types and
generate declaration files.  We use [esbuild](https://esbuild.github.io/) for transcoding TypeScript to ESM (ES6 module
format) and CJS (CommonJS module format).

The [matter-build](./bin/build.js) script orchestrates TSC and esbuild.  It inspects `package.json` for the target
module to determine whether to emit ESM, CJS or both.

Use `matter-build --help` for command line usage.  If you run `matter-build` in a monorepo root it builds all packages
that have changed (or depend on other packages that have changed) since the last build.

`matter-build` itself is implemented in TypeScript.  It uses `esbuild` to bootstrap itself in fresh installs.

## Execution

We facilitate execution via [matter-run](bin/run.js). This command bootstraps tooling, transpiles the target module, and
executes the named JS or TS script.

`matter-run` understands Matter.js `package.json` conventions and automatically transpiles typescript files in the
target package prior to execution.

`matter-run` accepts a script to run and passes other arguments to the script verbatim.

If you set the environment variable `MATTER_ECHO`, `matter-run` will print the command line prior to invoking a script.
