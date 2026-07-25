"""Background job queue abstraction (Phase 2, increment 2).

Purpose: keep slow post-intake side effects (CRM sync, email, enrichment,
notifications) off the request/response path without coupling the codebase to a
specific broker. Callers submit a plain callable; the selected queue decides how
it runs:

  - ``InlineJobQueue``  — runs synchronously in the caller (default). Behavior is
    identical to calling the function directly, which keeps tests deterministic
    and needs no infrastructure.
  - ``ThreadJobQueue``  — runs on a background thread pool, so intake returns
    immediately. Each job opens and closes its own DB session.

A future increment can add a ``CeleryJobQueue``/``RQJobQueue`` implementing the
same ``submit`` contract, selected via the ``JOB_QUEUE`` setting — no caller
changes required.
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Protocol

from ..config import get_settings

logger = logging.getLogger("leadengine.jobs")
settings = get_settings()


class JobQueue(Protocol):
    def submit(self, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> None: ...

    def shutdown(self) -> None: ...


def _run_safely(fn: Callable[..., Any], args: tuple, kwargs: dict) -> None:
    """Run a job, swallowing and logging errors so a worker never crashes."""
    try:
        fn(*args, **kwargs)
    except Exception:  # noqa: BLE001 - a background job must not take down the pool
        logger.exception("Background job %s failed", getattr(fn, "__name__", fn))


class InlineJobQueue:
    def submit(self, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> None:
        _run_safely(fn, args, kwargs)

    def shutdown(self) -> None:  # no-op
        return None


class ThreadJobQueue:
    def __init__(self, max_workers: int = 4) -> None:
        self._pool = ThreadPoolExecutor(
            max_workers=max_workers, thread_name_prefix="leadengine-job"
        )

    def submit(self, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> None:
        self._pool.submit(_run_safely, fn, args, kwargs)

    def shutdown(self) -> None:
        self._pool.shutdown(wait=True)


def _build_queue() -> JobQueue:
    if settings.job_queue == "thread":
        return ThreadJobQueue(max_workers=settings.job_queue_max_workers)
    return InlineJobQueue()


# Process-wide singleton. Tests can swap this via ``set_job_queue``.
_queue: JobQueue = _build_queue()


def get_job_queue() -> JobQueue:
    return _queue


def set_job_queue(queue: JobQueue) -> None:
    global _queue
    _queue = queue


def enqueue(fn: Callable[..., Any], *args: Any, **kwargs: Any) -> None:
    get_job_queue().submit(fn, *args, **kwargs)
