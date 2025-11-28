import '@kitware/vtk.js/Rendering/Profiles/Volume';

import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkInteractorStyleTrackballCamera from '@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as nifti from 'nifti-reader-js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ScanViewerOptions {
  container: HTMLElement;
  backgroundColor?: [number, number, number];
  theme?: 'dark' | 'light';
}

export interface ScanData {
  flairUrl: string;
  maskUrl: string;
  metadataUrl?: string;
}

export type BrainPreset = 'grayscale' | 'skin' | 'bone' | 'mri';
export type RenderMode = 'performance' | 'accuracy';

export interface ClipPlanes {
  x: [number, number];
  y: [number, number];
  z: [number, number];
}

export interface ScanViewer {
  setMaskVisible: (visible: boolean) => void | Promise<void>;
  getMaskVisible: () => boolean;
  setBrainOpacity: (opacity: number) => void;
  getBrainOpacity: () => number;
  setMaskOpacity: (opacity: number) => void;
  getMaskOpacity: () => number;
  setClipPlanes: (planes: Partial<ClipPlanes>) => void;
  getClipPlanes: () => ClipPlanes;
  setBrainPreset: (preset: BrainPreset) => void;
  getBrainPreset: () => BrainPreset;
  setTheme: (theme: 'dark' | 'light') => void;
  setRenderMode: (mode: RenderMode) => void;
  getRenderMode: () => RenderMode;
  resetCamera: () => void;
  setView: (view: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'isometric') => void;
  destroy: () => void;
  getDimensions: () => { x: number; y: number; z: number };
}

// ============================================================================
// CONSTANTS - THREE LEVEL LOD
// ============================================================================

// LOD Levels
type LODLevel = 'fast' | 'normal' | 'quality';

// Sample distances for each LOD level
const SAMPLE_DISTANCE = {
  fast: 12.0,      // Quarter-res: fastest interaction
  normal: 4.0,     // Half-res: intermediate
  quality: 1.5,    // Full-res: best quality
};

// Timeouts for LOD transitions
const LOD_TIMEOUT = {
  toNormal: 100,   // ms after interaction stops -> switch to normal
  toQuality: 300,  // ms after normal -> switch to quality
};

const TARGET_FPS = 30;
const FRAME_TIME_MS = 1000 / TARGET_FPS;
const ZOOM_SMOOTHING = 0.15;
const MAX_ZOOM_DELTA = 0.08;

// ============================================================================
// CACHED TRANSFER FUNCTIONS
// ============================================================================

function createCachedColorTF(preset: BrainPreset): vtkColorTransferFunction {
  const colorTF = vtkColorTransferFunction.newInstance();
  const min = 0;
  const max = 65535;
  const range = max - min;

  switch (preset) {
    case 'skin':
      colorTF.addRGBPoint(min, 0.1, 0.05, 0.02);
      colorTF.addRGBPoint(min + range * 0.1, 0.4, 0.25, 0.15);
      colorTF.addRGBPoint(min + range * 0.2, 0.75, 0.52, 0.4);
      colorTF.addRGBPoint(min + range * 0.35, 0.88, 0.68, 0.55);
      colorTF.addRGBPoint(min + range * 0.5, 0.92, 0.75, 0.62);
      colorTF.addRGBPoint(min + range * 0.7, 0.95, 0.82, 0.72);
      colorTF.addRGBPoint(max, 0.98, 0.9, 0.82);
      break;
    case 'bone':
      colorTF.addRGBPoint(min, 0.05, 0.04, 0.03);
      colorTF.addRGBPoint(min + range * 0.2, 0.5, 0.45, 0.4);
      colorTF.addRGBPoint(min + range * 0.5, 0.8, 0.78, 0.72);
      colorTF.addRGBPoint(max, 0.98, 0.95, 0.9);
      break;
    case 'mri':
      colorTF.addRGBPoint(min, 0.0, 0.0, 0.05);
      colorTF.addRGBPoint(min + range * 0.2, 0.1, 0.2, 0.4);
      colorTF.addRGBPoint(min + range * 0.5, 0.4, 0.5, 0.7);
      colorTF.addRGBPoint(max, 0.9, 0.95, 1.0);
      break;
    case 'grayscale':
    default:
      colorTF.addRGBPoint(min, 0.0, 0.0, 0.0);
      colorTF.addRGBPoint(min + range * 0.2, 0.3, 0.3, 0.32);
      colorTF.addRGBPoint(min + range * 0.5, 0.6, 0.6, 0.62);
      colorTF.addRGBPoint(max, 0.95, 0.95, 0.95);
      break;
  }
  return colorTF;
}

function createAllColorTFs(): Map<BrainPreset, vtkColorTransferFunction> {
  const map = new Map<BrainPreset, vtkColorTransferFunction>();
  const presets: BrainPreset[] = ['grayscale', 'skin', 'bone', 'mri'];
  for (const preset of presets) {
    map.set(preset, createCachedColorTF(preset));
  }
  return map;
}

function createBrainOpacityTF(): vtkPiecewiseFunction {
  return vtkPiecewiseFunction.newInstance();
}

function updateBrainOpacityTF(opacityTF: vtkPiecewiseFunction, opacity: number, threshold: number): void {
  opacityTF.removeAllPoints();
  opacityTF.addPoint(0, 0.0);
  opacityTF.addPoint(threshold, 0.0);
  opacityTF.addPoint(threshold + 1000, 0.3 * opacity);
  opacityTF.addPoint(threshold + 5000, 0.6 * opacity);
  opacityTF.addPoint(20000, 0.85 * opacity);
  opacityTF.addPoint(35000, 0.95 * opacity);
  opacityTF.addPoint(65535, 1.0 * opacity);
}

function createMaskColorTF(): vtkColorTransferFunction {
  const colorTF = vtkColorTransferFunction.newInstance();
  colorTF.addRGBPoint(0, 0, 0, 0);
  colorTF.addRGBPoint(8000, 0, 0, 0);
  colorTF.addRGBPoint(16383, 1.0, 0.15, 0.15);
  colorTF.addRGBPoint(32767, 0.15, 0.9, 0.15);
  colorTF.addRGBPoint(49151, 0.15, 0.15, 1.0);
  colorTF.addRGBPoint(65535, 1.0, 0.85, 0.0);
  return colorTF;
}

function createMaskOpacityTF(): vtkPiecewiseFunction {
  return vtkPiecewiseFunction.newInstance();
}

function updateMaskOpacityTF(opacityTF: vtkPiecewiseFunction, opacity: number): void {
  opacityTF.removeAllPoints();
  opacityTF.addPoint(0, 0.0);
  opacityTF.addPoint(8000, 0.0);
  opacityTF.addPoint(16383, 0.85 * opacity);
  opacityTF.addPoint(32767, 0.7 * opacity);
  opacityTF.addPoint(49151, 0.85 * opacity);
  opacityTF.addPoint(65535, 0.9 * opacity);
}

// ============================================================================
// DATA LOADING & MULTI-RESOLUTION PROCESSING
// ============================================================================

interface MultiResVolumeData {
  fullRes: vtkImageData;
  halfRes: vtkImageData;
  quarterRes: vtkImageData;
  dims: [number, number, number];
  spacing: [number, number, number];
}

function downsample3D(
  data: Uint16Array,
  dims: [number, number, number],
  factor: number
): { data: Uint16Array; dims: [number, number, number] } {
  const [nx, ny, nz] = dims;
  const nx2 = Math.ceil(nx / factor);
  const ny2 = Math.ceil(ny / factor);
  const nz2 = Math.ceil(nz / factor);
  const result = new Uint16Array(nx2 * ny2 * nz2);

  for (let z = 0; z < nz2; z++) {
    const sz = Math.min(Math.floor(z * factor), nz - 1);
    for (let y = 0; y < ny2; y++) {
      const sy = Math.min(Math.floor(y * factor), ny - 1);
      for (let x = 0; x < nx2; x++) {
        const sx = Math.min(Math.floor(x * factor), nx - 1);
        result[x + y * nx2 + z * nx2 * ny2] = data[sx + sy * nx + sz * nx * ny];
      }
    }
  }
  return { data: result, dims: [nx2, ny2, nz2] };
}

async function loadNIfTIToUint16(url: string): Promise<{
  data: Uint16Array;
  dims: [number, number, number];
  spacing: [number, number, number];
}> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);

  let buffer = await response.arrayBuffer();
  if (nifti.isCompressed(buffer)) {
    buffer = nifti.decompress(buffer) as ArrayBuffer;
  }
  if (!nifti.isNIFTI(buffer)) throw new Error('Not a valid NIfTI file');

  const header = nifti.readHeader(buffer);
  if (!header) throw new Error('Failed to read NIfTI header');

  const imageData = nifti.readImage(header, buffer);

  let rawData: ArrayLike<number>;
  switch (header.datatypeCode) {
    case nifti.NIFTI1.TYPE_UINT8: rawData = new Uint8Array(imageData); break;
    case nifti.NIFTI1.TYPE_INT16: rawData = new Int16Array(imageData); break;
    case nifti.NIFTI1.TYPE_INT32: rawData = new Int32Array(imageData); break;
    case nifti.NIFTI1.TYPE_FLOAT32: rawData = new Float32Array(imageData); break;
    case nifti.NIFTI1.TYPE_FLOAT64: rawData = new Float64Array(imageData); break;
    case nifti.NIFTI1.TYPE_UINT16: rawData = new Uint16Array(imageData); break;
    default: rawData = new Float32Array(imageData);
  }

  let min = Infinity, max = -Infinity;
  for (let i = 0; i < rawData.length; i++) {
    if (rawData[i] < min) min = rawData[i];
    if (rawData[i] > max) max = rawData[i];
  }

  const slope = header.scl_slope || 1;
  const intercept = header.scl_inter || 0;
  if (slope !== 1 || intercept !== 0) {
    min = min * slope + intercept;
    max = max * slope + intercept;
  }

  const range = max - min || 1;
  const scale = 65535 / range;
  const uint16Data = new Uint16Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    let v = rawData[i];
    if (slope !== 1 || intercept !== 0) v = v * slope + intercept;
    uint16Data[i] = Math.round(Math.max(0, Math.min(65535, (v - min) * scale)));
  }

  const dims: [number, number, number] = [header.dims[1], header.dims[2], header.dims[3]];
  const spacing: [number, number, number] = [
    Math.abs(header.pixDims[1]) || 1,
    Math.abs(header.pixDims[2]) || 1,
    Math.abs(header.pixDims[3]) || 1,
  ];

  return { data: uint16Data, dims, spacing };
}

function createVTKImageData(
  data: Uint16Array,
  dims: [number, number, number],
  spacing: [number, number, number]
): vtkImageData {
  const imageData = vtkImageData.newInstance();
  imageData.setDimensions(dims);
  imageData.setSpacing(spacing);
  imageData.setOrigin([0, 0, 0]);
  const scalars = vtkDataArray.newInstance({
    numberOfComponents: 1,
    values: data as unknown as number[],
  });
  imageData.getPointData().setScalars(scalars);
  return imageData;
}

async function loadMultiResVolumeData(url: string): Promise<MultiResVolumeData> {
  console.log(`Loading volume: ${url}`);
  const { data, dims, spacing } = await loadNIfTIToUint16(url);

  // Full resolution
  const fullRes = createVTKImageData(data, dims, spacing);

  // Half resolution (factor 2)
  const half = downsample3D(data, dims, 2);
  const halfSpacing: [number, number, number] = [spacing[0] * 2, spacing[1] * 2, spacing[2] * 2];
  const halfRes = createVTKImageData(half.data, half.dims, halfSpacing);

  // Quarter resolution (factor 4)
  const quarter = downsample3D(data, dims, 4);
  const quarterSpacing: [number, number, number] = [spacing[0] * 4, spacing[1] * 4, spacing[2] * 4];
  const quarterRes = createVTKImageData(quarter.data, quarter.dims, quarterSpacing);

  console.log(`Created 3 LOD levels: ${dims[0]}x${dims[1]}x${dims[2]} -> ${half.dims[0]}x${half.dims[1]}x${half.dims[2]} -> ${quarter.dims[0]}x${quarter.dims[1]}x${quarter.dims[2]}`);

  return { fullRes, halfRes, quarterRes, dims, spacing };
}

// ============================================================================
// THREE-LEVEL LOD MAPPER SYSTEM
// ============================================================================

interface TripleLODSystem {
  fastMapper: vtkVolumeMapper;     // Quarter-res
  normalMapper: vtkVolumeMapper;   // Half-res
  qualityMapper: vtkVolumeMapper;  // Full-res
  volume: vtkVolume;
  property: any;
  fullResData: vtkImageData;
  halfResData: vtkImageData;
  quarterResData: vtkImageData;
  currentLOD: LODLevel;
  isNearest: boolean;
}

function createTripleLODSystem(
  volumeData: MultiResVolumeData,
  colorTF: vtkColorTransferFunction,
  opacityTF: vtkPiecewiseFunction,
  isNearest: boolean = false
): TripleLODSystem {
  // Fast mapper - Quarter resolution (for active interaction)
  const fastMapper = vtkVolumeMapper.newInstance();
  fastMapper.setInputData(volumeData.quarterRes);
  fastMapper.setSampleDistance(SAMPLE_DISTANCE.fast);
  fastMapper.setAutoAdjustSampleDistances(false);
  fastMapper.setMaximumSamplesPerRay(100);
  fastMapper.setBlendMode(0);

  // Normal mapper - Half resolution (intermediate)
  const normalMapper = vtkVolumeMapper.newInstance();
  normalMapper.setInputData(volumeData.halfRes);
  normalMapper.setSampleDistance(SAMPLE_DISTANCE.normal);
  normalMapper.setAutoAdjustSampleDistances(false);
  normalMapper.setMaximumSamplesPerRay(300);
  normalMapper.setBlendMode(0);

  // Quality mapper - Full resolution (final)
  const qualityMapper = vtkVolumeMapper.newInstance();
  qualityMapper.setInputData(volumeData.fullRes);
  qualityMapper.setSampleDistance(SAMPLE_DISTANCE.quality);
  qualityMapper.setAutoAdjustSampleDistances(false);
  qualityMapper.setMaximumSamplesPerRay(1000);
  qualityMapper.setBlendMode(0);

  // Volume starts with quality mapper
  const volume = vtkVolume.newInstance();
  volume.setMapper(qualityMapper);

  const property = volume.getProperty();
  property.setRGBTransferFunction(0, colorTF);
  property.setScalarOpacity(0, opacityTF);
  property.setScalarOpacityUnitDistance(0, 2.0);
  property.setInterpolationTypeToLinear();
  if (isNearest) property.setInterpolationTypeToNearest();
  property.setShade(true);
  property.setAmbient(0.15);
  property.setDiffuse(0.7);
  property.setSpecular(0.25);
  property.setSpecularPower(15.0);

  return {
    fastMapper,
    normalMapper,
    qualityMapper,
    volume,
    property,
    fullResData: volumeData.fullRes,
    halfResData: volumeData.halfRes,
    quarterResData: volumeData.quarterRes,
    currentLOD: 'quality',
    isNearest,
  };
}

function setLODLevel(system: TripleLODSystem, level: LODLevel): void {
  if (system.currentLOD === level) return;

  system.currentLOD = level;

  switch (level) {
    case 'fast':
      // Quarter-res: fastest, no shading, nearest interpolation
      system.volume.setMapper(system.fastMapper);
      system.property.setShade(false);
      system.property.setInterpolationTypeToNearest();
      system.property.setAmbient(1.0);
      system.property.setDiffuse(0.0);
      system.property.setSpecular(0.0);
      break;

    case 'normal':
      // Half-res: intermediate quality
      system.volume.setMapper(system.normalMapper);
      system.property.setShade(true);
      if (system.isNearest) {
        system.property.setInterpolationTypeToNearest();
      } else {
        system.property.setInterpolationTypeToLinear();
      }
      system.property.setAmbient(0.2);
      system.property.setDiffuse(0.6);
      system.property.setSpecular(0.2);
      break;

    case 'quality':
      // Full-res: best quality with full shading
      system.volume.setMapper(system.qualityMapper);
      system.property.setShade(true);
      if (system.isNearest) {
        system.property.setInterpolationTypeToNearest();
      } else {
        system.property.setInterpolationTypeToLinear();
      }
      system.property.setAmbient(0.15);
      system.property.setDiffuse(0.7);
      system.property.setSpecular(0.25);
      break;
  }
}

// ============================================================================
// RENDER THROTTLING
// ============================================================================

class RenderThrottler {
  private lastRenderTime = 0;
  private pendingRender = false;
  private rafId: number | null = null;

  constructor(private renderFn: () => void) {}

  requestRender(): void {
    if (this.pendingRender) return;

    const now = performance.now();
    const elapsed = now - this.lastRenderTime;

    if (elapsed >= FRAME_TIME_MS) {
      this.lastRenderTime = now;
      this.renderFn();
    } else {
      this.pendingRender = true;
      this.rafId = requestAnimationFrame(() => {
        this.pendingRender = false;
        this.lastRenderTime = performance.now();
        this.renderFn();
      });
    }
  }

  forceRender(): void {
    this.lastRenderTime = performance.now();
    this.renderFn();
  }

  cancel(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pendingRender = false;
  }
}

// ============================================================================
// SMOOTH ZOOM HANDLER
// ============================================================================

class SmoothZoomHandler {
  private accumulatedDelta = 0;
  private rafId: number | null = null;
  private isAnimating = false;

  constructor(
    private camera: any,
    private renderer: any,
    private renderThrottler: RenderThrottler,
    private onInteractionStart: () => void,
    private onInteractionEnd: () => void
  ) {}

  addDelta(delta: number): void {
    this.onInteractionStart();
    this.accumulatedDelta += Math.max(-MAX_ZOOM_DELTA, Math.min(MAX_ZOOM_DELTA, delta * 0.001));
    if (!this.isAnimating) {
      this.animate();
    }
  }

  private animate = (): void => {
    if (Math.abs(this.accumulatedDelta) < 0.001) {
      this.isAnimating = false;
      this.onInteractionEnd();
      return;
    }

    this.isAnimating = true;
    const zoomAmount = this.accumulatedDelta * ZOOM_SMOOTHING;
    this.accumulatedDelta -= zoomAmount;

    const factor = 1 - zoomAmount;
    this.camera.zoom(factor);
    this.renderer.resetCameraClippingRange();
    this.renderThrottler.requestRender();

    this.rafId = requestAnimationFrame(this.animate);
  };

  cancel(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.isAnimating = false;
    this.accumulatedDelta = 0;
  }
}

// ============================================================================
// LOD STATE MANAGER WITH RENDER MODE SUPPORT
// ============================================================================

class LODStateManager {
  private currentLevel: LODLevel = 'quality';
  private normalTimeout: ReturnType<typeof setTimeout> | null = null;
  private qualityTimeout: ReturnType<typeof setTimeout> | null = null;
  private isInteracting = false;
  private renderMode: RenderMode = 'accuracy';

  constructor(
    private systems: TripleLODSystem[],
    private renderThrottler: RenderThrottler
  ) {}

  setRenderMode(mode: RenderMode): void {
    this.renderMode = mode;
    
    if (mode === 'performance') {
      // In performance mode, use 'normal' LOD as the best quality (half-res)
      this.clearTimeouts();
      if (!this.isInteracting) {
        this.setLevel('normal');
        // Apply performance-optimized settings
        for (const system of this.systems) {
          system.property.setShade(false);
          system.property.setAmbient(0.8);
          system.property.setDiffuse(0.2);
          system.property.setSpecular(0.0);
        }
        this.renderThrottler.forceRender();
      }
    } else {
      // In accuracy mode, use full quality when still
      if (!this.isInteracting) {
        this.setLevel('quality');
        // Restore full quality settings
        for (const system of this.systems) {
          system.property.setShade(true);
          system.property.setAmbient(0.15);
          system.property.setDiffuse(0.7);
          system.property.setSpecular(0.25);
        }
        this.renderThrottler.forceRender();
      }
    }
  }

  getRenderMode(): RenderMode {
    return this.renderMode;
  }

  startInteraction(): void {
    if (this.isInteracting) return;
    this.isInteracting = true;

    // Clear pending transitions
    this.clearTimeouts();

    // Immediately drop to fast LOD
    this.setLevel('fast');
  }

  endInteraction(): void {
    if (!this.isInteracting) return;
    this.isInteracting = false;

    if (this.renderMode === 'performance') {
      // Performance mode: only go to normal (half-res), no shading
      this.normalTimeout = setTimeout(() => {
        this.setLevel('normal');
        // Keep performance settings
        for (const system of this.systems) {
          system.property.setShade(false);
          system.property.setAmbient(0.8);
          system.property.setDiffuse(0.2);
          system.property.setSpecular(0.0);
        }
        this.renderThrottler.forceRender();
      }, LOD_TIMEOUT.toNormal);
    } else {
      // Accuracy mode: full quality transition
      this.normalTimeout = setTimeout(() => {
        this.setLevel('normal');
        this.renderThrottler.forceRender();

        this.qualityTimeout = setTimeout(() => {
          this.setLevel('quality');
          this.renderThrottler.forceRender();
        }, LOD_TIMEOUT.toQuality);
      }, LOD_TIMEOUT.toNormal);
    }
  }

  private setLevel(level: LODLevel): void {
    if (this.currentLevel === level) return;
    this.currentLevel = level;

    for (const system of this.systems) {
      setLODLevel(system, level);
    }
  }

  private clearTimeouts(): void {
    if (this.normalTimeout) {
      clearTimeout(this.normalTimeout);
      this.normalTimeout = null;
    }
    if (this.qualityTimeout) {
      clearTimeout(this.qualityTimeout);
      this.qualityTimeout = null;
    }
  }

  addSystem(system: TripleLODSystem): void {
    this.systems.push(system);
    // Apply current mode settings to new system
    if (this.renderMode === 'performance' && !this.isInteracting) {
      setLODLevel(system, 'normal');
      system.property.setShade(false);
      system.property.setAmbient(0.8);
      system.property.setDiffuse(0.2);
      system.property.setSpecular(0.0);
    } else {
      setLODLevel(system, this.currentLevel);
    }
  }

  destroy(): void {
    this.clearTimeouts();
  }
}

// ============================================================================
// MAIN DRAW SCAN FUNCTION
// ============================================================================

export async function drawScan(
  options: ScanViewerOptions,
  scanData: ScanData
): Promise<ScanViewer> {
  const { container, theme = 'dark' } = options;
  const { flairUrl, maskUrl } = scanData;

  const darkBg: [number, number, number] = [0.08, 0.08, 0.12];
  const lightBg: [number, number, number] = [0.92, 0.92, 0.95];
  let currentTheme = theme;

  container.innerHTML = '';

  const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
    container,
    containerStyle: { height: '100%', width: '100%', position: 'absolute' },
    background: currentTheme === 'dark' ? darkBg : lightBg,
  });

  const renderer = fullScreenRenderer.getRenderer();
  const renderWindow = fullScreenRenderer.getRenderWindow();

  const interactor = renderWindow.getInteractor();
  const interactorStyle = vtkInteractorStyleTrackballCamera.newInstance();
  interactor.setInteractorStyle(interactorStyle);
  interactor.setDesiredUpdateRate(TARGET_FPS);
  interactor.setStillUpdateRate(0.001);

  // Create cached transfer functions ONCE
  const colorTFCache = createAllColorTFs();
  const brainOpacityTF = createBrainOpacityTF();
  const maskColorTF = createMaskColorTF();
  const maskOpacityTF = createMaskOpacityTF();

  // Render throttler
  const throttler = new RenderThrottler(() => renderWindow.render());

  // Load FLAIR volume with all 3 LOD levels
  console.log('Loading FLAIR volume with 3 LOD levels...');
  const flairVolumeData = await loadMultiResVolumeData(flairUrl);

  const dimensions = {
    x: flairVolumeData.dims[0],
    y: flairVolumeData.dims[1],
    z: flairVolumeData.dims[2],
  };

  const bounds = [
    0, dimensions.x * flairVolumeData.spacing[0],
    0, dimensions.y * flairVolumeData.spacing[1],
    0, dimensions.z * flairVolumeData.spacing[2],
  ];

  // State
  let currentPreset: BrainPreset = 'skin';
  let brainOpacity = 1.0;
  let maskOpacity = 1.0;
  let maskVisible = false;
  let clipPlanes: ClipPlanes = { x: [0, 100], y: [0, 100], z: [0, 100] };

  // Initialize opacity TFs
  const threshold = 65535 * 0.08;
  updateBrainOpacityTF(brainOpacityTF, brainOpacity, threshold);
  updateMaskOpacityTF(maskOpacityTF, maskOpacity);

  // Create FLAIR triple LOD system
  const flairSystem = createTripleLODSystem(
    flairVolumeData,
    colorTFCache.get(currentPreset)!,
    brainOpacityTF,
    false
  );

  // Clipping planes
  const clipPlanesVTK = Array.from({ length: 6 }, () => vtkPlane.newInstance());

  const updateClipPlanesGeometry = (): void => {
    const xMin = bounds[0] + (clipPlanes.x[0] / 100) * (bounds[1] - bounds[0]);
    const xMax = bounds[0] + (clipPlanes.x[1] / 100) * (bounds[1] - bounds[0]);
    const yMin = bounds[2] + (clipPlanes.y[0] / 100) * (bounds[3] - bounds[2]);
    const yMax = bounds[2] + (clipPlanes.y[1] / 100) * (bounds[3] - bounds[2]);
    const zMin = bounds[4] + (clipPlanes.z[0] / 100) * (bounds[5] - bounds[4]);
    const zMax = bounds[4] + (clipPlanes.z[1] / 100) * (bounds[5] - bounds[4]);

    clipPlanesVTK[0].setOrigin(xMin, 0, 0); clipPlanesVTK[0].setNormal(1, 0, 0);
    clipPlanesVTK[1].setOrigin(xMax, 0, 0); clipPlanesVTK[1].setNormal(-1, 0, 0);
    clipPlanesVTK[2].setOrigin(0, yMin, 0); clipPlanesVTK[2].setNormal(0, 1, 0);
    clipPlanesVTK[3].setOrigin(0, yMax, 0); clipPlanesVTK[3].setNormal(0, -1, 0);
    clipPlanesVTK[4].setOrigin(0, 0, zMin); clipPlanesVTK[4].setNormal(0, 0, 1);
    clipPlanesVTK[5].setOrigin(0, 0, zMax); clipPlanesVTK[5].setNormal(0, 0, -1);
  };

  const applyClipPlanesToSystem = (system: TripleLODSystem): void => {
    for (const mapper of [system.fastMapper, system.normalMapper, system.qualityMapper]) {
      mapper.removeAllClippingPlanes();
      for (const plane of clipPlanesVTK) {
        mapper.addClippingPlane(plane);
      }
    }
  };

  updateClipPlanesGeometry();
  applyClipPlanesToSystem(flairSystem);

  // Add FLAIR volume
  renderer.addVolume(flairSystem.volume);

  // LOD state manager
  const lodManager = new LODStateManager([flairSystem], throttler);

  // Lazy mask system
  let maskSystem: TripleLODSystem | null = null;
  let maskVolumeData: MultiResVolumeData | null = null;

  const createMaskSystem = async (): Promise<void> => {
    if (maskSystem) return;
    console.log('Loading mask volume with 3 LOD levels (lazy)...');
    maskVolumeData = await loadMultiResVolumeData(maskUrl);
    maskSystem = createTripleLODSystem(
      maskVolumeData,
      maskColorTF,
      maskOpacityTF,
      true
    );
    applyClipPlanesToSystem(maskSystem);
    renderer.addVolume(maskSystem.volume);
    lodManager.addSystem(maskSystem);
  };

  // Camera setup
  renderer.resetCamera();
  const camera = renderer.getActiveCamera();
  camera.elevation(15);
  camera.azimuth(25);
  camera.zoom(1.3);
  renderer.resetCameraClippingRange();

  // Smooth zoom handler
  const zoomHandler = new SmoothZoomHandler(
    camera,
    renderer,
    throttler,
    () => lodManager.startInteraction(),
    () => lodManager.endInteraction()
  );

  // Wheel event handler
  const wheelHandler = (event: WheelEvent): void => {
    event.preventDefault();
    zoomHandler.addDelta(event.deltaY);
  };

  const canvasEl = container.querySelector('canvas');
  if (canvasEl) {
    canvasEl.addEventListener('wheel', wheelHandler, { passive: false });
  }

  // Interaction events
  interactor.onStartAnimation(() => {
    lodManager.startInteraction();
  });

  interactor.onEndAnimation(() => {
    lodManager.endInteraction();
  });

  interactor.onStartMouseMove(() => {
    lodManager.startInteraction();
  });

  interactor.onEndMouseMove(() => {
    lodManager.endInteraction();
  });

  // Initial render
  throttler.forceRender();
  console.log('Render complete with 3-level LOD system!');

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  return {
    async setMaskVisible(visible: boolean): Promise<void> {
      if (visible && !maskSystem) {
        await createMaskSystem();
      }
      maskVisible = visible;
      if (maskSystem) {
        maskSystem.volume.setVisibility(visible);
        throttler.requestRender();
      }
    },

    getMaskVisible(): boolean {
      return maskVisible;
    },

    setBrainOpacity(opacity: number): void {
      brainOpacity = Math.max(0, Math.min(1, opacity));
      updateBrainOpacityTF(brainOpacityTF, brainOpacity, threshold);
      throttler.requestRender();
    },

    getBrainOpacity(): number {
      return brainOpacity;
    },

    setMaskOpacity(opacity: number): void {
      maskOpacity = Math.max(0, Math.min(1, opacity));
      updateMaskOpacityTF(maskOpacityTF, maskOpacity);
      throttler.requestRender();
    },

    getMaskOpacity(): number {
      return maskOpacity;
    },

    setClipPlanes(planes: Partial<ClipPlanes>): void {
      if (planes.x) clipPlanes.x = planes.x;
      if (planes.y) clipPlanes.y = planes.y;
      if (planes.z) clipPlanes.z = planes.z;
      updateClipPlanesGeometry();
      applyClipPlanesToSystem(flairSystem);
      if (maskSystem) {
        applyClipPlanesToSystem(maskSystem);
      }
      throttler.requestRender();
    },

    getClipPlanes(): ClipPlanes {
      return { ...clipPlanes };
    },

    setBrainPreset(preset: BrainPreset): void {
      currentPreset = preset;
      const colorTF = colorTFCache.get(preset);
      if (colorTF) {
        flairSystem.property.setRGBTransferFunction(0, colorTF);
        throttler.requestRender();
      }
    },

    getBrainPreset(): BrainPreset {
      return currentPreset;
    },

    setTheme(newTheme: 'dark' | 'light'): void {
      currentTheme = newTheme;
      renderer.setBackground(newTheme === 'dark' ? darkBg : lightBg);
      throttler.requestRender();
    },

    setRenderMode(mode: RenderMode): void {
      lodManager.setRenderMode(mode);
    },

    getRenderMode(): RenderMode {
      return lodManager.getRenderMode();
    },

    resetCamera(): void {
      renderer.resetCamera();
      camera.elevation(15);
      camera.azimuth(25);
      camera.zoom(1.3);
      renderer.resetCameraClippingRange();
      throttler.forceRender();
    },

    setView(view: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'isometric'): void {
      renderer.resetCamera();
      switch (view) {
        case 'front': camera.setPosition(0, -1, 0); camera.setViewUp(0, 0, 1); break;
        case 'back': camera.setPosition(0, 1, 0); camera.setViewUp(0, 0, 1); break;
        case 'left': camera.setPosition(-1, 0, 0); camera.setViewUp(0, 0, 1); break;
        case 'right': camera.setPosition(1, 0, 0); camera.setViewUp(0, 0, 1); break;
        case 'top': camera.setPosition(0, 0, 1); camera.setViewUp(0, 1, 0); break;
        case 'bottom': camera.setPosition(0, 0, -1); camera.setViewUp(0, 1, 0); break;
        case 'isometric':
        default: camera.setPosition(1, -1, 1); camera.setViewUp(0, 0, 1); break;
      }
      renderer.resetCamera();
      camera.zoom(1.3);
      renderer.resetCameraClippingRange();
      throttler.forceRender();
    },

    getDimensions(): { x: number; y: number; z: number } {
      return { ...dimensions };
    },

    destroy(): void {
      // Cancel pending operations
      lodManager.destroy();
      throttler.cancel();
      zoomHandler.cancel();

      // Remove wheel listener
      if (canvasEl) {
        canvasEl.removeEventListener('wheel', wheelHandler);
      }

      // Remove volumes
      renderer.removeVolume(flairSystem.volume);
      if (maskSystem) {
        renderer.removeVolume(maskSystem.volume);
      }

      // Delete FLAIR system
      flairSystem.volume.delete();
      flairSystem.fastMapper.delete();
      flairSystem.normalMapper.delete();
      flairSystem.qualityMapper.delete();
      flairSystem.fullResData.delete();
      flairSystem.halfResData.delete();
      flairSystem.quarterResData.delete();

      // Delete mask system
      if (maskSystem) {
        maskSystem.volume.delete();
        maskSystem.fastMapper.delete();
        maskSystem.normalMapper.delete();
        maskSystem.qualityMapper.delete();
        maskSystem.fullResData.delete();
        maskSystem.halfResData.delete();
        maskSystem.quarterResData.delete();
      }

      // Delete clipping planes
      for (const plane of clipPlanesVTK) {
        plane.delete();
      }

      // Delete transfer functions
      for (const [, tf] of colorTFCache) {
        tf.delete();
      }
      brainOpacityTF.delete();
      maskColorTF.delete();
      maskOpacityTF.delete();

      // Delete renderer
      fullScreenRenderer.delete();

      // Release GPU memory
      const canvas = container.querySelector('canvas');
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }

      container.innerHTML = '';
    },
  };
}

export default drawScan;
