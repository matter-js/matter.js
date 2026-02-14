# @license
# Copyright 2022-2026 Matter.js Authors
# SPDX-License-Identifier: Apache-2.0

# matter.js devcontainer

# Includes dev tools required for matter.js, claude code, quality-of-life tweaks, and attempts to lock down the
# "matter" user so that it cannot run arbitrary code as root

FROM mcr.microsoft.com/devcontainers/javascript-node:24-bookworm

ARG TZ
ENV TZ="$TZ"

ARG CLAUDE_CODE_VERSION=latest

# Install firewall utilities and developer tools
RUN apt-get update && apt-get install -y --no-install-recommends \
  less \
  procps \
  fzf \
  zsh \
  man-db \
  unzip \
  gnupg2 \
  gh \
  iptables \
  ipset \
  iproute2 \
  dnsutils \
  aggregate \
  jq \
  nano \
  vim \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Configure non-privileged user
ARG USERNAME=matter
RUN adduser --disabled-password --gecos "" $USERNAME

# Configure bash history mount
RUN mkdir /home/$USERNAME/.commandhistory \
  && touch /home/$USERNAME/.commandhistory/history \
  && chown -R $USERNAME:$USERNAME /home/$USERNAME/.commandhistory

ENV DEVCONTAINER=true

# Create Claude config directory
RUN mkdir -p /home/$USERNAME/.claude && \
  chown -R $USERNAME:$USERNAME /home/$USERNAME/.claude

# Install git-delta for better diffs
ARG GIT_DELTA_VERSION=0.18.2
RUN ARCH=$(dpkg --print-architecture) && \
  wget "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

# Prep for Playwright
RUN npx playwright install-deps

# Configure non-privileged user
USER $USERNAME

# Set the default shell to zsh
ENV SHELL=/bin/zsh
ENV EDITOR=vim
ENV VISUAL=nano

# Configure zsh to improve quality of life
ARG ZSH_IN_DOCKER_VERSION=1.2.0
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh)" -- \
  -p git \
  -p fzf \
  -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
  -a "source /usr/share/doc/fzf/examples/completion.zsh" \
  -a "export PROMPT_COMMAND='history -a' && export HISTFILE=/home/$USERNAME/.commandhistory/history" \
  -x

# Default p9k config only tells you the immediate dir you're in
RUN echo 'POWERLEVEL9K_SHORTEN_STRATEGY="truncate_from_left"' >> /home/$USERNAME/.zshrc

# Install Claude Code globally
RUN curl -fsSL https://claude.ai/install.sh | bash

# The user we use for LLMs should not have elevated privileges beyond the sudoable scripts below
RUN rm -f /etc/sudoers.d/$USERNAME

# Switch back to root to install files that we may have edited
USER root

# Configure scripts we run as sudo; these must be copied at build time to prevent edits from within container
COPY ./bin/set-permissions.sh ./bin/init-firewall.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/init-firewall.sh && \
  echo "$USERNAME ALL=(root) NOPASSWD: /usr/local/bin/set-permissions.sh" > /etc/sudoers.d/$USERNAME-permissions && \
  echo "$USERNAME ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/$USERNAME-firewall && \
  chmod 0440 /etc/sudoers.d/$USERNAME-*

# Do not run as superuser by default
USER $USERNAME
