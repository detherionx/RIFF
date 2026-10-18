class RiffCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(4096);
    this.offset = 0;
    this.start = 0;
    this.port.onmessage = event => {
      if (event.data === 'flush') {
        this.flush();
        this.port.postMessage({ flushed: true });
      }
    };
  }
  flush() {
    if (!this.offset) return;
    const samples = this.buffer.slice(0, this.offset);
    this.port.postMessage({ samples, time: this.start }, [samples.buffer]);
    this.offset = 0;
  }
  process(inputs, outputs) {
    for (const output of outputs) for (const channel of output) channel.fill(0);
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      if (this.offset === 0) this.start = currentTime + i / sampleRate;
      let sample = 0;
      for (const channel of channels) sample += channel[i];
      this.buffer[this.offset++] = sample / channels.length;
      if (this.offset === this.buffer.length) this.flush();
    }
    return true;
  }
}
registerProcessor('riff-capture', RiffCapture);
