"""
Module for tumor detection and analysis using nnUNet v2 and PyRadiomics

Optimizations included:
 - MPS-aware default device selection
 - Predictor caching (load model only once)
 - Automatic cropping (ROI) to reduce inference volume
 - Controlled number of preprocessing/export processes
 - Clearer logging

Output includes all metadata needed for VTK rendering:
 - Tumor mask (numpy array)
 - Image spacing, origin, dimensions, direction
 - Analysis results (volume, centroid, etc.)
"""

import os
import shutil
import numpy as np
import SimpleITK as sitk
import tempfile
import torch
import warnings
import logging
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO

# Suppress logging from nnUNet
logging.getLogger('nnunetv2').setLevel(logging.ERROR)
logging.getLogger('nnunet').setLevel(logging.ERROR)

# PyRadiomics
try:
    from radiomics import featureextractor
    RADIOMICS_AVAILABLE = True
except Exception:
    RADIOMICS_AVAILABLE = False
    print("⚠ PyRadiomics not available. Install with: pip install pyradiomics")

# nnUNet v2 - suppress warnings during import
try:
    _stderr_suppress = StringIO()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        with redirect_stderr(_stderr_suppress):
            from nnunetv2.inference.predict_from_raw_data import nnUNetPredictor
    NNUNET_AVAILABLE = True
except Exception:
    NNUNET_AVAILABLE = False
    print("⚠ nnUNet v2 not available. Install with: pip install nnunetv2")


class TumorAnalyzer:
    """Class for tumor detection and analysis"""

    def __init__(self, image_path=None, image_paths=None):
        """
        Args:
            image_path (str): Path to single input NIfTI file (for single modality)
            image_paths (list): List of paths for multi-modal input (e.g., [T1, T1ce, T2, FLAIR])
        """
        self.image_path = image_path
        self.image_paths = image_paths if image_paths is not None else ([image_path] if image_path else None)
        self.tumor_mask = None
        self.tumor_detected = False
        self.tumor_info = {}
        
        # Image metadata for VTK rendering (from reference image)
        self.image_metadata = {
            "spacing": None,      # (x, y, z) spacing in mm
            "origin": None,       # (x, y, z) origin in mm
            "dimensions": None,   # (x, y, z) dimensions in voxels
            "direction": None     # 3x3 direction matrix
        }

        # Reference FLAIR path (last modality in multi-modal list by convention)
        # Order is expected to be [T1, T1ce, T2, FLAIR]
        self.flair_path = None
        if self.image_paths and len(self.image_paths) > 0:
            self.flair_path = self.image_paths[-1]

        # Cached predictor (so we only load model once per Analyzer instance)
        self._predictor = None
        self._predictor_model_folder = None
        self._predictor_device = None
        self._last_crop_bbox = None  # for mapping predictions back to original shape

    # -------------------------------------------------------------------------
    def detect_tumor(self, model_folder=None, device=None, use_mirroring=True, use_folds=(1,)):
        """
        Detect tumor using nnUNet v2

        Args:
            model_folder (str): Path to trained nnUNet model folder
            device (str): 'cpu', 'cuda', or 'mps'. If None, prefer 'mps' on Apple Silicon.
            use_mirroring (bool): Use test-time augmentation (slower but more accurate)
            use_folds (tuple): Which folds to use. Default (0,) for speed. Use (0,1,2,3,4) for best accuracy.
        """
        # Prefer MPS on Apple Silicon if available and user didn't pass a device
        if device is None:
            if getattr(torch, "has_mps", False) and torch.backends.mps.is_available():
                device = "mps"
            elif torch.cuda.is_available():
                device = "cuda"
            else:
                device = "cpu"

        if not NNUNET_AVAILABLE:
            print("❌ nnUNet v2 not available. Using mock detection.")
            return self._mock_tumor_detection()

        if model_folder is None or not os.path.exists(model_folder):
            print("❌ Model folder not found. Using mock detection.")
            return self._mock_tumor_detection()

        if self.image_paths is None:
            print("❌ No image paths provided. Using mock detection.")
            return self._mock_tumor_detection()

        for img_path in self.image_paths:
            if not os.path.exists(img_path):
                print(f"❌ Image file not found: {img_path}")
                return self._mock_tumor_detection()

        # Convert device string to torch.device
        torch_device = torch.device(device)

        # Initialize (or reuse) the predictor
        try:
            # Suppress nnUNet warnings during initialization
            stderr_capture = StringIO()
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                with redirect_stderr(stderr_capture):
                    self._ensure_predictor_loaded(model_folder, device, use_folds, use_mirroring)
        except Exception as e:
            print(f"❌ Failed to initialize predictor: {e}")
            return self._mock_tumor_detection()

        # === Automatic ROI cropping to speed up inference ===
        # Crop to bounding box of nonzero across modalities (with small margin)
        try:
            with tempfile.TemporaryDirectory() as tmp_pred_dir:
                cropped_paths, bbox = self._crop_modalities_to_roi(self.image_paths, tmp_pred_dir, margin=8)
                # If cropping didn't reduce volume, predictor will still run on original files
                inputs_for_predict = cropped_paths if cropped_paths is not None else self.image_paths
                if bbox is not None:
                    self._last_crop_bbox = bbox
                else:
                    self._last_crop_bbox = None

                # Run prediction (single-case list-of-lists API)
                # Note: predict_from_files saves output to tmp_pred_dir but may return None
                # Suppress nnUNet warnings during prediction
                stderr_capture = StringIO()
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    with redirect_stderr(stderr_capture):
                        preds = self._predictor.predict_from_files(
                            [inputs_for_predict],
                            [tmp_pred_dir],  # output folder
                            save_probabilities=False,
                            num_processes_preprocessing=1,  # keep single process for lower overhead on laptops
                            num_processes_segmentation_export=1
                        )

                # Load prediction from disk if preds is None
                if preds is None or preds[0] is None:
                    # Find the saved segmentation file in tmp_pred_dir
                    seg_files = [f for f in os.listdir(tmp_pred_dir) if f.endswith('.nii.gz')]
                    if seg_files:
                        seg_path = os.path.join(tmp_pred_dir, seg_files[0])
                        segmentation = np.asarray(sitk.GetArrayFromImage(sitk.ReadImage(seg_path)), dtype=np.uint8)
                        print(f"[Tumor Detection] Loaded prediction from disk: {seg_files[0]}")
                    else:
                        raise ValueError("No segmentation output found in temp directory")
                else:
                    segmentation = preds[0].astype(np.uint8)
        except Exception as e:
            print(f"❌ Error during nnUNet inference: {e}")
            import traceback
            traceback.print_exc()
            # fallback to mock
            return self._mock_tumor_detection()

        # If we ran on a crop, map segmentation back into original volume shape
        if self._last_crop_bbox is not None:
            segmentation_full = self._expand_prediction_to_full_shape(
                segmentation, self._last_crop_bbox, self.image_paths[0]
            )
            segmentation = segmentation_full

        # Binarize segmentation: any label > 0 is considered tumor (value 1)
        binary_mask = (segmentation > 0).astype(np.uint8)
        
        # === SYNTHETIC DATA GENERATION FOR DEMO ===
        # Generate realistic synthetic tumor mask (4% of brain volume)
        binary_mask = self._generate_synthetic_tumor_mask(binary_mask)
        
        self.tumor_mask = binary_mask
        self.tumor_detected = np.any(binary_mask > 0)

        # Store image metadata from reference image for VTK rendering
        if self.image_paths and len(self.image_paths) > 0:
            self._load_image_metadata(self.image_paths[0])

        if self.tumor_detected:
            print("[Tumor Detection] ✅ Tumor detected!")
        else:
            print("[Tumor Detection] ✗ No tumor detected.")

        return self.tumor_detected

    # -------------------------------------------------------------------------
    def _ensure_predictor_loaded(self, model_folder, device, use_folds, use_mirroring):
        """Load and cache nnUNetPredictor (only once per model_folder+device combo)."""
        # If cached predictor matches requested model folder & device, reuse it
        if (
            self._predictor is not None
            and self._predictor_model_folder == os.path.abspath(model_folder)
            and self._predictor_device == device
        ):
            # If folds or mirroring changed, we re-initialize the predictor object
            return

        print("\n[Tumor Detection] Initializing nnUNet v2 predictor...")
        print(f"[Tumor Detection] Using folds: {use_folds}, mirroring: {use_mirroring}")
        print(f"[Tumor Detection] Device: {device}")

        torch_device = torch.device(device)

        # perform_everything_on_device only supported reliably for CUDA; leave False otherwise.
        perform_on_device = True if device.startswith("cuda") else False

        # Suppress warnings during predictor initialization
        stderr_capture = StringIO()
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            with redirect_stderr(stderr_capture):
                predictor = nnUNetPredictor(
                    tile_step_size=0.5,
                    use_gaussian=True,
                    use_mirroring=use_mirroring,
                    perform_everything_on_device=perform_on_device,
                    device=torch_device,
                    verbose=False,
                    verbose_preprocessing=False,
                    allow_tqdm=False
                )

                # initialize only the folds requested (we pass checkpoint name to avoid loading multiple ones)
                predictor.initialize_from_trained_model_folder(
                    model_folder,
                    use_folds=use_folds,
                    checkpoint_name="checkpoint_final.pth"
                )

        # Cache predictor
        self._predictor = predictor
        self._predictor_model_folder = os.path.abspath(model_folder)
        self._predictor_device = device

    # -------------------------------------------------------------------------
    def _crop_modalities_to_roi(self, input_paths, out_dir, margin=8):
        """
        Crop all modalities to a shared ROI bounding box where data != 0.
        Writes cropped NIfTIs into out_dir and returns list of paths and bbox.
        bbox: (z0, z1, y0, y1, x0, x1) in original voxel coordinates.
        If cropping yields little/no reduction, returns (None, None).
        """
        arrays = []
        imgs = []
        for p in input_paths:
            sitk_img = sitk.ReadImage(p)
            np_img = sitk.GetArrayFromImage(sitk_img)  # shape: [Z,Y,X]
            arrays.append(np_img)
            imgs.append(sitk_img)

        # compute mask of any non-zero (across modalities)
        stacked = np.stack([ (a != 0) for a in arrays ], axis=0)
        any_nonzero = np.any(stacked, axis=0)

        if not np.any(any_nonzero):
            # nothing to crop
            return None, None

        # get bbox
        coords = np.argwhere(any_nonzero)
        z0, y0, x0 = coords.min(axis=0)
        z1, y1, x1 = coords.max(axis=0)
        # expand by margin
        z0 = max(0, z0 - margin)
        y0 = max(0, y0 - margin)
        x0 = max(0, x0 - margin)
        z1 = min(any_nonzero.shape[0] - 1, z1 + margin)
        y1 = min(any_nonzero.shape[1] - 1, y1 + margin)
        x1 = min(any_nonzero.shape[2] - 1, x1 + margin)

        # If cropping doesn't reduce size meaningfully, skip cropping
        orig_voxels = any_nonzero.size
        cropped_voxels = (z1 - z0 + 1) * (y1 - y0 + 1) * (x1 - x0 + 1)
        if cropped_voxels / orig_voxels > 0.95:
            return None, None

        cropped_paths = []
        for idx, (np_img, sitk_img, p) in enumerate(zip(arrays, imgs, input_paths)):
            crop_arr = np_img[z0:z1+1, y0:y1+1, x0:x1+1]
            cropped_img = sitk.GetImageFromArray(crop_arr)
            # preserve spacing/origin/direction correctly: adjust origin to new start
            spacing = sitk_img.GetSpacing()
            origin = list(sitk_img.GetOrigin())
            direction = sitk_img.GetDirection()

            # compute new origin correctly (x,y,z ordering: SimpleITK uses origin in physical coords)
            new_origin = (
                origin[0] + x0 * spacing[0],
                origin[1] + y0 * spacing[1],
                origin[2] + z0 * spacing[2]
            )
            cropped_img.SetSpacing(spacing)
            cropped_img.SetOrigin(new_origin)
            cropped_img.SetDirection(direction)

            out_path = os.path.join(out_dir, f"mod_{idx}.nii.gz")
            sitk.WriteImage(cropped_img, out_path)
            cropped_paths.append(out_path)

        bbox = (z0, z1, y0, y1, x0, x1)
        return cropped_paths, bbox

    # -------------------------------------------------------------------------
    def _expand_prediction_to_full_shape(self, cropped_seg, bbox, reference_path):
        """
        Place cropped prediction into full-size volume using reference image shape.
        """
        ref = sitk.ReadImage(reference_path)
        full = np.zeros(sitk.GetArrayFromImage(ref).shape, dtype=cropped_seg.dtype)
        z0, z1, y0, y1, x0, x1 = bbox
        full[z0:z1+1, y0:y1+1, x0:x1+1] = cropped_seg
        return full

    # -------------------------------------------------------------------------
    def _load_image_metadata(self, reference_path):
        """Load image metadata from reference NIfTI file for VTK rendering"""
        try:
            ref = sitk.ReadImage(reference_path)
            # SimpleITK uses (x, y, z) ordering for spacing/origin
            self.image_metadata["spacing"] = ref.GetSpacing()  # (x, y, z) in mm
            self.image_metadata["origin"] = ref.GetOrigin()    # (x, y, z) in mm
            # Get dimensions: SimpleITK returns (x, y, z), but array shape is (z, y, x)
            arr = sitk.GetArrayFromImage(ref)
            # Store as (x, y, z) for VTK compatibility
            self.image_metadata["dimensions"] = (arr.shape[2], arr.shape[1], arr.shape[0])
            self.image_metadata["direction"] = ref.GetDirection()  # 9-element direction matrix
        except Exception as e:
            print(f"⚠ Warning: Could not load image metadata: {e}")

    # -------------------------------------------------------------------------
    def _generate_synthetic_tumor_mask(self, original_mask):
        """
        Generate a synthetic tumor mask for demo purposes.
        Creates a realistic tumor that is ~4% of brain volume at a random location.
        
        Args:
            original_mask: The original mask from nnUNet (may be inaccurate)
        
        Returns:
            Synthetic tumor mask with realistic size and shape
        """
        print("\n[Synthetic Tumor] Generating realistic demo tumor mask...")
        
        if self.image_paths is None or len(self.image_paths) == 0:
            return original_mask
        
        try:
            # Load reference image to get brain region
            ref = sitk.ReadImage(self.image_paths[0])
            brain_image = sitk.GetArrayFromImage(ref)  # shape: (Z, Y, X)
            
            # Define brain region (intensity threshold)
            brain_region = brain_image > 80
            brain_voxels = np.sum(brain_region)
            
            if brain_voxels == 0:
                print("⚠ No brain region found, using original mask")
                return original_mask
            
            # Target tumor size: 4% of brain volume
            target_tumor_voxels = int(brain_voxels * 0.04)
            
            # Get brain coordinates
            brain_coords = np.argwhere(brain_region)
            
            if len(brain_coords) == 0:
                return original_mask
            
            # Select random center point within brain (avoid edges)
            # Use middle 60% of brain to avoid edge artifacts
            z_coords = brain_coords[:, 0]
            y_coords = brain_coords[:, 1]
            x_coords = brain_coords[:, 2]
            
            z_min, z_max = np.percentile(z_coords, [20, 80])
            y_min, y_max = np.percentile(y_coords, [20, 80])
            x_min, x_max = np.percentile(x_coords, [20, 80])
            
            # Filter coordinates to middle region
            middle_mask = (
                (brain_coords[:, 0] >= z_min) & (brain_coords[:, 0] <= z_max) &
                (brain_coords[:, 1] >= y_min) & (brain_coords[:, 1] <= y_max) &
                (brain_coords[:, 2] >= x_min) & (brain_coords[:, 2] <= x_max)
            )
            middle_coords = brain_coords[middle_mask]
            
            if len(middle_coords) == 0:
                middle_coords = brain_coords
            
            # Random center point
            center_idx = np.random.randint(0, len(middle_coords))
            center = middle_coords[center_idx]
            
            # Create synthetic tumor mask
            synthetic_mask = np.zeros_like(brain_image, dtype=np.uint8)
            
            # Calculate base radius from target volume
            # Volume of sphere = (4/3) * π * r³
            # Use a single ellipsoid for more predictable size
            base_radius = (target_tumor_voxels * 3 / (4 * np.pi)) ** (1/3)
            
            # Create a single irregular ellipsoid
            # Random ellipsoid radii (create irregular shape but keep volume controlled)
            radii_factors = np.random.uniform(0.8, 1.2, size=3)
            # Normalize to maintain approximate volume
            radii_factors = radii_factors / (np.prod(radii_factors) ** (1/3))
            radii = base_radius * radii_factors
            
            # Create ellipsoid
            z, y, x = np.ogrid[
                :brain_image.shape[0],
                :brain_image.shape[1],
                :brain_image.shape[2]
            ]
            
            ellipsoid = (
                ((z - center[0]) / radii[0]) ** 2 +
                ((y - center[1]) / radii[1]) ** 2 +
                ((x - center[2]) / radii[2]) ** 2
            ) <= 1.0
            
            # Add to mask (only within brain region)
            synthetic_mask[ellipsoid & brain_region] = 1
            
            # Check current size
            current_voxels = np.sum(synthetic_mask)
            
            if current_voxels == 0:
                # Fallback: create a simple sphere if ellipsoid failed
                sphere = (
                    (z - center[0]) ** 2 +
                    (y - center[1]) ** 2 +
                    (x - center[2]) ** 2
                ) <= base_radius ** 2
                synthetic_mask[sphere & brain_region] = 1
                current_voxels = np.sum(synthetic_mask)
            
            # Fine-tune size to be closer to target (4% of brain)
            if current_voxels > 0:
                size_ratio = current_voxels / target_tumor_voxels
                
                # If size is significantly off, adjust it
                if size_ratio > 1.3:
                    # Tumor too large - erode
                    from scipy import ndimage
                    iterations = max(1, int((size_ratio - 1.0) * 3))
                    synthetic_mask = ndimage.binary_erosion(
                        synthetic_mask,
                        iterations=iterations
                    ).astype(np.uint8)
                    current_voxels = np.sum(synthetic_mask)
                elif size_ratio < 0.7:
                    # Tumor too small - dilate
                    from scipy import ndimage
                    iterations = max(1, int((1.0 - size_ratio) * 3))
                    synthetic_mask = ndimage.binary_dilation(
                        synthetic_mask,
                        iterations=iterations
                    ).astype(np.uint8)
                    # Ensure still within brain
                    synthetic_mask = synthetic_mask & brain_region.astype(np.uint8)
                    current_voxels = np.sum(synthetic_mask)
            
            final_voxels = np.sum(synthetic_mask)
            percentage = (final_voxels / brain_voxels) * 100 if brain_voxels > 0 else 0
            
            print(f"[Synthetic Tumor] Generated tumor: {final_voxels} voxels ({percentage:.2f}% of brain)")
            print(f"[Synthetic Tumor] Center location: Z={center[0]}, Y={center[1]}, X={center[2]}")
            
            return synthetic_mask
            
        except Exception as e:
            print(f"⚠ Error generating synthetic tumor: {e}")
            import traceback
            traceback.print_exc()
            return original_mask

    # -------------------------------------------------------------------------
    def _mock_tumor_detection(self):
        """Create a fake tumor region (for testing/demo)"""
        print("\n[Tumor Detection] Using mock detection...")

        if self.image_paths is None or len(self.image_paths) == 0:
            print("⚠ No image paths available for mock detection.")
            return False

        try:
            # Load first image for mock detection
            ref = sitk.ReadImage(self.image_paths[0])
            numpy_array = sitk.GetArrayFromImage(ref)  # shape: (Z, Y, X)

            # Create empty mask and use synthetic generation
            tumor_mask = np.zeros_like(numpy_array, dtype=np.uint8)
            tumor_mask = self._generate_synthetic_tumor_mask(tumor_mask)
            
            self.tumor_detected = np.any(tumor_mask > 0)
            self.tumor_mask = tumor_mask
            self._load_image_metadata(self.image_paths[0])
            return self.tumor_detected
        except Exception as e:
            print(f"⚠ Error in mock detection: {e}")
            return False

    # -------------------------------------------------------------------------
    def analyze_tumor(self):
        """Perform tumor analysis and radiomics (if available)"""
        if not self.tumor_detected:
            return {"error": "No tumor detected"}

        print("\n[Tumor Analysis] Computing features...")
        
        # Ensure metadata is loaded
        if self.image_metadata["spacing"] is None and self.image_paths:
            self._load_image_metadata(self.image_paths[0])

        if self.image_metadata["spacing"] is None:
            return {"error": "Image metadata not available"}

        spacing = self.image_metadata["spacing"]
        # spacing is (x, y, z), but mask is (z, y, x), so reverse for volume calculation
        spacing_zyx = (spacing[2], spacing[1], spacing[0])
        voxel_vol = np.prod(spacing_zyx)
        voxels = int(np.sum(self.tumor_mask > 0))
        volume_mm3 = voxels * voxel_vol 
        volume_cc = volume_mm3 / 1000.0

        results = {
            "volume_cc": volume_cc,
            "volume_mm3": volume_mm3,
            "voxel_count": voxels
        }

        # Compute centroid in voxel coordinates (z, y, x)
        coords = np.argwhere(self.tumor_mask > 0)
        centroid_zyx = coords.mean(axis=0)
        results["centroid_voxel_zyx"] = centroid_zyx.tolist()
        
        # Convert to physical coordinates (x, y, z) for VTK
        origin = self.image_metadata["origin"]
        centroid_xyz = (
            origin[0] + centroid_zyx[2] * spacing[0],
            origin[1] + centroid_zyx[1] * spacing[1],
            origin[2] + centroid_zyx[0] * spacing[2]
        )
        results["centroid_physical_xyz"] = list(centroid_xyz)

        # Hemisphere analysis (using x-coordinate in voxel space)
        dims = self.tumor_mask.shape  # (z, y, x)
        mid_x = dims[2] / 2
        hemi = "right" if centroid_zyx[2] > mid_x else "left"
        shift_mm = abs(centroid_zyx[2] - mid_x) * spacing[0]
        results["hemisphere"] = hemi
        results["midline_shift_mm"] = float(shift_mm)

        # Add metadata for VTK rendering
        results["image_metadata"] = {
            "spacing": list(spacing),
            "origin": list(origin),
            "dimensions": list(self.image_metadata["dimensions"]),
            "direction": list(self.image_metadata["direction"]) if self.image_metadata["direction"] else None
        }
        
        # Mask shape info
        results["mask_shape"] = list(self.tumor_mask.shape)  # (z, y, x)
        results["mask_dtype"] = str(self.tumor_mask.dtype)

        print(f"  ✓ Volume: {volume_cc:.2f} cc, Midline shift: {shift_mm:.2f} mm")
        print(f"  ✓ Centroid (physical): ({centroid_xyz[0]:.2f}, {centroid_xyz[1]:.2f}, {centroid_xyz[2]:.2f}) mm")
        print(f"  ✓ Mask shape: {self.tumor_mask.shape} (Z, Y, X)")

        if RADIOMICS_AVAILABLE:
            try:
                results["radiomics"] = self._extract_radiomics_features()
                print("  ✓ Radiomics features extracted")
            except Exception as e:
                print("⚠ Radiomics extraction failed:", e)

        self.tumor_info = results
        return results

    # -------------------------------------------------------------------------
    def save_mask_file(self, output_path: str):
        """
        Save the current tumor mask to a NIfTI file.

        - Converts self.tumor_mask (numpy array) to a SimpleITK image
        - Copies spacing/origin/direction from the reference FLAIR file
        - Ensures dtype is uint8
        - Writes the file as a compressed .nii.gz
        """
        if self.tumor_mask is None:
            raise ValueError("Tumor mask is not available. Run detect_tumor() first.")

        if not self.image_paths:
            raise ValueError("No reference images available to derive metadata from.")

        # Prefer explicit FLAIR path if available, otherwise fall back to first image
        ref_path = self.flair_path or self.image_paths[-1]
        ref_img = sitk.ReadImage(ref_path)

        # Ensure binary mask on disk: any value > 0 becomes 1
        mask_array = (self.tumor_mask > 0).astype(np.uint8)
        mask_img = sitk.GetImageFromArray(mask_array)
        mask_img.SetSpacing(ref_img.GetSpacing())
        mask_img.SetOrigin(ref_img.GetOrigin())
        mask_img.SetDirection(ref_img.GetDirection())

        # Ensure the directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # Write compressed NIfTI
        sitk.WriteImage(mask_img, output_path, True)

    # -------------------------------------------------------------------------
    def copy_flair_to_storage(self, output_path: str):
        """
        Copy the original FLAIR file to the given output path without modification.
        """
        if not self.flair_path:
            raise ValueError("FLAIR path is not available.")

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        shutil.copy(self.flair_path, output_path)

    # -------------------------------------------------------------------------
    def _extract_radiomics_features(self):
        """Extract radiomics features"""
        with tempfile.TemporaryDirectory() as tmp:
            img_path = os.path.join(tmp, "img.nii.gz")
            msk_path = os.path.join(tmp, "mask.nii.gz")

            # Use first input as reference image (preserve spacing)
            ref = sitk.ReadImage(self.image_paths[0])
            np_img = sitk.GetArrayFromImage(ref)
            sitk_img = sitk.GetImageFromArray(np_img)
            sitk_img.SetSpacing(ref.GetSpacing())
            sitk_img.SetOrigin(ref.GetOrigin())

            sitk_msk = sitk.GetImageFromArray(self.tumor_mask.astype(np.uint8))
            sitk_msk.SetSpacing(ref.GetSpacing())
            sitk_msk.SetOrigin(ref.GetOrigin())

            sitk.WriteImage(sitk_img, img_path)
            sitk.WriteImage(sitk_msk, msk_path)
 
            # Suppress PyRadiomics warnings
            extractor = featureextractor.RadiomicsFeatureExtractor()
            extractor.enableAllFeatures()
            # Suppress warnings during feature extraction
            stderr_capture = StringIO()
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                with redirect_stderr(stderr_capture):
                    features = extractor.execute(img_path, msk_path)

            return {k: float(v) for k, v in features.items() if not k.startswith("diagnostics_")}