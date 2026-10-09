import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';

let prepared = false;
function initBarcodeModule() {
  if (prepared) return;
  prepared = true;
  // The reader is served next to the bundle (see vite.config.js), or from the
  // package by the vite dev server, rather than from a CDN
  prepareZXingModule({
    overrides: {
      locateFile: (path, prefix) => {
        if (!path.endsWith('.wasm')) {
          return prefix + path;
        }
        return import.meta.env.DEV
          ? new URL(`/node_modules/zxing-wasm/dist/reader/${path}`, location.href).href
          : new URL(path, import.meta.url).href;
      }
    }
  });
}

// time between two frames that are read, so that a phone does not run hot
const INTERVAL = 150;

// Reading all ~40 formats by default is too heavy for mobile CPUs and triggers
// slow-script timeouts. Restrict detection to standard 1D and 2D formats.
const FORMATS = [
  'aztec',
  'code_128',
  'code_39',
  'code_93',
  'codabar',
  'data_matrix',
  'ean_13',
  'ean_8',
  'itf',
  'pdf417',
  'qr_code',
  'upc_a',
  'upc_e'
];

// A camera scanner for every kind of code: barcodes (EAN, UPC, Code 128, 39
// and 93, Codabar, ITF, …) as well as 2D codes (QR, Data Matrix, Aztec,
// PDF417), which qr-scanner cannot. It offers what ScanComponent uses of
// qr-scanner, and reports codes the same way, as { data }.
export default class BarcodeScanner {
  constructor(video, onDecode) {
    this.video = video;
    this.onDecode = onDecode;
    this.detector = null;
    this.stream = null;
    this.timer = null;
    this.running = false;

    // iOS shows the camera inline only with these
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
  }

  static async listCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter(e => e.kind === 'videoinput')
      .map(e => ({ id: e.deviceId, label: e.label }));
  }

  async start(camera = null) {
    initBarcodeModule();
    if (!this.detector) {
      this.detector = new BarcodeDetector({ formats: FORMATS });
    }
    this.running = true;
    await this.openCamera(camera ? { deviceId: { exact: camera } } : { facingMode: 'environment' });
    this.tick();
  }

  async openCamera(constraints) {
    this.closeCamera();
    this.stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
    this.video.srcObject = this.stream;
    await this.video.play();
  }

  closeCamera() {
    this.stream?.getTracks().forEach(e => e.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  async tick() {
    if (!this.running) {
      return;
    }
    try {
      if (this.video.readyState >= this.video.HAVE_CURRENT_DATA) {
        const [code] = await this.detector.detect(this.video);
        if (code && this.running) {
          this.onDecode({ data: code.rawValue, format: code.format });
        }
      }
    } catch (err) {
      // a frame that cannot be read, the next one may
      if (import.meta.env.DEV) {
        console.warn('Barcode decode frame error:', err);
      }
    }
    if (this.running) {
      this.timer = setTimeout(() => this.tick(), INTERVAL);
    }
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.closeCamera();
  }

  destroy() {
    this.stop();
  }

  async setCamera(id) {
    await this.openCamera({ deviceId: { exact: id } });
  }

  get track() {
    return this.stream?.getVideoTracks()[0];
  }

  async hasFlash() {
    return Boolean(this.track?.getCapabilities?.().torch);
  }

  async isFlashOn() {
    return Boolean(this.track?.getSettings?.().torch);
  }

  async toggleFlash() {
    const on = !(await this.isFlashOn());
    await this.track?.applyConstraints({ advanced: [{ torch: on }] });
  }
}
