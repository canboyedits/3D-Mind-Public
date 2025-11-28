# Tumor Detection API

FastAPI server for brain tumor detection using nnUNet v2.

## Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Ensure you have the nnUNet model in the `models/` directory:
```
models/Dataset002_BRATS19/nnUNetTrainer__nnUNetPlans__3d_fullres/
```

## Running the Server

### From root directory (via package.json):
```bash
# Start both frontend and backend
pnpm dev

# Start only backend
pnpm dev:backend

# Start backend with auto-reload (development)
pnpm detection:backend:dev
```

### Directly:
```bash
cd detection
python server.py
```

The server will start on `http://0.0.0.0:8000` by default.

## API Endpoints

### Health Check
```
GET /
GET /health
```

### Detect Tumor
```
POST /detect
```

**Request:**
- Content-Type: `multipart/form-data`
- Files:
  - `t1`: T1-weighted NIfTI file
  - `t1ce`: T1ce-weighted NIfTI file
  - `t2`: T2-weighted NIfTI file
  - `flair`: FLAIR NIfTI file
- Optional:
  - `model_folder`: Path to model folder (defaults to `./models/Dataset002_BRATS19/nnUNetTrainer__nnUNetPlans__3d_fullres`)

**Response:**
```json
{
  "detected": 1,  // 1 if tumor detected, 0 if not
  "message": "Tumor detected",
  "results": {
    "volume_cc": 1467.009,
    "volume_mm3": 1467009.0,
    "voxel_count": 1467009,
    "hemisphere": "right",
    "midline_shift_mm": 0.437,
    "centroid_voxel_zyx": [79.81, 128.76, 120.44],
    "centroid_physical_xyz": [120.44, -110.24, 79.81],
    "image_metadata": {
      "spacing": [1.0, 1.0, 1.0],
      "origin": [-0.0, -239.0, 0.0],
      "dimensions": [240, 240, 155],
      "direction": [...]
    },
    "mask_shape": [155, 240, 240],
    "mask_dtype": "uint8",
    "radiomics": {...}
  }
}
```

## Example Usage

### Using curl:
```bash
curl -X POST "http://localhost:8000/detect" \
  -F "t1=@path/to/t1.nii.gz" \
  -F "t1ce=@path/to/t1ce.nii.gz" \
  -F "t2=@path/to/t2.nii.gz" \
  -F "flair=@path/to/flair.nii.gz"
```

### Using Python:
```python
import requests

files = {
    't1': open('t1.nii.gz', 'rb'),
    't1ce': open('t1ce.nii.gz', 'rb'),
    't2': open('t2.nii.gz', 'rb'),
    'flair': open('flair.nii.gz', 'rb')
}

response = requests.post('http://localhost:8000/detect', files=files)
result = response.json()

if result['detected'] == 1:
    print(f"Tumor detected! Volume: {result['results']['volume_cc']} cc")
else:
    print("No tumor detected")
```

