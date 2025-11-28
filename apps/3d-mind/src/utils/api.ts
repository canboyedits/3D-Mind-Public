export const API_BASE_URL = 'http://localhost:3001';

export interface RecordResponse {
  ok: boolean;
  recordId?: string;
  patient?: {
    name: string;
    dateOfBirth: string;
    contact: string;
    contactType: string;
  };
  tumor?: Record<string, unknown>;
  flairUrl?: string;
  maskUrl?: string;
  metadataUrl?: string;
  error?: string;
}

/**
 * Fetches a record from the backend API using uid and date of birth
 * @param uid - Unique identifier for the patient record
 * @param dob - Date of birth in YYYY-MM-DD format
 * @returns Promise resolving to the record response
 */
export async function fetchRecord(uid: string, dob: string): Promise<RecordResponse> {
  const url = new URL(`${API_BASE_URL}/record`);
  url.searchParams.append('uid', uid);
  url.searchParams.append('dob', dob);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const data: RecordResponse = await response.json();

  if (!response.ok) {
    // Return the error response with status info
    return {
      ...data,
      ok: false,
    };
  }

  return data;
}

