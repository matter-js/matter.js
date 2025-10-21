#!/bin/bash

# Wrapper script for myprogram
# Captures stdout/stderr to log file and handles SIGTERM

# Path to the real executable
REAL_PROGRAM="./myprogram"

# Log file (hardcoded)
LOG_FILE="myprogram.log"

# Variable to store the PID of the wrapped process
CHILD_PID=""

# Function to handle SIGTERM
sigterm_handler() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Received SIGTERM, forwarding to child process (PID: $CHILD_PID)" | tee -a "$LOG_FILE"
    if [ -n "$CHILD_PID" ]; then
        kill -TERM "$CHILD_PID" 2>/dev/null
        wait "$CHILD_PID"
    fi
    exit 143  # Standard exit code for SIGTERM (128 + 15)
}

# Set up SIGTERM trap
trap sigterm_handler SIGTERM

# Log start
echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting myprogram with arguments: $@" | tee -a "$LOG_FILE"

# Run the real program with all arguments, capturing stdout and stderr
# Using process substitution to tee both streams
"$REAL_PROGRAM" "$@" > >(tee -a "$LOG_FILE") 2> >(tee -a "$LOG_FILE" >&2) &

# Store the PID
CHILD_PID=$!

# Wait for the process to complete
wait "$CHILD_PID"
EXIT_CODE=$?

# Log completion
echo "$(date '+%Y-%m-%d %H:%M:%S') - myprogram exited with code: $EXIT_CODE" | tee -a "$LOG_FILE"

# Exit with the same code as the wrapped program
exit $EXIT_CODE
