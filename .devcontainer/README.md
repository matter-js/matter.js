# matter.js Development Container

This directory contains a devcontainer configuration for matter.js development. It provides a consistent Linux environment with all required tools pre-installed.

## Do I need this?

No. Native development works fine on macOS, Windows, and Linux. The devcontainer is useful when:

- You want a consistent, reproducible development environment
- You need to test matter.js alongside other Docker-based Matter components
- You want to use Claude Code with network isolation for unattended operation

**Note:** Due to networking differences, Matter devices running inside the container may not be discoverable from the host on macOS and Windows.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or compatible Docker engine)
- [VS Code](https://code.visualstudio.com/) with the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

### Docker Desktop settings (macOS)

Enable the following in Docker Desktop settings:

- Default containers set to dual IPv4/IPv6
- "Use kernel networking for UDP"
- "Enable host networking"

## Getting started

1. Open the matter.js repository in VS Code
2. When prompted, click **"Reopen in Container"** (or use the Command Palette: `Cmd+Shift+P` / `Ctrl+Shift+P` → "Dev Containers: Reopen in Container")
3. Wait for the container to build and initialize (first build takes several minutes)

Once running, the container provides:

- Node.js 22 (Debian Bookworm)
- Docker-in-Docker for running nested containers
- ZSH with productivity enhancements (fzf, git-delta)
- All matter.js dependencies installed via `npm ci`
- Playwright with headless Chromium for testing
- IPv6-enabled networking for Matter protocol communication

## Configuration files

| File                 | Purpose                                                 |
|----------------------|---------------------------------------------------------|
| `devcontainer.json`  | Container settings, VS Code extensions, volume mounts   |
| `docker-compose.yml` | Service definition, networking, capabilities            |
| `Dockerfile`         | Container image with all tools and Claude Code          |
| `init-firewall.sh`   | Network firewall for secure Claude Code operation       |
| `post-create.sh`     | Runs `npm ci` and installs Playwright on first creation |

## Using Claude Code in the devcontainer

The devcontainer comes with [Claude Code](https://code.claude.com) pre-installed and a network firewall that restricts outbound traffic to a set of whitelisted domains (npm registry, GitHub, Anthropic API, VS Code Marketplace).

### Interactive use

Open a terminal in VS Code and run:

```bash
claude
```

You will need to authenticate on first use. Follow the prompts to log in.

### Unattended use with --dangerously-skip-permissions

The firewall allows you to safely run Claude Code without permission prompts:

```bash
claude --dangerously-skip-permissions
```

This is safe because the firewall prevents the container from making outbound connections to anything other than the whitelisted services. See the [Claude Code devcontainer documentation](https://code.claude.com/docs/en/devcontainer) for details on the security model.

### Firewall details

The firewall (`init-firewall.sh`) runs automatically on every container start and:

- Allows outbound connections only to: npm registry, GitHub (web/api/git), Anthropic API, Sentry, Statsig, VS Code Marketplace
- Allows DNS and SSH traffic
- Allows localhost and host-network communication
- Blocks all other outbound traffic (default-deny policy)
- Verifies rules on startup by confirming `example.com` is blocked and `api.github.com` is reachable

If you need to allow additional domains (e.g., for a private npm registry), edit the domain list in `init-firewall.sh`.

### Persistent state

Claude Code configuration and command history are stored in named Docker volumes, so they persist across container rebuilds:

- `matter-js-claude-config-*` — Claude Code settings and authentication
- `matter-js-bashhistory-*` — Shell command history

## Customization

### Adding VS Code extensions

Edit the `customizations.vscode.extensions` array in `devcontainer.json`.

### Changing the Node.js version

Update the base image in `Dockerfile`:

```dockerfile
FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm
```

Replace `22` with your desired Node.js major version.

### Updating Claude Code

Rebuild the container to pull the latest version, or update manually inside a running container:

```bash
npm install -g @anthropic-ai/claude-code@latest
```

To pin a specific version, set the `CLAUDE_CODE_VERSION` build arg in `docker-compose.yml`.
