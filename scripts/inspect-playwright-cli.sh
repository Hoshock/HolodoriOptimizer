#!/usr/bin/env bash
set -euxo pipefail

(
  cd /tmp
  npx -y @playwright/cli@latest --help | tee /tmp/playwright-cli-help.txt
)
SKILL_PATH=$(find ~/.npm/_npx -path '*/node_modules/@playwright/cli/skills/playwright-cli/SKILL.md' -print 2>/dev/null | head -n1)
if [ -z "$SKILL_PATH" ]; then
  echo "SKILL_PATH_NOT_FOUND"
  exit 2
fi

echo "=== PLAYWRIGHT CLI SKILL: $SKILL_PATH ==="
cat "$SKILL_PATH"
echo "=== END PLAYWRIGHT CLI SKILL ==="
exit 3
