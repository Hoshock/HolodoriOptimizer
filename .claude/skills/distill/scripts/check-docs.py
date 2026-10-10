#!/usr/bin/env python3
"""文書ルートの索引と相対リンクの整合を検査する。distill の手順5から呼ぶ。

使い方: check-docs.py [docs-root]
  docs-root: 文書ルート。リポジトリのルートからの相対パスで、既定は docs。所有者ごとに
  docs/<owner>/ をルートにするリポジトリでは、そのディレクトリを渡す(例: check-docs.py docs/hoshock)。

- <root>/index.md: <root> 配下のすべての .md に行があるか、各行が存在するファイルを指しているか
  (<root>/adr/*.md は、<root>/adr/index.md があればそちらで確かめる。<root>/ai/tmp/ の行は、ファイルが
  なくても残しておく行なので、存在を問わない)
- 相対リンク: リポジトリ内の CLAUDE.md ・ AGENTS.md、ルートの README.md、<root>/ ・ .claude/skills/ の .md の
  リンク先が存在するか(<root>/ai/snapshots/ は作成日時点の記録で更新しないので対象外。コードブロック・
  インラインコード・`<...>` のプレースホルダも対象外)

リポジトリのルートは git から求める(git 管理外ならカレントディレクトリ)。<root>/index.md がなければ、
この規約を使っていないリポジトリとみなし、何もせず終了コード 0 で終わる。
問題がなければ何も出力せず終了コード 0。問題があれば1件1行で出力し、終了コード 1。
"""

import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(
    subprocess.run(
        ["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True
    ).stdout.strip()
    or Path.cwd()
).resolve()
DOCS = (ROOT / (sys.argv[1] if len(sys.argv) > 1 else "docs")).resolve()
ADR = DOCS / "adr"
RESERVED = DOCS / "ai" / "tmp"
SNAPSHOTS = DOCS / "ai" / "snapshots"
FENCE = re.compile(r"^[ \t]*(`{3,}|~{3,}).*?^[ \t]*\1", re.MULTILINE | re.DOTALL)
INLINE = re.compile(r"`[^`\n]*`")
LINK = re.compile(r"\]\(\s*(?:<([^>\n]+)>|([^)\s]+))(?:\s+\"[^\"]*\")?\s*\)")


def links(path):
    text = INLINE.sub("", FENCE.sub("", path.read_text(encoding="utf-8")))
    for bracketed, bare in LINK.findall(text):
        target = bracketed or bare
        if re.match(r"[a-z][a-z0-9+.-]*:", target) or target.startswith(("#", "<")):
            continue
        target = unquote(target.split("#")[0])
        if target:
            yield (path.parent / target).resolve()


def show(path):
    return path.relative_to(ROOT) if path.is_relative_to(ROOT) else path


def main():
    if not DOCS.is_relative_to(ROOT):
        print(f"文書ルートがリポジトリの外を指している: {DOCS}")
        return 1
    if not (DOCS / "index.md").exists():
        return 0
    problems = []

    def check_index(index, scope, skip):
        listed = set(links(index))
        for doc in sorted(scope):
            if doc != index and not skip(doc) and doc not in listed:
                problems.append(f"{show(index)}: 行がない: {show(doc)}")
        for target in sorted(listed):
            if not target.exists() and RESERVED not in target.parents:
                problems.append(
                    f"{show(index)}: 存在しないファイルを指す: {show(target)}"
                )

    has_adr_index = (ADR / "index.md").exists()
    check_index(
        DOCS / "index.md",
        DOCS.rglob("*.md"),
        lambda d: (
            RESERVED in d.parents
            or (has_adr_index and ADR in d.parents and d.name != "index.md")
        ),
    )
    if has_adr_index:
        check_index(ADR / "index.md", ADR.glob("*.md"), lambda d: False)

    sources = [ROOT / "README.md"]
    sources += [
        p
        for name in ("CLAUDE.md", "AGENTS.md")
        for p in ROOT.rglob(name)
        if ".git" not in p.parts
    ]
    sources += [p for p in DOCS.rglob("*.md") if SNAPSHOTS not in p.parents]
    sources += (ROOT / ".claude" / "skills").rglob("*.md")
    seen = set()
    for src in sources:
        if not src.is_file() or src in (DOCS / "index.md", ADR / "index.md"):
            continue
        if src.resolve() in seen:
            continue
        seen.add(src.resolve())
        for target in links(src):
            if not target.exists():
                problems.append(f"{show(src)}: リンク切れ: {show(target)}")

    print("\n".join(problems), end="\n" if problems else "")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
