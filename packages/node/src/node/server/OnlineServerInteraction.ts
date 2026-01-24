import { RemoteActorContext } from "#behavior/context/server/RemoteActorContext.js";
import { NotImplementedError } from "#general";
import {
    Interactable,
    Invoke,
    InvokeResult,
    NodeProtocol,
    Read,
    ReadResult,
    ServerInteraction,
    Subscribe,
    SubscribeResult,
    Write,
    WriteResult,
} from "#protocol";

export class OnlineServerInteraction implements Interactable<RemoteActorContext.Options> {
    readonly #interaction: ServerInteraction;

    constructor(node: NodeProtocol) {
        this.#interaction = new ServerInteraction(node);
    }

    async *read(request: Read, context: RemoteActorContext.Options): ReadResult {
        const session = RemoteActorContext(context).beginReadOnly();
        try {
            for await (const report of this.#interaction.read(request, session)) {
                yield report;
            }
        } finally {
            session[Symbol.dispose]();
        }
    }

    subscribe(_request: Subscribe, _context: RemoteActorContext.Options): SubscribeResult {
        throw new NotImplementedError("subscribe not implemented");
    }

    /**
     * Process write requests and return results.
     * The caller is responsible for messaging/chunking and list state tracking.
     */
    async write<T extends Write>(request: T, context: RemoteActorContext.Options): WriteResult<T> {
        return RemoteActorContext(context).act(session => this.#interaction.write(request, session));
    }

    /**
     * Process invoke requests and yield results.
     * The caller is responsible for messaging/chunking.
     */
    async *invoke(request: Invoke, context: RemoteActorContext.Options): InvokeResult {
        const session = RemoteActorContext({ ...context, command: true }).open();

        try {
            for await (const chunk of this.#interaction.invoke(request, session)) {
                yield chunk;
            }
        } catch (error) {
            await session.reject(error);
        }

        await session.resolve(undefined);
    }
}
