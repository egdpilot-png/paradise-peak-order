import { NextResponse } from 'next/server';
import { getDashboardUser } from '@/lib/auth';
import { loadStatement, statementCsv } from '@/lib/statement';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const user = await getDashboardUser();
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const url = new URL(req.url);
  const month = url.searchParams.get('month') ?? '';
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'month=YYYY-MM required' }, { status: 400 });
  const st = await loadStatement(month);
  return new NextResponse('\ufeff' + statementCsv(st), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="paradise-peak-statement-${month}.csv"`,
    },
  });
}
