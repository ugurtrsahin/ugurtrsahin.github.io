import re
import unicodedata
import urllib.parse
from collections import defaultdict
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {'.git', 'tools'}


def should_skip(path: Path) -> bool:
    """Return True if the path is inside a skipped directory."""
    return any(part in SKIP_DIRS for part in path.parts)


def slugify(text: str) -> str:
    """Convert arbitrary text into a filesystem-friendly slug."""
    normalized = unicodedata.normalize('NFKD', text)
    ascii_text = normalized.encode('ascii', 'ignore').decode('ascii')
    lowered = ascii_text.lower()
    slug = re.sub(r'[^a-z0-9]+', '-', lowered).strip('-')
    return slug or 'item'


def collect_directories():
    """Return relative directory paths (excluding root) sorted by depth ascending."""
    dirs = []
    for path in ROOT.rglob('*'):
        if path.is_dir() and not should_skip(path):
            rel = PurePosixPath(path.relative_to(ROOT).as_posix())
            if str(rel) != '.':
                dirs.append(rel)
    dirs.sort(key=lambda p: len(p.parts))
    return dirs


def collect_files():
    """Return relative file paths sorted by depth ascending."""
    files = []
    for path in ROOT.rglob('*'):
        if path.is_file() and not should_skip(path):
            rel = PurePosixPath(path.relative_to(ROOT).as_posix())
            files.append(rel)
    files.sort(key=lambda p: len(p.parts))
    return files


def plan_new_paths(dirs, files):
    """Create mappings for directories and files to their new slug paths."""
    dir_new_rel = {PurePosixPath('.'): PurePosixPath('.')}
    children_names = defaultdict(set)

    for rel in dirs:
        parent_rel = rel.parent or PurePosixPath('.')
        parent_new_rel = dir_new_rel[parent_rel]
        base = slugify(rel.name)
        candidate = base
        suffix_idx = 2
        while candidate in children_names[parent_new_rel]:
            candidate = f"{base}-{suffix_idx}"
            suffix_idx += 1
        children_names[parent_new_rel].add(candidate)
        dir_new_rel[rel] = parent_new_rel / candidate

    file_new_rel = {}
    for rel in files:
        parent_rel = rel.parent or PurePosixPath('.')
        parent_new_rel = dir_new_rel[parent_rel]
        stem = slugify(rel.stem)
        suffix = ''.join(Path(rel.name).suffixes)  # preserve multi-extensions
        suffix = suffix.lower()
        name_candidate = stem
        new_filename = f"{name_candidate}{suffix}"
        suffix_idx = 2
        while new_filename in children_names[parent_new_rel]:
            name_candidate = f"{stem}-{suffix_idx}"
            new_filename = f"{name_candidate}{suffix}"
            suffix_idx += 1
        children_names[parent_new_rel].add(new_filename)
        file_new_rel[rel] = parent_new_rel / new_filename

    return dir_new_rel, file_new_rel


def rename_directories(dir_new_rel):
    """Rename directories based on planned paths (process parents before children)."""
    # sort directories by depth so parents are handled before children
    items = sorted(
        [rel for rel in dir_new_rel.keys() if str(rel) != '.'],
        key=lambda p: len(p.parts)
    )
    for rel in items:
        parent_rel = rel.parent or PurePosixPath('.')
        parent_new_rel = dir_new_rel[parent_rel]
        original_name = rel.name
        current_rel = parent_new_rel / original_name
        target_rel = dir_new_rel[rel]
        if current_rel == target_rel:
            continue
        current_path = ROOT.joinpath(*current_rel.parts)
        target_path = ROOT.joinpath(*target_rel.parts)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        current_path.rename(target_path)


def rename_files(file_new_rel, dir_new_rel):
    """Rename files based on planned paths."""
    for rel in sorted(file_new_rel.keys(), key=lambda p: len(p.parts)):
        parent_rel = rel.parent or PurePosixPath('.')
        parent_new_rel = dir_new_rel[parent_rel]
        current_rel = parent_new_rel / rel.name
        target_rel = file_new_rel[rel]
        if current_rel == target_rel:
            continue
        current_path = ROOT.joinpath(*current_rel.parts)
        target_path = ROOT.joinpath(*target_rel.parts)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        current_path.rename(target_path)


def update_html_links(mapping):
    """Update HTML files to use new relative paths."""
    html_files = [p for p in ROOT.rglob('*.html') if not should_skip(p)]
    for path in html_files:
        text = path.read_text(encoding='utf-8')
        updated = False
        for old_rel, new_rel in mapping.items():
            old_str = old_rel
            new_str = new_rel
            if old_str in text:
                text = text.replace(old_str, new_str)
                updated = True
            old_encoded = urllib.parse.quote(old_str, safe='/')
            new_encoded = urllib.parse.quote(new_str, safe='/')
            if old_encoded != old_str and old_encoded in text:
                text = text.replace(old_encoded, new_encoded)
                updated = True
        if updated:
            path.write_text(text, encoding='utf-8')


def main():
    dirs = collect_directories()
    files = collect_files()
    dir_new_rel, file_new_rel = plan_new_paths(dirs, files)
    rename_directories(dir_new_rel)
    rename_files(file_new_rel, dir_new_rel)

    # Build mapping for textual replacements (only files needed)
    mapping = {
        rel.as_posix(): new_rel.as_posix()
        for rel, new_rel in file_new_rel.items()
        if rel != new_rel
    }
    if mapping:
        update_html_links(mapping)
    print(f"Renamed {len(dir_new_rel) - 1} directories and {len(file_new_rel)} files.")


if __name__ == '__main__':
    main()
