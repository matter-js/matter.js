# @matter/tools - Matter.js Tooling

This package provides testing support for other matter.js packages.

> Supports all Node.js LTS versions starting with 20.x

## Rational

We run three types of tests (ESM, common JS and browser bundle).  We support a large number of tests.  We want them to
run as quickly as possible and provide concise diagnostics on failure.

This framework focuses on above goals.  It standardizes test management and integrates with matter.js build tooling.

## Operation

We run tests using [Mocha](https://mochajs.org/) with
[chai](https://www.chaijs.com/) for assertions.  For multi-format modules we
run tests as both CJS and ESM.  For packages that support browsers we run tests
in a headless browser using [Playwright](https://playwright.dev/).

The [matter-test](./bin/test.js) scripts orchestrates test execution.  Use
`matter-test --help` for command line usage.

By default matter-test inspects `package.json` for the target module to
determine whether to test ESM, CJS or both under Node.  Web tests do not run by
default but you can enable them using the `-w` option.

`matter-test` supports
environment variables of the form `MATTER_<OPTION>` for most command line
arguments.  This includes `MATTER_SPEC`, `MATTER_PROFILE`, `MATTER_GREP`,
`MATTER_FGREP`, `MATTER_INVERT` and `MATTER_ALL_LOGS`.

Matter.js emits a significant volume of logging during testing.  By default,
`matter-test` captures these logs internally and only emits them when
reporting on failed tests.

The test environment orchestrated by this package installs a small number of
Mocks for Matter.js infrastructure singletons.
[global-declarations.ts](src/global-declarations.ts) defines a global
API for these mocks.
