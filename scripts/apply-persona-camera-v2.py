from pathlib import Path

index = Path("public/persona-ui/index.html")
text = index.read_text()
old_start = 'return `<div class="page"><i class="burst b1"></i>'
new_start = 'return `<div class="page"><div class="scene"><i class="burst b1"></i>'
old_end = '</section></div><div class="layer${menu ? " open" : ""}">${drawer()}</div></div>`;'
new_end = '</section></div></div><div class="layer${menu ? " open" : ""}">${drawer()}</div></div>`;'

if text.count(old_start) != 1:
    raise SystemExit(f"unexpected main() opening count: {text.count(old_start)}")
if text.count(old_end) != 1:
    raise SystemExit(f"unexpected main() closing count: {text.count(old_end)}")

index.write_text(text.replace(old_start, new_start, 1).replace(old_end, new_end, 1))

motion_source = Path("scripts/persona-motion-final.css")
Path("public/persona-ui/motion.css").write_text(motion_source.read_text())

# Remove all temporary application machinery from the resulting branch.
motion_source.unlink()
Path(__file__).unlink()

# Restore the repository's normal CI workflow in the same commit.
Path(".github/workflows/ci.yml").write_text(
    '''name: CI

on:
  pull_request:
  push:
    branches-ignore: [main]

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
      - run: pnpm test
      - run: pnpm build
'''
)
