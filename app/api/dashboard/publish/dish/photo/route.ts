// Add, replace or remove the photo of a dish in the library.
// The browser shrinks the picture before sending it, so files arrive small.

import { NextResponse } from 'next/server';
import { getDashboardUser, canAct } from '@/lib/auth';
import { setDishPhoto, clearDishPhoto, dishPhotoExtension, DISH_PHOTO_MAX_BYTES } from '@/lib/publisher';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The file must really be the image type it claims to be. */
function looksLike(mime: string, b: Buffer): boolean {
  if (mime === 'image/jpeg') return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === 'image/png') return b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/webp') return b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';
  return false;
}

export async function POST(req: Request) {
  const user = await getDashboardUser();
  if (!canAct(user, 'kitchen_action')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ error: 'invalid form' }, { status: 400 });
  }
  const dishId = String(form.get('dishId') ?? '');
  const file = form.get('photo');
  if (!UUID.test(dishId)) return NextResponse.json({ error: 'invalid dish' }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: 'photo required' }, { status: 400 });
  if (!dishPhotoExtension(file.type)) return NextResponse.json({ error: 'Use a JPG, PNG or WebP picture.' }, { status: 415 });
  if (file.size === 0) return NextResponse.json({ error: 'empty file' }, { status: 400 });
  if (file.size > DISH_PHOTO_MAX_BYTES) return NextResponse.json({ error: 'The picture is too large (4 MB at most).' }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!looksLike(file.type, bytes)) return NextResponse.json({ error: 'The file is not a valid picture.' }, { status: 415 });

  try {
    const dish = await setDishPhoto(dishId, bytes, file.type);
    return NextResponse.json({ ok: true, dish });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    return NextResponse.json({ error: msg }, { status: msg === 'dish not found' ? 404 : 500 });
  }
}

export async function DELETE(req: Request) {
  const user = await getDashboardUser();
  if (!canAct(user, 'kitchen_action')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const dishId = new URL(req.url).searchParams.get('dishId') ?? '';
  if (!UUID.test(dishId)) return NextResponse.json({ error: 'invalid dish' }, { status: 400 });

  try {
    const dish = await clearDishPhoto(dishId);
    return NextResponse.json({ ok: true, dish });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    return NextResponse.json({ error: msg }, { status: msg === 'dish not found' ? 404 : 500 });
  }
}
