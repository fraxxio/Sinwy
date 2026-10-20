#!/usr/bin/env sh
# Distinct browser console errors with counts, from a playwright-cli console log
# (default: the newest one in .playwright-cli/). Strips the Vite dev server's
# repeated "[Server]" echo prefixes so one warning doesn't print as megabytes.
set -eu

log="${1:-$(ls -t .playwright-cli/console-*.log 2>/dev/null | head -n 1)}"
if [ -z "$log" ] || [ ! -f "$log" ]; then
	echo "No console log found. Run it from the repo root after a playwright-cli session, or pass the log file." >&2
	exit 1
fi

echo "$log"
pattern='^\[ *[0-9]+ms\] \[ERROR\]'
if ! grep -qE "$pattern" "$log"; then
	echo "No errors."
	exit 0
fi
grep -E "$pattern" "$log" |
	sed -E 's/^\[[^]]*\] \[ERROR\] //; s/(%c|\[Server\]|color: [^;]*;|font-weight: bold;|[0-9]{1,2}:[0-9]{2}:[0-9]{2} [AP]M|\[vite\] \(client\) \[console\.error\]| )+/ /g' |
	cut -c1-200 | sort | uniq -c | sort -rn
