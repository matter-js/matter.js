/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Crypto, Duration, Environment, InternalError, Millis, Time } from "@matter/main";
import {
    CommissionableMdnsAdvertisement,
    MdnsAdvertisement,
    MdnsAdvertiser,
    MdnsService,
    type ServiceDescription,
} from "@matter/main/protocol";

const TXT_POLL = Millis(250);

/**
 * A commissionable advertisement the harness publishes on a TH's behalf: it names the TH's own port and
 * carries TXT entries the TH does not advertise itself.
 *
 * A plan step that has the TH add something to its advertisement "by any means" cannot be met on a chip
 * TH, which advertises only what its build does. The alias advertises the harness's own addresses, so
 * the TH must listen on this host: `chip-local` and `matterjs` do.
 */
export interface CommissionableAlias {
    /** The alias's service instance name, under which its TXT entries can be read back from the cache. */
    readonly qname: string;

    close(): Promise<void>;
}

export async function advertiseCommissionableAlias(
    description: ServiceDescription.Commissionable & { port: number },
    extraTxt: Record<string, string>,
): Promise<CommissionableAlias> {
    const mdns = Environment.default.get(MdnsService);
    await mdns.construction;

    const advertiser = new ExtraTxtAdvertiser(Environment.default.get(Crypto), mdns.server, description.port, extraTxt);
    const advertisement = advertiser.advertise(description, "startup");
    if (!(advertisement instanceof MdnsAdvertisement)) {
        await advertiser.close();
        throw new InternalError(
            `The advertiser produced no advertisement for discriminator ${description.discriminator}`,
        );
    }

    return {
        qname: advertisement.qname,
        close: () => advertiser.close(),
    };
}

/**
 * The value of TXT key `key` in the record cached for `qname`, waiting up to `timeout` for it to arrive.
 * Read from this process's DNS-SD cache, which receives what this process's own responder multicasts,
 * so it shows the record that went out rather than what was asked for.
 */
export async function cachedTxtValue(qname: string, key: string, timeout: Duration): Promise<string | undefined> {
    const mdns = Environment.default.get(MdnsService);
    await mdns.construction;

    for (let polls = Math.ceil(timeout / TXT_POLL); ; polls--) {
        const value = mdns.names.maybeGet(qname)?.parameters.get(key);
        if (value !== undefined || polls <= 0) {
            return value;
        }
        await Time.sleep("alias TXT record", TXT_POLL);
    }
}

class ExtraTxtAdvertiser extends MdnsAdvertiser {
    readonly #extraTxt: Record<string, string>;

    constructor(crypto: Crypto, server: MdnsService["server"], port: number, extraTxt: Record<string, string>) {
        super(crypto, server, { port });
        this.#extraTxt = extraTxt;
    }

    override getAdvertisement(description: ServiceDescription): MdnsAdvertisement | undefined {
        if (description.kind !== "commissionable") {
            return super.getAdvertisement(description);
        }
        return new ExtraTxtCommissionableAdvertisement(this, description, this.#extraTxt);
    }
}

class ExtraTxtCommissionableAdvertisement extends CommissionableMdnsAdvertisement {
    readonly #extraTxt: Record<string, string>;

    constructor(
        advertiser: MdnsAdvertiser,
        description: ServiceDescription.Commissionable,
        extraTxt: Record<string, string>,
    ) {
        super(advertiser, description);
        this.#extraTxt = extraTxt;
    }

    override get txtValues() {
        return { ...super.txtValues, ...this.#extraTxt };
    }
}
