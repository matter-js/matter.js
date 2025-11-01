/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from "node:fs";
import wordListPath from "word-list";

export const Words = new Set(readFileSync(wordListPath, "utf-8").split("\n"));

Words.add("namespace");
Words.add("config");
Words.add("systime");
Words.add("dataset");
Words.add("min");
Words.add("max");
Words.add("setpoint");
Words.add("setpoints");
Words.add("struct");
Words.add("structs");
Words.add("pausable");
Words.add("passphrase");
Words.add("arl");
Words.add("passcode");
Words.add("led");
Words.add("url");
Words.add("wifi");

// Acronym for "micro reciprocal degrees" used by color cluster
Words.add("mireds");
