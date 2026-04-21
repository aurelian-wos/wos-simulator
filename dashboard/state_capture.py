"""Exact-state capture for dirty working trees.

When a test run happens on a dirty git tree, we need to be able to reproduce
it exactly from the dashboard. This module captures three gzipped blobs:

* ``patch`` — ``git diff HEAD --binary`` scoped to simulator-relevant paths.
* ``untracked`` — a gzipped tar of every untracked-but-not-ignored file that
  lives under a simulator-relevant path.
* ``simulator_snapshot`` — a gzipped tar of the *current working-tree
  content* of every simulator-relevant file (tracked + untracked). This is
  the materialised view used for diffing two runs without needing ``git``
  at runtime (WOS-200): the dashboard simply decompresses both runs'
  snapshots and diffs them in-process.

Dirtiness itself is still detected against the *whole* tree (so a run is still
flagged ``dirty=1`` if you have scratch scripts edited), but only the scoped
blobs are persisted. The scope allowlist lives in ``dashboard/sim_paths.py``
and is mirrored in ``dashboard/web/lib/sim-paths.ts``.

Each blob gets a content-addressed id of the form ``sha256:<hex>`` so the
ingestion layer can dedupe blobs across runs — and because the snapshot is
content-addressed, two consecutive runs with no simulator-relevant changes
re-use the same snapshot blob row for free.

The sibling ingestion task (WOS-162 Phase 1) is the sole consumer. This module
never writes to a database — it only produces bytes and ids.
"""

from __future__ import annotations

import gzip
import hashlib
import io
import subprocess
import tarfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, TypedDict

from .sim_paths import (
    SIMULATOR_PATH_PREFIXES,
    SIMULATOR_ROOT_FILES,
    git_pathspec_args,
    is_simulator_path,
)


class CapturedDirtyState(TypedDict):
    """Return payload of :func:`capture_dirty_state`.

    The ``*_blob_id`` fields are the FK-safe identifiers stored on the
    ``runs`` row. The ``*_content_gzip`` fields are the gzipped bytes the
    ingestion layer persists to the ``blobs`` table keyed by those ids.

    ``patch_*`` / ``untracked_*`` pairs are ``None`` when the working tree is
    clean. ``snapshot_*`` and ``commit_*`` are populated on every run —
    they are the materialised view the dashboard reads at runtime to
    eliminate the need for ``git`` in the dashboard container.
    """

    patch_blob_id: Optional[str]
    untracked_blob_id: Optional[str]
    snapshot_blob_id: Optional[str]
    patch_content_gzip: Optional[bytes]
    untracked_content_gzip: Optional[bytes]
    snapshot_content_gzip: Optional[bytes]
    commit_subject: Optional[str]
    commit_author: Optional[str]
    commit_date: Optional[str]


@dataclass(frozen=True)
class _GitStatus:
    has_tracked_changes: bool
    untracked_paths: tuple[str, ...]

    @property
    def is_dirty(self) -> bool:
        return self.has_tracked_changes or bool(self.untracked_paths)


def _run_git(repo_root: Path, *args: str, binary: bool = False) -> bytes:
    """Run a git command inside ``repo_root`` and return raw stdout bytes."""
    result = subprocess.run(
        ("git", *args),
        cwd=str(repo_root),
        check=True,
        capture_output=True,
    )
    return result.stdout if binary else result.stdout


def _porcelain_status(repo_root: Path) -> _GitStatus:
    """Read ``git status --porcelain -z`` and split into tracked vs untracked."""
    raw = _run_git(repo_root, "status", "--porcelain=v1", "-z", "--untracked-files=all")
    entries = [e for e in raw.split(b"\x00") if e]
    untracked: list[str] = []
    tracked_dirty = False
    i = 0
    while i < len(entries):
        entry = entries[i]
        # Each entry is "XY path"; "XY" is 2 status bytes + space.
        if len(entry) < 3:
            i += 1
            continue
        xy = entry[:2]
        path = entry[3:].decode("utf-8", errors="surrogateescape")
        if xy == b"??":
            untracked.append(path)
        else:
            tracked_dirty = True
            # Rename/copy entries (R*, C*) are followed by the old path.
            if xy[:1] in (b"R", b"C"):
                i += 1  # skip the "from" path token
        i += 1
    return _GitStatus(has_tracked_changes=tracked_dirty, untracked_paths=tuple(untracked))


def _sha256_id(content: bytes) -> str:
    return "sha256:" + hashlib.sha256(content).hexdigest()


def _capture_patch(repo_root: Path) -> Optional[tuple[str, bytes]]:
    # Scope the patch to simulator-relevant paths only (see dashboard/sim_paths.py).
    # The board complained that raw ``git diff HEAD`` blobs were dominated by
    # dashboard/scratch/doc noise that cannot change a testcase outcome, which
    # obscured the actual simulator changes the dashboard exists to surface.
    diff = _run_git(
        repo_root,
        "diff",
        "HEAD",
        "--binary",
        "--",
        *git_pathspec_args(),
        binary=True,
    )
    if not diff:
        return None
    blob = gzip.compress(diff)
    return _sha256_id(blob), blob


def _capture_untracked(
    repo_root: Path, paths: tuple[str, ...]
) -> Optional[tuple[str, bytes]]:
    # Same scope rule as _capture_patch: only archive untracked files that live
    # under the simulator-relevant allowlist.
    paths = tuple(p for p in paths if is_simulator_path(p))
    if not paths:
        return None
    buf = io.BytesIO()
    # mtime=0 makes the archive reproducible for a given set of file contents,
    # which in turn stabilises the sha256 id.
    with tarfile.open(fileobj=buf, mode="w:gz", compresslevel=9) as tar:
        tar.mtime = 0  # type: ignore[attr-defined]
        for rel in sorted(paths):
            abs_path = repo_root / rel
            try:
                data = abs_path.read_bytes()
            except (FileNotFoundError, IsADirectoryError, PermissionError):
                # File vanished / unreadable between status and read: skip.
                continue
            info = tarfile.TarInfo(name=rel)
            info.size = len(data)
            info.mtime = 0
            info.mode = 0o644
            tar.addfile(info, io.BytesIO(data))
    blob = buf.getvalue()
    return _sha256_id(blob), blob


def _iter_simulator_files(root: Path) -> list[str]:
    """Enumerate every simulator-relevant file that currently exists in the
    working tree (tracked OR untracked), relative to ``root`` as POSIX paths.

    We use ``git ls-files`` for tracked files plus untracked-but-not-ignored
    files in one go; that correctly honours ``.gitignore``. Files that the
    sim-paths allowlist excludes are filtered out.
    """
    raw = _run_git(
        root,
        "ls-files",
        "-z",
        "--cached",
        "--others",
        "--exclude-standard",
        "--",
        *git_pathspec_args(),
    )
    entries = [p.decode("utf-8", errors="surrogateescape") for p in raw.split(b"\x00") if p]
    # git-ls-files already scopes to the pathspec, but belt-and-braces: run
    # the same is_simulator_path filter the TS side uses at display time.
    return [p for p in entries if is_simulator_path(p)]


def _capture_simulator_snapshot(root: Path) -> tuple[str, bytes]:
    """Build a gzipped tarball of every simulator-relevant file's current
    content. Returned as ``(sha256 blob id, gzip bytes)``. Always populated
    (even on a clean tree) so runtime diffing works without git.
    """
    paths = _iter_simulator_files(root)
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz", compresslevel=9) as tar:
        tar.mtime = 0  # type: ignore[attr-defined]
        for rel in sorted(paths):
            abs_path = root / rel
            try:
                data = abs_path.read_bytes()
            except (FileNotFoundError, IsADirectoryError, PermissionError):
                continue
            info = tarfile.TarInfo(name=rel)
            info.size = len(data)
            info.mtime = 0
            info.mode = 0o644
            tar.addfile(info, io.BytesIO(data))
    blob = buf.getvalue()
    return _sha256_id(blob), blob


def _capture_commit_metadata(root: Path) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Return ``(subject, author, iso_date)`` for HEAD, or all None if the
    lookup fails (e.g. the run is happening in a detached state with no
    commits). Persisted on the run row so the dashboard never needs to
    ``git log`` at runtime.
    """
    try:
        out = _run_git(root, "log", "-1", "--pretty=%s%x1f%an%x1f%cI")
        text = out.decode("utf-8", errors="replace").strip()
        if not text:
            return (None, None, None)
        parts = text.split("\x1f")
        if len(parts) != 3:
            return (None, None, None)
        subject, author, iso_date = parts
        return (subject or None, author or None, iso_date or None)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return (None, None, None)


def capture_dirty_state(repo_root: Path | str) -> CapturedDirtyState:
    """Capture a reproducible snapshot of the working tree's dirty state
    plus a full simulator-file snapshot and HEAD commit metadata.

    The patch/untracked pair is only populated when the tree is dirty
    (unchanged behaviour). The simulator snapshot and commit metadata are
    always populated so the dashboard can diff and log at runtime without
    needing git in its container.
    """
    root = Path(repo_root).resolve()
    status = _porcelain_status(root)

    if status.is_dirty:
        patch = _capture_patch(root) if status.has_tracked_changes else None
        untracked = _capture_untracked(root, status.untracked_paths)
    else:
        patch = None
        untracked = None

    snapshot_id, snapshot_blob = _capture_simulator_snapshot(root)
    subject, author, iso_date = _capture_commit_metadata(root)

    return CapturedDirtyState(
        patch_blob_id=patch[0] if patch else None,
        untracked_blob_id=untracked[0] if untracked else None,
        snapshot_blob_id=snapshot_id,
        patch_content_gzip=patch[1] if patch else None,
        untracked_content_gzip=untracked[1] if untracked else None,
        snapshot_content_gzip=snapshot_blob,
        commit_subject=subject,
        commit_author=author,
        commit_date=iso_date,
    )
