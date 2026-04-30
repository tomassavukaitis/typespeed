class Timer {
  constructor(duration, onTick, onComplete) {
    this.duration = duration;
    this.onTick = onTick;
    this.onComplete = onComplete;
    this.startTime = null;
    this.intervalId = null;
    this.running = false;
    this.elapsed = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.startTime = Date.now();

    this.intervalId = setInterval(() => {
      this.elapsed = (Date.now() - this.startTime) / 1000;
      const remaining = Math.max(0, this.duration - this.elapsed);

      this.onTick(Math.ceil(remaining), this.elapsed);

      if (remaining <= 0) {
        this.stop();
        this.elapsed = this.duration;
        this.onComplete();
      }
    }, 100);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.elapsed = (Date.now() - this.startTime) / 1000;
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  getElapsed() {
    if (!this.startTime) return 0;
    if (this.running) {
      return (Date.now() - this.startTime) / 1000;
    }
    return this.elapsed;
  }

  reset() {
    this.stop();
    this.startTime = null;
    this.elapsed = 0;
  }
}
