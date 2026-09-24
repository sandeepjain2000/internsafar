import { NextResponse } from 'next/server';
import { ensureIpBootstrap } from '@/lib/ensureIpBootstrap';
import { requireSession } from '@/lib/apiAuth';

/**
 * Controlled bootstrap only — never anonymous.
 * Auth: x-ip-bootstrap-secret / Bearer matching IP_BOOTSTRAP_SECRET,
 * or an existing SuperAdmin session.
 */
function bootstrapSecretOk(request) {
  const secret = String(process.env.IP_BOOTSTRAP_SECRET || '').trim();
  if (!secret) return false;
  const header = request.headers.get('x-ip-bootstrap-secret') || '';
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  return Boolean((header && header === secret) || (bearer && bearer === secret));
}

export async function POST(request) {
  try {
    if (!bootstrapSecretOk(request)) {
      const { error } = await requireSession(['superadmin']);
      if (error) {
        return NextResponse.json({ ok: false, error: 'Unauthorized bootstrap' }, { status: 401 });
      }
    }
    const result = await ensureIpBootstrap();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('[ip bootstrap]', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
