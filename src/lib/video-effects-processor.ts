import { SelfieSegmentation } from "@mediapipe/selfie_segmentation";

export interface ProcessorOptions {
  filter: string;
  backgroundBlur: number;
  backgroundRemoval: boolean;
  virtualBackgroundUrl?: string;
  backgroundColor?: string;
  skinSmooth: number;
}

export class VideoEffectsProcessor {
  private segmentation: SelfieSegmentation | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;
  private lastResults: any = null;
  private backgroundImage: HTMLImageElement | null = null;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d")!;
    this.offscreenCanvas = document.createElement("canvas");
    this.offscreenCtx = this.offscreenCanvas.getContext("2d")!;

    // Initialize SelfieSegmentation
    this.segmentation = new SelfieSegmentation({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
    });

    this.segmentation.setOptions({
      modelSelection: 1, // 1 for landscape (better quality), 0 for general
    });

    this.segmentation.onResults((results) => {
      this.lastResults = results;
    });
  }

  public async processFrame(video: HTMLVideoElement, options: ProcessorOptions): Promise<HTMLCanvasElement> {
    if (this.canvas.width !== video.videoWidth) {
      this.canvas.width = video.videoWidth;
      this.canvas.height = video.videoHeight;
      this.offscreenCanvas.width = video.videoWidth;
      this.offscreenCanvas.height = video.videoHeight;
    }

    // Run segmentation if needed
    if (options.backgroundBlur > 0 || options.backgroundRemoval) {
      await this.segmentation?.send({ image: video });
    }

    // Load background image if URL changed
    if (options.virtualBackgroundUrl && (!this.backgroundImage || this.backgroundImage.src !== options.virtualBackgroundUrl)) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = options.virtualBackgroundUrl;
      img.onload = () => { this.backgroundImage = img; };
    }

    const { ctx, canvas, offscreenCtx, offscreenCanvas } = this;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (this.lastResults && (options.backgroundBlur > 0 || options.backgroundRemoval)) {
      // Background logic
      offscreenCtx.save();
      offscreenCtx.clearRect(0, 0, canvas.width, canvas.height);
      offscreenCtx.drawImage(this.lastResults.segmentationMask, 0, 0, canvas.width, canvas.height);
      
      // Draw background
      ctx.globalCompositeOperation = "destination-over";
      if (options.virtualBackgroundUrl && this.backgroundImage) {
         ctx.drawImage(this.backgroundImage, 0, 0, canvas.width, canvas.height);
      } else if (options.backgroundRemoval) {
         ctx.fillStyle = options.backgroundColor || "#000000";
         ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (options.backgroundBlur > 0) {
         ctx.filter = `blur(${options.backgroundBlur}px) brightness(0.8)`;
         ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
         ctx.filter = "none";
      }

      // Draw foreground (person)
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(offscreenCanvas, 0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-in";
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      offscreenCtx.restore();
    } else {
      // Normal draw
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    // Apply color filters
    if (options.filter !== "none") {
      // We use a temporary canvas to apply filters without losing the segmentation
      offscreenCtx.save();
      offscreenCtx.clearRect(0, 0, canvas.width, canvas.height);
      offscreenCtx.filter = options.filter;
      offscreenCtx.drawImage(canvas, 0, 0);
      offscreenCtx.restore();
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(offscreenCanvas, 0, 0);
    }

    // Apply Skin Smooth (simplified GPU-accelerated approach)
    if (options.skinSmooth > 0) {
      // Multi-pass blur blend to simulate surface blur
      offscreenCtx.save();
      offscreenCtx.clearRect(0, 0, canvas.width, canvas.height);
      offscreenCtx.filter = `blur(${options.skinSmooth}px) contrast(1.1) saturate(1.1)`;
      offscreenCtx.globalAlpha = 0.4; // Blend amount
      offscreenCtx.drawImage(canvas, 0, 0);
      offscreenCtx.restore();
      
      ctx.drawImage(offscreenCanvas, 0, 0);
    }

    ctx.restore();
    return canvas;
  }

  public dispose() {
    this.segmentation?.close();
  }
}
