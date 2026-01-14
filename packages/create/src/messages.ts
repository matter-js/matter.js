/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { stderr, stdout } from "node:process";
import { bold, dim, fittedTextOf, green, red, visibleWidthOf, yellow } from "./formatting.js";

const WELCOME_TO = "🎉 Welcome to";

const GRAPHIC = `
███╗   ███╗ █████╗ ████████╗████████╗███████╗██████╗         ▓▓╗▓▓▓▓▓▓▓╗
████╗ ████║██╔══██╗╚══██╔══╝╚══██╔══╝██╔════╝██╔══██╗        ▓▓║▓▓╔════╝
██╔████╔██║███████║   ██║      ██║   █████╗  ██████╔╝        ▓▓║▓▓▓▓▓▓▓╗
██║╚██╔╝██║██╔══██║   ██║      ██║   ██╔══╝  ██╔══██╗   ▓▓   ▓▓║╚════▓▓║
██║ ╚═╝ ██║██║  ██║   ██║      ██║   ███████╗██║  ██║▓▓╗╚▓▓▓▓▓╔╝▓▓▓▓▓▓▓║
╚═╝     ╚═╝╚═╝  ╚═╝   ╚═╝      ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝ ╚════╝ ╚══════╝`
    .trim()
    .replace(/[╚═╝╔╗║]+/g, chars => dim(chars));

const GRAPHIC_WIDTH = 72;

function join(parts: unknown[]) {
    return parts.map(part => (part instanceof Error ? part.message : `${part}`)).join(" ");
}

export function error(...parts: unknown[]) {
    stderr.write(fittedTextOf(`${red(bold("Error:"))} ${join(parts)}\n\n`));
}

export function notice(...parts: unknown[]) {
    stdout.write(fittedTextOf(`${green(join(parts))}\n\n`));
}

export function warning(...parts: unknown[]) {
    stdout.write(fittedTextOf(`${yellow(bold("Warning:"))} ${join(parts)}\n\n`));
}

export function info(...parts: unknown[]) {
    stdout.write(fittedTextOf(`${join(parts)}\n\n`));
}

export function welcome() {
    stdout.write(`${WELCOME_TO} ${bold("matter.js")}!\n\n`);
}

export function bigWelcome() {
    if (!stdout.isTTY || stdout.columns < GRAPHIC_WIDTH) {
        welcome();
        return;
    }

    const parts = Array<string>();

    const welcomePad = "".padStart(Math.floor((stdout.columns - visibleWidthOf(WELCOME_TO)) / 2));
    parts.push(`${welcomePad}${WELCOME_TO}`);

    parts.push("");

    const graphicPad = "".padStart(Math.floor((stdout.columns - GRAPHIC_WIDTH) / 2));
    parts.push(...GRAPHIC.split("\n").map(line => `${graphicPad}${line}`));

    parts.push("", "");

    stdout.write(parts.join("\n"));
}
