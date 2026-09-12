#!/usr/bin/env bash
set -euxo pipefail

(
  cd /tmp
  npx -y @playwright/cli@latest --help | tee /tmp/playwright-cli-help.txt
)
SKILL_PATH=$(grep -oE '/[^ ]*SKILL\.md' /tmp/playwright-cli-help.txt | head -n1 || true)
if [ -z "$SKILL_PATH" ]; then
  echo "SKILL_PATH_NOT_FOUND"
  find ~/.npm/_npx /tmp -name SKILL.md -print 2>/dev/null | head -50
  exit 2
fi

echo "=== PLAYWRIGHT CLI SKILL: $SKILL_PATH ==="
cat "$SKILL_PATH"
echo "=== END PLAYWRIGHT CLI SKILL ==="
exit 3
