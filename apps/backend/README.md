# 3D-Mind Backend API

Express + TypeScript backend server for the 3D-Mind application.

## Overview

This backend provides a RESTful API for accessing medical imaging records with secure authentication using patient date of birth validation.

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- pnpm (v10.12.1 or higher)

### Installation

Install dependencies from the root of the monorepo:

```bash
pnpm install
```

Or from the backend directory:

```bash
cd apps/backend
pnpm install
```

### Environment Variables

Create a `.env` file in the `apps/backend` directory:

```env
PORT=3001
```

If `PORT` is not specified, the server defaults to port 3001.

### Development

Run the development server with hot reload:

```bash
pnpm dev
```

Or from the root:

```bash
pnpm dev:express
```

The server will start on `http://localhost:3001` (or the port specified in `.env`).

### Production Build

Build the TypeScript code for production:

```bash
pnpm build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### Production Start

After building, start the production server:

```bash
pnpm start
```

## API Endpoints

### GET /record

Retrieve a medical imaging record by patient UID and date of birth.

#### Query Parameters

- `uid` (required): Unique identifier for the patient record
- `dob` (required): Patient's date of birth in `YYYY-MM-DD` format

#### Example Request

```bash
GET /record?uid=yash_vyas_229c2713382c&dob=2005-12-29
```

#### Success Response (200 OK)

```json
{
  "ok": true,
  "recordId": "yash_vyas_229c2713382c",
  "patient": {
    "name": "Yash Vyas",
    "dateOfBirth": "2005-12-29",
    "contact": "9405988504",
    "contactType": "phone"
  },
  "tumor": {
    "volume_cc": 1402.903,
    "volume_mm3": 1402903.0,
    // ... other tumor data
  },
  "flairUrl": "/static/records/yash_vyas_229c2713382c/flair.nii.gz",
  "maskUrl": "/static/records/yash_vyas_229c2713382c/mask.nii.gz",
  "metadataUrl": "/static/records/yash_vyas_229c2713382c/metadata.json"
}
```

#### Error Responses

**400 Bad Request** - Missing or invalid query parameters:
```json
{
  "ok": false,
  "error": "uid query parameter is required"
}
```

**401 Unauthorized** - Date of birth mismatch:
```json
{
  "ok": false,
  "error": "Unauthorized: Date of birth mismatch"
}
```

**404 Not Found** - Record or metadata not found:
```json
{
  "ok": false,
  "error": "Record not found"
}
```

**500 Internal Server Error** - Server error:
```json
{
  "ok": false,
  "error": "Internal server error"
}
```

## Static Files

The server serves static files from the root-level `storage` directory at the `/static` endpoint.

### Example Static File URLs

- FLAIR image: `http://localhost:3001/static/records/{uid}/flair.nii.gz`
- Mask file: `http://localhost:3001/static/records/{uid}/mask.nii.gz`
- Metadata: `http://localhost:3001/static/records/{uid}/metadata.json`

## Project Structure

```
apps/backend/
├── src/
│   ├── controllers/
│   │   └── recordController.ts    # Record retrieval logic
│   ├── routes/
│   │   └── record.ts              # Record route definitions
│   └── main.ts                    # Express server entry point
├── dist/                          # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
├── tsconfig.build.json
└── README.md
```

## Security

- **CORS**: Currently configured to allow all origins. Update CORS settings in `src/main.ts` for production.
- **Authentication**: Patient records are protected by date of birth validation.
- **File Access**: Only files in the `storage/records/{uid}/` directory are accessible via the API.

## Development Notes

- The server uses ES modules (`"type": "module"` in package.json)
- TypeScript is compiled to ES2022 JavaScript
- Hot reload is enabled in development mode using `tsx watch`
- All routes are defined in the `src/routes/` directory
- Controllers handle business logic in `src/controllers/`

## Troubleshooting

### Port Already in Use

If port 3001 is already in use, either:
1. Change the `PORT` in your `.env` file
2. Kill the process using port 3001

### Module Not Found Errors

Ensure all dependencies are installed:
```bash
pnpm install
```

### TypeScript Compilation Errors

Check that your TypeScript version matches the project requirements:
```bash
pnpm list typescript
```

