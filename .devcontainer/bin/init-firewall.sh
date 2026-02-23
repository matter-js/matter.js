#!/bin/bash
# @license
# Copyright 2022-2026 Matter.js Authors
# SPDX-License-Identifier: Apache-2.0

# ROLE: Installed during container build; run with sudo via post-start.sh

# Network firewall for Claude Code devcontainer.  Restricts outbound connections to whitelisted
# domains only, implementing a default-deny policy.  This allows running Claude Code with
# --dangerously-skip-permissions safely.
#
# Based on the reference implementation at
# https://github.com/anthropics/claude-code/blob/main/.devcontainer/init-firewall.sh
#
# Differences from reference:
#   - IPv6 rules (ip6tables) mirror IPv4 since this devcontainer enables IPv6
#   - Docker container registries whitelisted for Docker-in-Docker support
#   - DNS allowed over both UDP and TCP
#   - Inbound DNS restricted to ESTABLISHED/RELATED
#   - Docker-in-Docker iptables rules preserved during flush
#   - Matter DCL (Distributed Compliance Ledger) hosts whitelisted
#   - mDNS (UDP 5353) and Matter protocol (UDP 5540+) allowed for device communication

set -euo pipefail
IFS=$'\n\t'

# ---------------------------------------------------------------------------
# 1. Preserve Docker-managed rules BEFORE flushing
# ---------------------------------------------------------------------------
DOCKER_DNS_RULES=$(iptables-save -t nat | grep "127\.0\.0\.11" || true)

# Preserve Docker-in-Docker rules (DOCKER, DOCKER-ISOLATION, etc.)
DOCKER_FILTER_RULES=""
DOCKER_NAT_RULES=""
if iptables-save -t filter | grep -q "DOCKER"; then
    DOCKER_FILTER_RULES=$(iptables-save -t filter | grep -E "DOCKER" || true)
fi
if iptables-save -t nat | grep -qE "DOCKER(?!_OUTPUT|_POSTROUTING)" 2>/dev/null; then
    DOCKER_NAT_RULES=$(iptables-save -t nat | grep -vE "127\.0\.0\.11" | grep -E "DOCKER" || true)
fi

# ---------------------------------------------------------------------------
# 2. Flush and rebuild
# ---------------------------------------------------------------------------
iptables -F
iptables -X 2>/dev/null || true
iptables -t nat -F
iptables -t nat -X 2>/dev/null || true
iptables -t mangle -F
iptables -t mangle -X 2>/dev/null || true

ip6tables -F
ip6tables -X 2>/dev/null || true
ip6tables -t nat -F
ip6tables -t nat -X 2>/dev/null || true
ip6tables -t mangle -F
ip6tables -t mangle -X 2>/dev/null || true

ipset destroy allowed-domains 2>/dev/null || true
ipset destroy allowed-domains-v6 2>/dev/null || true

# ---------------------------------------------------------------------------
# 3. Restore Docker DNS resolution rules
# ---------------------------------------------------------------------------
if [ -n "$DOCKER_DNS_RULES" ]; then
    echo "Restoring Docker DNS rules..."
    iptables -t nat -N DOCKER_OUTPUT 2>/dev/null || true
    iptables -t nat -N DOCKER_POSTROUTING 2>/dev/null || true
    echo "$DOCKER_DNS_RULES" | xargs -L 1 iptables -t nat
else
    echo "No Docker DNS rules to restore"
fi

# ---------------------------------------------------------------------------
# 4. Base rules: DNS, SSH, localhost (IPv4 + IPv6)
# ---------------------------------------------------------------------------

# Allow outbound DNS (UDP + TCP)
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT
ip6tables -A OUTPUT -p udp --dport 53 -j ACCEPT
ip6tables -A OUTPUT -p tcp --dport 53 -j ACCEPT

# Allow inbound DNS responses (ESTABLISHED/RELATED only)
iptables -A INPUT -p udp --sport 53 -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A INPUT -p tcp --sport 53 -m state --state ESTABLISHED,RELATED -j ACCEPT
ip6tables -A INPUT -p udp --sport 53 -m state --state ESTABLISHED,RELATED -j ACCEPT
ip6tables -A INPUT -p tcp --sport 53 -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow outbound SSH
iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT
ip6tables -A OUTPUT -p tcp --dport 22 -j ACCEPT
ip6tables -A INPUT -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT

# Allow localhost
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
ip6tables -A INPUT -i lo -j ACCEPT
ip6tables -A OUTPUT -o lo -j ACCEPT

# Allow ICMPv6 (required for IPv6 neighbor discovery)
ip6tables -A INPUT -p icmpv6 -j ACCEPT
ip6tables -A OUTPUT -p icmpv6 -j ACCEPT

# Allow mDNS (UDP 5353) for Matter device discovery
iptables -A OUTPUT -p udp --dport 5353 -d 224.0.0.251 -j ACCEPT
iptables -A INPUT -p udp --dport 5353 -d 224.0.0.251 -j ACCEPT
ip6tables -A OUTPUT -p udp --dport 5353 -d ff02::fb -j ACCEPT
ip6tables -A INPUT -p udp --dport 5353 -d ff02::fb -j ACCEPT

# Allow Matter protocol communication (UDP 5540+) on local/Docker networks
# Matter uses UDP for secure channel messaging between devices
iptables -A OUTPUT -p udp --dport 5540:5560 -j ACCEPT
iptables -A INPUT -p udp --dport 5540:5560 -j ACCEPT
ip6tables -A OUTPUT -p udp --dport 5540:5560 -j ACCEPT
ip6tables -A INPUT -p udp --dport 5540:5560 -j ACCEPT

# ---------------------------------------------------------------------------
# 5. Build allowed-domains ipsets (IPv4 + IPv6)
# ---------------------------------------------------------------------------
ipset create allowed-domains hash:net
ipset create allowed-domains-v6 hash:net family inet6

# Fetch GitHub meta information and aggregate + add their IP ranges
#echo "Fetching GitHub IP ranges..."
gh_ranges=$(curl -s https://api.github.com/meta)
if [ -z "$gh_ranges" ]; then
    echo "ERROR: Failed to fetch GitHub IP ranges"
    exit 1
fi

if ! echo "$gh_ranges" | jq -e '.web and .api and .git' >/dev/null; then
    echo "ERROR: GitHub API response missing required fields"
    exit 1
fi

# GitHub IPv4 ranges (aggregated)
echo "Processing GitHub IPv4 ranges..."
while read -r cidr; do
    if [[ ! "$cidr" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/[0-9]{1,2}$ ]]; then
        echo "ERROR: Invalid CIDR range from GitHub meta: $cidr"
        exit 1
    fi
    ipset add allowed-domains "$cidr"
done < <(echo "$gh_ranges" | jq -r '(.web + .api + .git)[]' | grep -v ':' | aggregate -q)

# GitHub IPv6 ranges
echo "Processing GitHub IPv6 ranges..."
while read -r cidr; do
    if [[ ! "$cidr" =~ : ]]; then
        continue
    fi
    ipset add allowed-domains-v6 "$cidr" 2>/dev/null || true
done < <(echo "$gh_ranges" | jq -r '(.web + .api + .git)[]' | grep ':')

# Resolve and add other allowed domains (including Docker registries for Docker-in-Docker)
for domain in \
    "registry.npmjs.org" \
    "api.anthropic.com" \
    "claude.ai" \
    "platform.claude.com" \
    "sentry.io" \
    "statsig.anthropic.com" \
    "statsig.com" \
    "marketplace.visualstudio.com" \
    "vscode.blob.core.windows.net" \
    "update.code.visualstudio.com" \
    "registry-1.docker.io" \
    "auth.docker.io" \
    "production.cloudflare.docker.com" \
    "ghcr.io" \
    "on.dcl.csa-iot.org" \
    "on.test-net.dcl.csa-iot.org"; do
    echo "Resolving $domain..."

    # IPv4 A records
    ips=$(dig +noall +answer A "$domain" | awk '$4 == "A" {print $5}')
    if [ -n "$ips" ]; then
        while read -r ip; do
            if [[ ! "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
                echo "ERROR: Invalid IPv4 from DNS for $domain: $ip"
                exit 1
            fi
            ipset add allowed-domains "$ip" 2>/dev/null || true
        done < <(echo "$ips")
    fi

    # IPv6 AAAA records
    ips6=$(dig +noall +answer AAAA "$domain" | awk '$4 == "AAAA" {print $5}')
    if [ -n "$ips6" ]; then
        while read -r ip6; do
            if [[ ! "$ip6" =~ : ]]; then
                echo "ERROR: Invalid IPv6 from DNS for $domain: $ip6"
                exit 1
            fi
            ipset add allowed-domains-v6 "$ip6" 2>/dev/null || true
        done < <(echo "$ips6")
    fi

    if [ -z "$ips" ] && [ -z "$ips6" ]; then
        echo "WARNING: Failed to resolve $domain (skipping)"
    fi
done

# ---------------------------------------------------------------------------
# 6. Host network access
# ---------------------------------------------------------------------------
HOST_IP=$(ip route | grep default | cut -d" " -f3)
if [ -z "$HOST_IP" ]; then
    echo "ERROR: Failed to detect host IP"
    exit 1
fi

HOST_NETWORK=$(echo "$HOST_IP" | sed "s/\.[0-9]*$/.0\/24/")
echo "Host network detected as: $HOST_NETWORK"

iptables -A INPUT -s "$HOST_NETWORK" -j ACCEPT
iptables -A OUTPUT -d "$HOST_NETWORK" -j ACCEPT

# Allow link-local and Docker IPv6 networks
ip6tables -A INPUT -s fe80::/10 -j ACCEPT
ip6tables -A OUTPUT -d fe80::/10 -j ACCEPT
ip6tables -A INPUT -s fd00::/8 -j ACCEPT
ip6tables -A OUTPUT -d fd00::/8 -j ACCEPT

# ---------------------------------------------------------------------------
# 7. Default-deny policies (IPv4 + IPv6)
# ---------------------------------------------------------------------------
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

ip6tables -P INPUT DROP
ip6tables -P FORWARD DROP
ip6tables -P OUTPUT DROP

# Allow established connections
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
ip6tables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
ip6tables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow only specific outbound traffic to allowed domains (IPv4 + IPv6)
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT
ip6tables -A OUTPUT -m set --match-set allowed-domains-v6 dst -j ACCEPT

# Explicitly REJECT all other outbound traffic for immediate feedback
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited
ip6tables -A OUTPUT -j REJECT --reject-with icmp6-adm-prohibited

# ---------------------------------------------------------------------------
# 8. Verification
# ---------------------------------------------------------------------------
echo "Firewall configuration complete"
echo "Verifying firewall rules..."
if curl --connect-timeout 5 https://example.com >/dev/null 2>&1; then
    echo "ERROR: Firewall verification failed - was able to reach https://example.com"
    exit 1
else
    echo "Firewall verification passed - unable to reach https://example.com as expected"
fi

if ! curl --connect-timeout 5 https://api.github.com/zen >/dev/null 2>&1; then
    echo "ERROR: Firewall verification failed - unable to reach https://api.github.com"
    exit 1
else
    echo "Firewall verification passed - able to reach https://api.github.com as expected"
fi
