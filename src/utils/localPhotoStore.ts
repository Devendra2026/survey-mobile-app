/**
 * Persists survey photo JPEGs on device until Convex upload + link succeed.
 */
import type { SurveyPhotoSlot } from '@/utils/surveyPhotos';
import { Directory, File, Paths } from 'expo-file-system';

function photoDir(localId: string): Directory {
  return new Directory(Paths.document, `survey_photos/${localId}`);
}

function photoFile(localId: string, slot: SurveyPhotoSlot): File {
  return new File(photoDir(localId), `${slot}.jpg`);
}

/** Write compressed JPEG bytes; returns a stable file:// URI for previews. */
export async function saveLocalSurveyPhoto(
  localId: string,
  slot: SurveyPhotoSlot,
  jpegBytes: Uint8Array,
): Promise<string> {
  const dir = photoDir(localId);
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
  const file = photoFile(localId, slot);
  await file.write(jpegBytes);
  return file.uri;
}

export function localSurveyPhotoExists(localUri: string): boolean {
  try {
    return new File(localUri).exists;
  } catch {
    return false;
  }
}

export async function readLocalSurveyPhotoBytes(localUri: string): Promise<Uint8Array> {
  const file = new File(localUri);
  if (!file.exists) {
    throw new Error('Local photo file missing — retake the photo');
  }
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

export async function deleteLocalSurveyPhoto(localUri: string | undefined): Promise<void> {
  if (!localUri) return;
  try {
    const file = new File(localUri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // best-effort cleanup
  }
}

export async function deleteAllLocalSurveyPhotos(localId: string): Promise<void> {
  try {
    const dir = photoDir(localId);
    if (dir.exists) {
      dir.delete();
    }
  } catch {
    // ignore
  }
}
