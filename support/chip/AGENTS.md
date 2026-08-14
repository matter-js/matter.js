Non-obvious details for agents working on this directory or `.github/workflows/build-test.chip.yml`.
Uncommitted per project convention — do not add to git.

## Native-per-architecture builds, not cross-compilation

`Dockerfile`'s `build`/`source`/`bins` stages are pinned `FROM --platform=$BUILDPLATFORM ...`, so the
actual CHIP compile always runs on the builder's own native arch, regardless of what `--platform`
the overall `docker buildx` invocation targets. `build-one`'s `TARGETPLATFORM` switch only picks a
`$CPU` string for a `$TARGET` variable that is never actually passed to `gn`/`ninja` — it doesn't
select a cross-compile toolchain. This means a build only produces correct binaries when
BUILDPLATFORM == TARGETPLATFORM, i.e. when the invoking host's native arch matches. There is no true
cross-compilation here (README says as much). The multi-arch pipeline therefore runs the *same*
unmodified `./bin/build chip-artifact` on two runners native to each arch (`ubuntu-latest` for
amd64, `ubuntu-24.04-arm` for arm64) rather than doing one `--platform linux/amd64,linux/arm64`
bake call, which would need QEMU for whichever arch didn't match the runner.

## CHIP_COMMIT must be computed once, not per architecture job

`sha.txt`'s value (or a fresh `bin/update-version` bump) is computed once in `workflow-conditions`
and passed to both `chip-image` (amd64) and `chip-image-arm64` via a `CHIP_COMMIT` env var on the
build step. Do NOT let each arch job call `./bin/update-version` independently — `update-version`
does a live `git ls-remote` against connectedhomeip's master branch, which can return a different
SHA in a job running even a few seconds later, and would then combine into a "multi-arch manifest"
whose two platforms silently point at different upstream CHIP source.

## Multi-arch publish tag scheme

`bin/publish` (pushes `:latest` only) is for local, single-arch manual use — kept for that purpose,
not used by CI's publish path. CI uses `bin/publish-arch <arch>` (pushes
`ghcr.io/matter-js/chip:<CHIP_COMMIT>-<arch>`, a real single-platform manifest, one job per arch)
followed by `bin/publish-manifest <arch>...` (one job, after both arch jobs succeed) which runs
`docker buildx imagetools create` referencing those arch-suffixed tags by name to assemble the
published `:latest` and `:<CHIP_COMMIT>` multi-arch manifest lists. The arch-suffixed tags are a
deliberate, permanent side effect (not cleaned up) — useful on their own for pulling a specific
platform's image directly, at the cost of extra tags accumulating in the registry over time.

## The bake `app` target matrix was dead code, now removed

`docker-bake.hcl` used to define a per-app image matrix (`chip-all-clusters`, `chip-lock`,
`chip-tv`, ...) built via a Dockerfile `app-bins`/`chip-app` stage pair. Both were broken (nonexistent
`install` stage, wrong GN roots) *and* orphaned: nothing in `.github/workflows/` ever referenced
`ghcr.io/matter-js/chip-<app>`. The per-app binaries that name-checked those apps
(`chip-lock-app`, `chip-tv-app`, etc.) are actually built by
`.github/actions/prepare-chip-testing/action.yml` via connectedhomeip's own
`build_examples.py --target linux-x64-<name>-<variant>` convention, entirely independent of this
Dockerfile/bake file. If per-app matter-js/chip-* images are wanted again, they need a fresh design,
not a resurrection of the removed stages.

## arm64 coverage is the core group plus a binary smoke check

`test-core-arm64` runs the core CHIP test group against the arm64 image on a native arm64 runner,
and `publish-image-arm64` gates on it. Every other group (`test-app-*`, `test-icd`, and the matterjs
controller variant of core) runs against the amd64 image only, so an arch-specific defect confined
to those paths would still ship. The app binaries the core group never starts get an execution check
in `chip-image-arm64`'s smoke step instead. Running the full matrix twice was judged not worth the
CI minutes.

## bin/shell and bin/app reference binaries this image does not have

Pre-existing, untouched by the multi-arch work: `bin/shell` names `ghcr.io/matter-js/chip-apps`,
which has never existed in `docker-bake.hcl`, and `bin/app`'s case statement resolves names such as
`lock`, `tv`, `microwave`, `rvc`, `evse` to binaries the image never contained. Only its
`all-clusters` and `bridge` cases match what `Dockerfile` actually bakes (`chip-tool`,
`chip-all-clusters-app`, `chip-all-clusters-app-nlfaultinject`, `chip-bridge-app`).
