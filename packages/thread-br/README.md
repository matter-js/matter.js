# Open Home Foundation Matter(.js) Server - Thread Border Router

![Matter Logo](https://github.com/matter-js/matterjs-server/raw/main/docs/matter_logo.svg)

Thread Border Router communication for the [OHF Matter Server](https://github.com/matter-js/matterjs-server/blob/main/README.md): mDNS BR discovery, dataset codec, MeshCoP/CoAP/DTLS-EC-JPAKE diagnostic queries, and OpenThread Border Router (OTBR) REST adapter.

This package is consumed internally by `@matter-server/ws-controller` to feed Thread BR-perspective routing, link-quality, child-table, and vendor data into the Matter Server dashboard for the entire Thread mesh — including non-Matter nodes.

## Using this package

### Discover Thread Border Routers (passive mDNS)

```ts
import { Environment } from "@matter/main";
import { BorderRouterRegistry } from "@matter-server/thread-br";

const registry = new BorderRouterRegistry(Environment.default);
await registry.start();
registry.events.added.on(br => console.log(br.networkName, br.extAddressHex, br.addresses));
// … later: await registry.stop();
```

### Decode a Thread Operational Dataset

```ts
import { OperationalDataset } from "@matter-server/thread-br";

const ds = OperationalDataset.decode("0e08...");   // hex from `ot-ctl dataset active -x`
console.log(ds.networkName, ds.channel);
const safe = OperationalDataset.redact(ds);        // clears pskc / networkKey for display
console.log(safe.networkName, safe.channel);       // secrets are undefined
```

### Query network diagnostics

Two paths, picked per Border Router:

- **OTBR REST** (auto-detected): when the BR exposes the OpenThread REST API.
- **MeshCoP** (CoAP over DTLS-EC-JPAKE): requires the network's credentials (PSKc), looked
  up by extended PAN ID from a `ThreadCredentialsRegistry`.

```ts
import { DefaultTlvSet, OtbrRestClient, OtbrRestDiagnosticSource, OtbrRestProbe } from "@matter-server/thread-br";

const cap = await OtbrRestProbe.probe(host, 8081, 1500);
if (cap) {
    const client = new OtbrRestClient({ host, port: 8081 });
    const source = new OtbrRestDiagnosticSource(client, cap);
    const handle = source.queryMulticast("ff03::2", { tlvTypes: [...DefaultTlvSet] });
    handle.onNode.on(node => console.log(node.extMacAddress, node.rloc16));
    await handle.done;
}
```

(For the MeshCoP path see `connectMeshcop` + `ThreadCredentialsRegistry`.)

## Development

Examples and integration scripts target a local OpenThread CLI simulator:

```bash
brew install openthread
```

## Live integration testing with ot-cli-ftd

The `noble` DTLS backend implements the DTLS 1.2 + EC-JPAKE handshake from scratch. Beyond the unit-test gate (recorded mbedtls flights replayed against our state machine) we also exercise it against a live mbedtls peer — the OpenThread CLI simulator (`ot-cli-ftd`), which uses mbedtls for its MeshCoP commissioner port. A successful handshake against `ot-cli-ftd` proves byte-level interop across every flight.

### Build prerequisite

Build `ot-cli-ftd` once. If you haven't:

```bash
git clone https://github.com/openthread/openthread.git ~/src/openthread
cd ~/src/openthread
./script/bootstrap
./script/cmake-build simulation
```

The binary lands at `~/src/openthread/build/simulation/examples/apps/cli/ot-cli-ftd`.

### Step-by-step procedure

**Terminal A — start the simulator and capture the dataset:**

```bash
cd ~/src/openthread
./build/simulation/examples/apps/cli/ot-cli-ftd 1
```

At the OT CLI prompt:

```
> dataset init new
Done
> dataset commit active
Done
> ifconfig up
Done
> thread start
Done
```

Wait a few seconds, then confirm the node has come up:

```
> state
leader
Done
> dataset active -x
0e08...   <-- copy this hex blob
Done
```

The simulator's MeshCoP DTLS service binds to a UDP port on the loopback. `DtlsConnectOpts.port` documents 49191 as the typical default, but real ports drift — confirm yours:

```bash
# In a third shell, find the actual port:
lsof -nP -iUDP -p $(pgrep -f ot-cli-ftd | head -1)
```

Look for an entry like `*:49191` or `*:49xxx` — that's the MeshCoP port.

**Terminal B — extract the PSKc and drive the handshake:**

```bash
cd <repo-root>
npm run build -w @matter-server/thread-br

cd packages/thread-br
PSKC=$(npm run --silent example -- examples/extract-pskc.ts <dataset-hex> 2>/dev/null)
npm run example -- examples/handshake-dtls.ts 127.0.0.1 <port> "$PSKC"
```

### Expected outcome

```
DTLS handshake established in NNNms.
```

If you see this, the noble EC-JPAKE backend interops with mbedtls byte-for-byte across the full DTLS 1.2 handshake (ClientHello → HelloVerifyRequest → ClientHello with cookie → ServerHello + ServerKeyExchange + ServerHelloDone → ClientKeyExchange + ChangeCipherSpec + Finished → ChangeCipherSpec + Finished).

### Failure modes

Errors surface as plain `Error` instances; the example prints `<name>: <message>`. Common patterns:

- **`Error: NobleDtlsSocket: connect timed out after 30000ms`** — UDP datagrams are not reaching the peer or no reply is coming back. Wrong port (re-run `lsof`), simulator stopped, or the peer rejected the ClientHello silently. On macOS, also check the firewall.
- **`Error: NobleDtlsSocket: peer alert level=2 desc=NN`** — the peer aborted with a fatal alert. `desc=20` (`bad_record_mac`) on the post-handshake AEAD is the classic PSKc-mismatch signature; `desc=40` (`handshake_failure`) shows up when EC-JPAKE state diverges.
- **`Error: DtlsClient: server round-1/round-2 ZKP verification failed`** — the peer's EC-JPAKE proof didn't validate. PSKc mismatch is the expected cause; if the PSKc is right, this is a wire-format bug worth capturing.
- **`Error: DtlsClient: server Finished verify_data mismatch`** — handshake transcript hashes diverge between client and server. Almost certainly a PRF / handshake-message-serialization bug — capture pcap and triage.
- **`Error: DtlsClient: handshake gave up after max retransmits`** — RFC 6347 §4.2.4 give-up. Same root causes as the connect timeout.
- **Anything else thrown from `DtlsClient` / record codecs** — wire-format mismatch with mbedtls. This is the bug class the live test is meant to surface; capture the failure log + handshake datagrams and triage.

### Capturing handshake bytes for triage

```bash
sudo tcpdump -i lo0 -w /tmp/dtls.pcap "udp port <port>" &
TCPDUMP_PID=$!
# ... run the test ...
sudo kill $TCPDUMP_PID
```

Open `/tmp/dtls.pcap` in Wireshark. Without the Thread / MeshCoP dissector you still see DTLS 1.2 record headers, fragment offsets, and epoch transitions, which is enough to locate where client and server diverge.

The Open Home Foundation Matter Server software component is a project of the [Open Home Foundation](https://www.openhomefoundation.org/).

Please refer to https://github.com/matter-js/matterjs-server/blob/main/README.md for more information.
