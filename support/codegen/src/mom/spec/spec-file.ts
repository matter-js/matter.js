/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#general";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { IntermediateModel } from "../common/intermediate-model.js";
import { loadClusters } from "./load-clusters.js";
import { loadDevices } from "./load-devices.js";
import { loadNamespaces } from "./load-namespaces.js";
import {
    DEFAULT_MATTER_VERSION,
    IndexDetail,
    discoverMarkdownFiles,
    identifyMarkdownDocument,
    isMarkdownSpecPath,
} from "./md/load-markdown-files.js";
import { translateCluster } from "./translate-cluster.js";
import { translateDevice } from "./translate-device.js";
import { translateGlobal } from "./translate-global.js";
import { translateNamespace } from "./translate-namespace.js";

const logger = Logger.get("spec-file");

export interface LoadOptions {
    document?: string;
    version?: string;
    path?: string;
}

export class SpecFile {
    #index: IndexDetail;
    #markdownContent: string;

    constructor(index: IndexDetail, markdownContent: string) {
        this.#index = index;
        this.#markdownContent = markdownContent;
    }

    get path() {
        return this.#index.ref.path;
    }

    get version() {
        return this.#index.version;
    }

    get #ref() {
        return { ...this.#index.ref, markdownContent: this.#markdownContent };
    }

    ingestClusters(target: IntermediateModel) {
        if (!this.#index.hasClusters) {
            return;
        }

        for (const ref of loadClusters(this.#ref)) {
            logger.info(`translate ${ref.name} (${ref.xref.document} § ${ref.xref.section})`);
            Logger.nest(() => {
                if (ref.type === "cluster") {
                    target.add(...translateCluster(ref));
                } else {
                    target.add(...translateGlobal(ref));
                }
            });
        }
    }

    ingestDevices(target: IntermediateModel) {
        if (!this.#index.hasDevices) {
            return;
        }

        for (const deviceRef of loadDevices(this.#ref)) {
            logger.info(`translate ${deviceRef.name} (${deviceRef.xref.document} § ${deviceRef.xref.section})`);
            Logger.nest(() => target.add(...translateDevice(deviceRef)));
        }
    }

    ingestNamespaces(target: IntermediateModel) {
        if (!this.#index.hasNamespaces) {
            return;
        }

        for (const nsRef of loadNamespaces(this.#ref)) {
            logger.info(`translate ${nsRef.name} (${nsRef.xref.document} § ${nsRef.xref.section})`);
            Logger.nest(() => target.add(...translateNamespace(nsRef)));
        }
    }

    static *load(options: LoadOptions) {
        const path =
            options.path ??
            process.env.MATTER_SPECIFICATION_PATH ??
            resolve(homedir(), "Dropbox", "matter", options.version ?? DEFAULT_MATTER_VERSION);

        if (!isMarkdownSpecPath(path)) {
            throw new Error(`Path ${path} is not a markdown spec directory. HTML spec input is no longer supported.`);
        }

        const docOrder: Record<string, number> = { cluster: 0, core: 1, device: 2, namespace: 3 };
        const loaded: SpecFile[] = [];

        for (const mdDoc of discoverMarkdownFiles(path, options.document)) {
            const index = identifyMarkdownDocument(mdDoc.indexPath);
            const file = new SpecFile(index, mdDoc.content);

            if (options.document === undefined || file.#index.ref.xref.document === options.document) {
                loaded.push(file);
            }
        }

        if (!loaded.length) {
            throw new Error(`No markdown spec documents found in ${path}`);
        }

        loaded.sort(
            (a, b) => (docOrder[a.#index.ref.xref.document] ?? 99) - (docOrder[b.#index.ref.xref.document] ?? 99),
        );

        yield* loaded;
    }
}
