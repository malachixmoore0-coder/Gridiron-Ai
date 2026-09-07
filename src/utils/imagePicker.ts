/**
 * Pick a photo and hand back something small enough to store.
 *
 * Two platforms, two very different jobs:
 *
 *   web     a hidden file input, then a canvas that centre-crops to the aspect
 *           the caller wants, downscales, and re-encodes as JPEG.
 *   native  the system picker with its own crop UI, then expo-image-manipulator
 *           for the same downscale and re-encode.
 *
 * Both return a `data:` URL. That is a deliberate choice: an avatar and a
 * banner are small, they belong to the profile row rather than to a bucket, and
 * a data URL means the feature works with the device-only backend and with
 * Supabase without either one needing file storage configured. The size caps
 * below are what keeps that honest — an unbounded data URL in a database row
 * would be a mistake, so nothing over the cap is ever returned.
 */
import { Platform } from 'react-native';

export interface PickSpec {
  /** width ÷ height of the finished image. */
  aspect: number;
  /** Longest edge, in pixels, after the downscale. */
  maxWidth: number;
  /** JPEG quality, 0-1. */
  quality?: number;
  /** Hard ceiling on the encoded result. */
  maxBytes?: number;
}

export interface PickResult {
  /** A data: URL, ready to store and render. */
  uri: string;
  bytes: number;
}

export class PickError extends Error {}

/** Roughly how many bytes a data URL costs — base64 is 4 bytes per 3. */
const byteLength = (dataUrl: string) => Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);

/* ---------------------------------------------------------------- web ---- */

function chooseFileWeb(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    // Safari will not open the dialog for an input that is not in the document.
    document.body.appendChild(input);
    let settled = false;
    const done = (f: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null));
    // There is no reliable "cancel" event across browsers; the focus that comes
    // back to the window when the dialog closes is the closest thing there is.
    window.addEventListener('focus', () => setTimeout(() => done(input.files?.[0] ?? null), 500), { once: true });
    input.click();
  });
}

function loadImageWeb(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new PickError('That file could not be read as an image.')); };
    img.src = url;
  });
}

/** Centre-crop to the aspect, downscale, encode. Retries smaller if too big. */
function encodeWeb(img: HTMLImageElement, spec: PickSpec): PickResult {
  const targetW = Math.min(spec.maxWidth, img.width);
  const targetH = Math.round(targetW / spec.aspect);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PickError('This browser will not let the app resize images.');

  // Cover: fill the frame, crop the overflow, keep the centre.
  const scale = Math.max(targetW / img.width, targetH / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  ctx.drawImage(img, (targetW - drawW) / 2, (targetH - drawH) / 2, drawW, drawH);

  const cap = spec.maxBytes ?? 220_000;
  let quality = spec.quality ?? 0.86;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const uri = canvas.toDataURL('image/jpeg', quality);
    const bytes = byteLength(uri);
    if (bytes <= cap || attempt === 3) {
      if (bytes > cap) throw new PickError('That image is too detailed to store even compressed. Try a smaller one.');
      return { uri, bytes };
    }
    quality -= 0.18;
  }
  throw new PickError('Could not compress that image.');
}

/* -------------------------------------------------------------- native --- */

async function pickNative(spec: PickSpec): Promise<PickResult | null> {
  const ImagePicker = require('expo-image-picker');
  const Manipulator = require('expo-image-manipulator');

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new PickError('Photo access is off for this app. Turn it on in Settings to change your picture.');

  // The system crop UI is better than anything drawn here, so it does the crop
  // and the manipulator only handles size and encoding.
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [Math.round(spec.aspect * 100), 100],
    quality: 1,
  });
  if (res.canceled || !res.assets?.length) return null;

  const asset = res.assets[0];
  const out = await Manipulator.manipulateAsync(
    asset.uri,
    [{ resize: { width: spec.maxWidth } }],
    { compress: spec.quality ?? 0.86, format: Manipulator.SaveFormat.JPEG, base64: true },
  );
  if (!out.base64) throw new PickError('That image could not be prepared.');
  const uri = `data:image/jpeg;base64,${out.base64}`;
  const bytes = byteLength(uri);
  if (bytes > (spec.maxBytes ?? 220_000)) throw new PickError('That image is too large to store. Try a smaller one.');
  return { uri, bytes };
}

/* ------------------------------------------------------------------------ */

/** Returns null when the person backed out; throws PickError with a reason. */
export async function pickImage(spec: PickSpec): Promise<PickResult | null> {
  if (Platform.OS !== 'web') return pickNative(spec);
  if (typeof document === 'undefined') return null;
  const file = await chooseFileWeb();
  if (!file) return null;
  if (!file.type.startsWith('image/')) throw new PickError('That is not an image file.');
  const img = await loadImageWeb(file);
  return encodeWeb(img, spec);
}

/** The two shapes the profile uses, in one place so they cannot drift. */
export const AVATAR_SPEC: PickSpec = { aspect: 1, maxWidth: 320, quality: 0.86, maxBytes: 90_000 };
export const BANNER_SPEC: PickSpec = { aspect: 3, maxWidth: 1200, quality: 0.82, maxBytes: 260_000 };
