#!/usr/bin/env sh
# Distinct warnings and errors in a server or web log, with counts, from an
# optional line onwards. Known dev-only noise is hidden and counted, not printed.
# Usage: log-errors.sh <log file> [from line]
set -eu

log="${1:?pass the log file, e.g. server.log}"
from="${2:-1}"
total=$(wc -l < "$log")
noise="Cannot read properties of null \(reading 'append'\)|\[vite\] \(client\) \[console\.error\]"

lines=$(tail -n "+$from" "$log" | grep -E "WARN|ERROR|[Ee]rror|[Ww]arning|$noise" || true)
hidden=$(printf '%s\n' "$lines" | grep -cE "$noise" || true)

echo "$log lines $from-$total (next run: pass $((total + 1)))"
printf '%s\n' "$lines" | grep -vE "$noise" | grep -v '^$' |
	sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[^ ]+ //; s/[0-9]{1,2}:[0-9]{2}:[0-9]{2}( [AP]M)? //; s/ \{$//' |
	cut -c1-200 | sort | uniq -c | sort -rn || true
[ "$hidden" -gt 0 ] && echo "($hidden known-noise lines hidden: devtools 'append', Vite console echo)"
exit 0
