"""
FastAPI server for tumor detection
Accepts 4 NIfTI files (T1, T1ce, T2, FLAIR) and returns detection results
"""

import os
import sys
import tempfile
import shutil
import logging
from pathlib import Path
from typing import Optional, Dict, Any

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

# Suppress uvicorn logging
logging.getLogger("uvicorn").setLevel(logging.ERROR)
logging.getLogger("uvicorn.access").setLevel(logging.ERROR)
logging.getLogger("uvicorn.error").setLevel(logging.ERROR)

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from tumor_detection import detect_tumor_from_files

app = FastAPI(
    title="Tumor Detection API",
    description="API for brain tumor detection using nnUNet v2",
    version="1.0.0",
    docs_url=None,  # Disable Swagger UI
    redoc_url=None  # Disable ReDoc
)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Default model folder
DEFAULT_MODEL_FOLDER = os.path.join(
    os.path.dirname(__file__),
    "models/Dataset002_BRATS19/nnUNetTrainer__nnUNetPlans__3d_fullres"
)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "message": "Tumor Detection API is running",
        "endpoints": {
            "detect": "/detect (POST) - Upload 4 NIfTI files for tumor detection"
        }
    }


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "healthy"}


@app.post("/detect")
async def detect_tumor(
    t1: UploadFile = File(..., description="T1-weighted NIfTI file"),
    t1ce: UploadFile = File(..., description="T1ce-weighted NIfTI file"),
    t2: UploadFile = File(..., description="T2-weighted NIfTI file"),
    flair: UploadFile = File(..., description="FLAIR NIfTI file"),
    model_folder: Optional[str] = Form(None, description="Path to model folder (optional)"),
    patientName: str = Form(..., description="Patient name"),
    patientMetadata: Optional[str] = Form(
        None,
        description="Optional JSON string with additional patient metadata"
    ),
):
    """
    Detect tumor from uploaded NIfTI files
    
    Accepts 4 files:
    - t1: T1-weighted image
    - t1ce: T1ce-weighted image
    - t2: T2-weighted image
    - flair: FLAIR image
    
    Returns:
    - detected: 1 if tumor detected, 0 if not
    - message: Status message
    - results: Full analysis results if detected
    - storagePath: Relative path to the record folder under storage/records/
    - flairUrl: Relative URL to the stored FLAIR file
    - maskUrl: Relative URL to the stored mask file
    - metadataUrl: Relative URL to the stored metadata.json
    """
    # Use default model folder if not provided
    if model_folder is None:
        model_folder = DEFAULT_MODEL_FOLDER
    
    # Validate model folder exists
    if not os.path.exists(model_folder):
        raise HTTPException(
            status_code=500,
            detail=f"Model folder not found: {model_folder}"
        )
    
    # Parse optional patient metadata JSON
    parsed_metadata: Optional[Dict[str, Any]] = None
    if patientMetadata:
        import json

        try:
            parsed_metadata = json.loads(patientMetadata)
        except Exception:
            # Fall back to raw string if JSON parsing fails
            parsed_metadata = {"raw": patientMetadata}

    # Create temporary directory for uploaded files
    temp_dir = None
    try:
        temp_dir = tempfile.mkdtemp(prefix="tumor_detection_")
        
        # Save uploaded files
        image_paths = []
        file_mapping = {
            "t1": t1,
            "t1ce": t1ce,
            "t2": t2,
            "flair": flair
        }
        
        for modality, uploaded_file in file_mapping.items():
            # Validate file extension
            filename = uploaded_file.filename
            if not filename:
                raise HTTPException(
                    status_code=400,
                    detail=f"Filename missing for {modality} file"
                )
            
            # Save file with appropriate extension
            file_ext = Path(filename).suffix
            if not file_ext:
                file_ext = ".nii.gz"
            elif file_ext == ".gz":
                # Handle .nii.gz case
                if filename.endswith(".nii.gz"):
                    file_ext = ".nii.gz"
                else:
                    file_ext = ".nii.gz"
            elif file_ext not in [".nii", ".gz"]:
                file_ext = ".nii.gz"
            
            saved_path = os.path.join(temp_dir, f"{modality}{file_ext}")
            
            # Write file
            with open(saved_path, "wb") as f:
                content = await uploaded_file.read()
                f.write(content)
            
            image_paths.append(saved_path)
        
        # Run detection
        result = detect_tumor_from_files(
            image_paths=image_paths,
            model_folder=model_folder,
            patient_name=patientName,
            patient_metadata=parsed_metadata,
        )
        
        return JSONResponse(content=result)
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error during tumor detection: {str(e)}"
        )
    finally:
        # Clean up temporary directory
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    # Get port from environment or use default
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    
    print(f"Starting Tumor Detection API server on {host}:{port}")
    
    uvicorn.run(
        app,
        host=host,
        port=port,
        reload=False,  # Set to True for development
        log_level="error",  # Only show errors, suppress INFO messages
        access_log=False  # Disable access logs
    )

