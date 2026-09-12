"""Make the frontend safe to host under /regional-power-explorer/.

This is an idempotent migration helper for the design-studio-deployment branch.
It updates Vite, React Router, and same-origin /data/... URLs so the app works
from a subdirectory instead of assuming it owns the domain root.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
PATHS_FILE = SRC / "utils" / "paths.js"
BASE_PATH = "/regional-power-explorer/"


def configure_vite() -> bool:
    path = ROOT / "vite.config.js"
    text = path.read_text(encoding="utf-8")
    if f"base: '{BASE_PATH}'" in text or f'base: "{BASE_PATH}"' in text:
        return False
    marker = "export default defineConfig({\n"
    if marker not in text:
        raise RuntimeError("Could not find Vite defineConfig block")
    text = text.replace(marker, marker + f"  base: '{BASE_PATH}',\n", 1)
    path.write_text(text, encoding="utf-8")
    return True


def configure_router() -> bool:
    path = SRC / "App.jsx"
    text = path.read_text(encoding="utf-8")
    changed = False
    import_line = "import { routerBasename } from './utils/paths';\n"
    if import_line not in text:
        text = import_line + text
        changed = True
    if "<BrowserRouter>" in text:
        text = text.replace("<BrowserRouter>", "<BrowserRouter basename={routerBasename}>", 1)
        changed = True
    elif "<BrowserRouter basename={routerBasename}>" not in text:
        raise RuntimeError("Could not find BrowserRouter opening tag")
    if changed:
        path.write_text(text, encoding="utf-8")
    return changed


def configure_html() -> bool:
    path = ROOT / "index.html"
    text = path.read_text(encoding="utf-8")
    changed = False
    if 'href="/favicon.svg"' in text:
        text = text.replace('href="/favicon.svg"', 'href="%BASE_URL%favicon.svg"', 1)
        changed = True
    if changed:
        path.write_text(text, encoding="utf-8")
    return changed


def data_path_import_for(path: Path) -> str:
    target = PATHS_FILE.with_suffix("")
    rel = os.path.relpath(target, path.parent).replace(os.sep, "/")
    if not rel.startswith("."):
        rel = "./" + rel
    return f"import {{ dataPath }} from '{rel}';\n"


def rewrite_data_paths(path: Path) -> bool:
    if path == PATHS_FILE:
        return False

    text = path.read_text(encoding="utf-8")
    original = text

    # Convert literal same-origin /data/... URLs to base-aware dataPath(...).
    # Template expressions such as ${regionId} are preserved inside the
    # resulting template literal.
    text = re.sub(
        r"'/data/([^'\n]*)'",
        lambda m: f"dataPath('{m.group(1)}')",
        text,
    )
    text = re.sub(
        r'"/data/([^"\n]*)"',
        lambda m: f'dataPath("{m.group(1)}")',
        text,
    )
    text = re.sub(
        r"`/data/([^`]*)`",
        lambda m: f"dataPath(`{m.group(1)}`)",
        text,
    )

    if text == original:
        return False

    import_line = data_path_import_for(path)
    if import_line not in text:
        text = import_line + text

    path.write_text(text, encoding="utf-8")
    return True


def validate() -> None:
    root_data_literal = re.compile(r"['\"`]/data/")
    leftovers: list[str] = []
    for path in sorted(SRC.rglob("*")):
        if path.suffix not in {".js", ".jsx"}:
            continue
        if root_data_literal.search(path.read_text(encoding="utf-8")):
            leftovers.append(str(path.relative_to(ROOT)))
    if leftovers:
        raise RuntimeError("Root-relative /data/ literals remain in: " + ", ".join(leftovers))


def main() -> None:
    changed: list[str] = []

    if configure_vite():
        changed.append("vite.config.js")
    if configure_router():
        changed.append("src/App.jsx")
    if configure_html():
        changed.append("index.html")

    for path in sorted(SRC.rglob("*")):
        if path.suffix not in {".js", ".jsx"}:
            continue
        if rewrite_data_paths(path):
            changed.append(str(path.relative_to(ROOT)))

    validate()

    print("Design Studio path migration complete.")
    if changed:
        print("Changed files:")
        for item in changed:
            print(f"  - {item}")
    else:
        print("No changes were needed.")


if __name__ == "__main__":
    main()
