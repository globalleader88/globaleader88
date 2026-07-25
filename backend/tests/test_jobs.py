from app.services import jobs
from app.services.jobs import InlineJobQueue, ThreadJobQueue


def test_inline_queue_runs_synchronously():
    ran = []
    InlineJobQueue().submit(lambda: ran.append(1))
    assert ran == [1]


def test_inline_queue_swallows_errors():
    # A failing job must not raise to the caller.
    def boom():
        raise RuntimeError("nope")

    InlineJobQueue().submit(boom)  # should not raise


def test_thread_queue_runs_and_completes():
    ran = []
    q = ThreadJobQueue(max_workers=2)
    for i in range(5):
        q.submit(ran.append, i)
    q.shutdown()  # waits for all jobs
    assert sorted(ran) == [0, 1, 2, 3, 4]


def test_thread_queue_isolates_failures():
    ran = []
    q = ThreadJobQueue(max_workers=2)

    def boom():
        raise ValueError("x")

    q.submit(boom)
    q.submit(ran.append, "ok")
    q.shutdown()
    assert ran == ["ok"]


def test_set_and_get_job_queue_swap():
    original = jobs.get_job_queue()
    try:
        sentinel = InlineJobQueue()
        jobs.set_job_queue(sentinel)
        assert jobs.get_job_queue() is sentinel
    finally:
        jobs.set_job_queue(original)


def test_enqueue_uses_current_queue():
    ran = []

    class Recorder:
        def submit(self, fn, *a, **k):
            ran.append((fn, a))

        def shutdown(self):
            pass

    original = jobs.get_job_queue()
    try:
        jobs.set_job_queue(Recorder())
        jobs.enqueue(print, "hello")
        assert len(ran) == 1
    finally:
        jobs.set_job_queue(original)
