# Default p9k config only tells you the immediate dir you're in
export POWERLEVEL9K_SHORTEN_STRATEGY="truncate_from_left"

# Should vscode IPC sockets become stale, fix them
if [ ! -S "$REMOTE_CONTAINERS_IPC" ]; then
    export REMOTE_CONTAINERS_IPC=$(ls -t /tmp/vscode-remote-containers-ipc-*.sock 2>/dev/null | head -1)
fi
if [ ! -S "$SSH_AUTH_SOCK" ]; then
    export SSH_AUTH_SOCK=$(ls -t /tmp/vscode-ssh-auth-*.sock 2>/dev/null | head -1)
fi
