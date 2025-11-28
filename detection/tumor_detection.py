"""
Tumor detection module - Function-based interface for tumor detection
"""

import os
import sys
import json
import uuid
import re
import shutil
import warnings
import logging
from datetime import datetime
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from typing import List, Dict, Optional, Tuple

# Suppress nnUNet warnings about environment variables (set dummy values)
os.environ['nnUNet_raw'] = os.environ.get('nnUNet_raw', '/tmp/nnUNet_raw')
os.environ['nnUNet_preprocessed'] = os.environ.get('nnUNet_preprocessed', '/tmp/nnUNet_preprocessed')
os.environ['nnUNet_results'] = os.environ.get('nnUNet_results', '/tmp/nnUNet_results')

# Suppress Python warnings
warnings.filterwarnings('ignore')

# Suppress logging from nnUNet
logging.getLogger('nnunetv2').setLevel(logging.ERROR)
logging.getLogger('nnunet').setLevel(logging.ERROR)

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Project root and persistent storage paths
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
STORAGE_BASE_DIR = os.path.join(PROJECT_ROOT, "storage", "records")

# Ensure base storage directory exists on first import
os.makedirs(STORAGE_BASE_DIR, exist_ok=True)

# Suppress stderr during imports to catch nnUNet warnings
_stderr_suppress = StringIO()
with redirect_stderr(_stderr_suppress):
    from tumor_analyzer import TumorAnalyzer
    import torch


def _slugify_name(name: Optional[str]) -> str:
    """Create a filesystem-safe slug from the patient name."""
    if not name:
        return "unknown"
    # Lowercase, replace spaces with underscores, and keep alphanumerics/_/-
    name = name.strip().lower().replace(" ", "_")
    name = re.sub(r"[^a-z0-9_\-]", "", name)
    return name or "unknown"


def _create_record_directory(patient_name: Optional[str]) -> Tuple[str, str]:
    """
    Create a unique record directory for this patient under STORAGE_BASE_DIR.

    Returns:
        (record_id, record_dir)
    """
    slug = _slugify_name(patient_name)
    unique_id = uuid.uuid4().hex[:12]
    record_id = f"{slug}_{unique_id}"
    record_dir = os.path.join(STORAGE_BASE_DIR, record_id)
    os.makedirs(record_dir, exist_ok=True)
    return record_id, record_dir


def detect_tumor_from_files(
    image_paths: List[str],
    model_folder: str = "./models/Dataset002_BRATS19/nnUNetTrainer__nnUNetPlans__3d_fullres",
    device: Optional[str] = None,
    use_folds: Tuple[int, ...] = (0,),
    use_mirroring: bool = False,
    patient_name: Optional[str] = None,
    patient_metadata: Optional[Dict] = None
) -> Dict:
    """
    Detect tumor from image files and return results
    
    Args:
        image_paths: List of 4 image file paths [T1, T1ce, T2, FLAIR]
        model_folder: Path to nnUNet model folder
        device: Device to use ('cpu', 'cuda', 'mps', or None for auto-detect)
        use_folds: Which folds to use for prediction
        use_mirroring: Whether to use test-time augmentation
    
    Returns:
        Dictionary with detection results:
        - detected: 1 if tumor detected, 0 if not
        - message: Status message
        - results: Full analysis results if detected, None otherwise
    """
    # Auto-detect best device if not specified
    if device is None:
        if torch.backends.mps.is_built() and torch.backends.mps.is_available():
            device = "mps"
        elif torch.cuda.is_available():
            device = "cuda"
        else:
            device = "cpu"
    
    # Validate inputs
    if len(image_paths) != 4:
        return {
            "detected": 0,
            "message": "Error: Exactly 4 image files required (T1, T1ce, T2, FLAIR)",
            "results": None
        }
    
    for img_path in image_paths:
        if not os.path.exists(img_path):
            return {
                "detected": 0,
                "message": f"Error: Image file not found: {img_path}",
                "results": None
            }
    
    if not os.path.exists(model_folder):
        return {
            "detected": 0,
            "message": f"Error: Model folder not found: {model_folder}",
            "results": None
        }
    
    try:
        # Initialize analyzer
        analyzer = TumorAnalyzer(image_paths=image_paths)
        
        # Run detection
        detected = analyzer.detect_tumor(
            model_folder=model_folder,
            device=device,
            use_folds=use_folds,
            use_mirroring=use_mirroring
        )
        
        if detected:
            # Analyze tumor
            results = analyzer.analyze_tumor()

            # -----------------------------------------------------------------
            # Persistent storage: save FLAIR, mask, and metadata.json
            # Only executed when tumor detection succeeds
            # -----------------------------------------------------------------
            record_id, record_dir = _create_record_directory(patient_name)

            flair_output_path = os.path.join(record_dir, "flair.nii.gz")
            mask_output_path = os.path.join(record_dir, "mask.nii.gz")
            metadata_output_path = os.path.join(record_dir, "metadata.json")

            # Save original FLAIR and generated mask
            analyzer.copy_flair_to_storage(flair_output_path)
            analyzer.save_mask_file(mask_output_path)

            # Build metadata payload
            patient_block: Dict = patient_metadata.copy() if isinstance(patient_metadata, dict) else {}
            if patient_name is not None:
                patient_block.setdefault("name", patient_name)

            metadata_payload = {
                "patient": patient_block,
                "tumor": analyzer.tumor_info or results,
                "recordId": record_id,
                "createdAt": datetime.utcnow().isoformat() + "Z",
            }

            with open(metadata_output_path, "w", encoding="utf-8") as f:
                json.dump(metadata_payload, f, indent=2)

            # Relative paths (for frontend consumption)
            base_rel = f"storage/records/{record_id}"

            return {
                "detected": 1,
                "message": "Tumor detected",
                "results": results,
                "storagePath": base_rel,
                "flairUrl": f"{base_rel}/flair.nii.gz",
                "maskUrl": f"{base_rel}/mask.nii.gz",
                "metadataUrl": f"{base_rel}/metadata.json",
            }
        else:
            return {
                "detected": 0,
                "message": "No tumor detected",
                "results": None,
                "storagePath": None,
                "flairUrl": None,
                "maskUrl": None,
                "metadataUrl": None,
            }
    
    except Exception as e:
        return {
            "detected": 0,
            "message": f"Error during detection: {str(e)}",
            "results": None,
            "storagePath": None,
            "flairUrl": None,
            "maskUrl": None,
            "metadataUrl": None,
        }