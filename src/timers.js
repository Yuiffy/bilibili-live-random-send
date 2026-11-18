// Modified by Yuiffy on 2026-11-18. Apache-2.0.
// Worker timers keep the upstream behavior. If CSP blocks workers, use native timers.
function workerClock() {
  const handles = new Map();
  self.onmessage = ({ data }) => {
    const { command, id, delay, repeating } = data;
    if (command === "clear") {
      clearTimeout(handles.get(id));
      clearInterval(handles.get(id));
      handles.delete(id);
      return;
    }
    const tick = () => {
      self.postMessage({ id });
      if (!repeating) handles.delete(id);
    };
    handles.set(
      id,
      repeating ? setInterval(tick, delay) : setTimeout(tick, delay),
    );
  };
}

export function createTimers() {
  const jobs = new Map();
  let nextId = 0;
  let worker = null;

  function run(id) {
    const job = jobs.get(id);
    if (!job) return;
    if (!job.repeating) jobs.delete(id);
    else job.dueAt = Date.now() + job.delay;
    job.callback.call(job.context);
  }
  function scheduleNative(id, delay) {
    const job = jobs.get(id);
    job.nativeHandle = window.setTimeout(() => {
      if (!jobs.has(id)) return;
      try {
        run(id);
      } finally {
        if (jobs.has(id)) scheduleNative(id, job.delay);
      }
    }, delay);
  }
  function fallback() {
    worker?.terminate();
    worker = null;
    for (const [id, job] of jobs)
      scheduleNative(id, Math.max(0, job.dueAt - Date.now()));
  }
  try {
    const url = URL.createObjectURL(
      new Blob(["(", workerClock.toString(), ")()"], {
        type: "application/javascript",
      }),
    );
    try {
      worker = new Worker(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    worker.onmessage = ({ data }) => {
      if (worker) run(data.id);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fallback();
    };
  } catch {
    fallback();
  }
  function schedule(callback, delay, context, repeating) {
    const id = ++nextId;
    delay = Math.max(0, Math.min(2147483647, Number(delay) || 0));
    jobs.set(id, {
      callback,
      context,
      delay,
      repeating,
      dueAt: Date.now() + delay,
      nativeHandle: null,
    });
    if (worker) worker.postMessage({ command: "start", id, delay, repeating });
    else scheduleNative(id, delay);
    return id;
  }
  function clear(id) {
    const job = jobs.get(id);
    if (!job) return;
    if (worker) worker.postMessage({ command: "clear", id });
    if (job.nativeHandle !== null) window.clearTimeout(job.nativeHandle);
    jobs.delete(id);
  }
  return {
    setTimeout: (callback, delay, context) =>
      schedule(callback, delay, context, false),
    setInterval: (callback, delay, context) =>
      schedule(callback, delay, context, true),
    clearTimeout: clear,
    clearInterval: clear,
  };
}
