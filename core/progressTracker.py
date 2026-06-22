import time
import json
import sys


class ProgressTracker:
    def __init__(self, total_steps=100, callback=None):
        self._progress = 0.0
        self._total_steps = total_steps
        self._callback = callback
        self._start_time = time.time()
        self._last_reported = -1

    @staticmethod
    def _ease_out_cubic(t):
        return 1 - (1 - t) ** 3

    def set_progress(self, value, description=""):
        self._progress = min(float(value), self._total_steps)
        self._report(description)

    def step(self, amount=1, description=""):
        self._progress = min(self._progress + amount, self._total_steps)
        self._report(description)

    def _report(self, description=""):
        pct = int(self._progress)
        if pct == self._last_reported:
            return
        self._last_reported = pct
        elapsed = time.time() - self._start_time
        msg = json.dumps({"p": pct, "m": description, "t": round(elapsed, 1)})
        print(f"PROGRESS:{msg}", flush=True)
        if self._callback:
            self._callback(pct, description)

    def finish(self, description="Concluído!"):
        self._progress = self._total_steps
        self._report(description)

    def fail(self, description="Erro na execução"):
        msg = json.dumps({"p": self._last_reported, "m": description, "t": round(time.time() - self._start_time, 1)})
        print(f"PROGRESS:{msg}", flush=True)
