import { Bytes } from "#util/index.js";
import { Crypto, HashAlgorithm } from "./Crypto.js";
import { StandardCrypto } from "./StandardCrypto.js";

/**
 * StandardCrypto implementation that supports streaming hash computation.
 * Important: It collects chunks from async iterators into memory before computing the hash.
 *            This is mainly used in testing because of that
 */
export class StreamingStandardCrypto extends StandardCrypto {
    override computeHash(data: Parameters<Crypto["computeHash"]>[0], algorithmId?: HashAlgorithm) {
        // If it's an async iterator, collect all chunks first
        if (typeof data === "object" && data !== null && ("next" in data || Symbol.asyncIterator in data)) {
            const chunks: Uint8Array[] = [];
            const iterator: AsyncIterator<any> =
                Symbol.asyncIterator in data ? (data as any)[Symbol.asyncIterator]() : (data as AsyncIterator<any>);

            const collectAndHash = async () => {
                while (true) {
                    const result = await iterator.next();
                    if (result.done) break;
                    const chunk = result.value instanceof Uint8Array ? result.value : new Uint8Array(result.value);
                    chunks.push(chunk);
                }
                const combined = Bytes.concat(...chunks);
                return super.computeHash(combined, algorithmId);
            };
            return collectAndHash();
        }
        return super.computeHash(data, algorithmId);
    }
}
