#!/usr/bin/env node

import "../src/util/bootstrap.mjs";

const main = (await import("../dist/esm/building/embed-examples.js")).main;
await main();
