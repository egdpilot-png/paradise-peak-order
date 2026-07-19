// Upsert a dish into the library. Called from the inline "New dish" form
// in the publisher sidebar.

import { NextResponse } from 'next/server';
import { getDashboardUser, canAct } from '@/lib/auth';
import { upsertDish } from '@/lib/publisher';
import type { CourseType, DietaryFlag } from '@/lib/types';

export const runtime = 'nodejs';

const COURSES: CourseType[] = ['amuse', 'starter', 'main', 'side', 'dessert'];
const DIETARY: DietaryFlag[] = ['vegan', 'vegetarian', 'gluten_free', 'dairy_free', 'nut_free'];

function cleanStringArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map(x => (typeof x === 'string' ? x.trim().toLowerCase() : ''))
    .filter(s => s.length > 0 && s.length <= 40)
    .slice(0, 8);
}

function cleanDietary(v: unknown): DietaryFlag[] {
  const arr = cleanStringArr(v);
  return arr.filter((s): s is DietaryFlag => (DIETARY as string[]).includes(s));
}

export async function POST(req: Request) {
  const user = await getDashboardUser();
  if (!canAct(user, 'kitchen_action')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const course = body?.course;
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  if (name.length > 120) return NextResponse.json({ error: 'name too long' }, { status: 400 });
  if (!COURSES.includes(course)) {
    return NextResponse.json({ error: 'invalid course' }, { status: 400 });
  }

  try {
    const dish = await upsertDish({
      id: typeof body.id === 'string' ? body.id : undefined,
      name,
      name_fr: typeof body.name_fr === 'string' ? body.name_fr.trim() || null : null,
      description: typeof body.description === 'string' ? body.description.trim() || null : null,
      description_fr: typeof body.description_fr === 'string' ? body.description_fr.trim() || null : null,
      course,
      tags: cleanStringArr(body.tags),
      allergens: cleanStringArr(body.allergens),
      dietary_ok: cleanDietary(body.dietary_ok),
      cost_est_eur: typeof body.cost_est_eur === 'number' ? body.cost_est_eur : null,
      price_eur: typeof body.price_eur === 'number' ? body.price_eur : null,
      active: body.active !== false,
    });
    return NextResponse.json({ ok: true, dish });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
