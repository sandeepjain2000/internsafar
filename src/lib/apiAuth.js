import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';

export async function requireSession(roles) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      error: NextResponse.json(
        { error: 'Unauthorized — your session expired or you are not signed in. Sign in again.' },
        { status: 401 },
      ),
    };
  }
  if (roles?.length && !roles.includes(session.user.role)) {
    const needed = roles.join(' or ');
    const actual = session.user.role || 'unknown';
    return {
      error: NextResponse.json(
        {
          error: `Forbidden — this API requires ${needed}, but your session role is “${actual}”. Sign out, then sign in as SuperAdmin (support@placementhub.online), and retry.`,
          code: 'ROLE_MISMATCH',
          requiredRoles: roles,
          sessionRole: actual,
        },
        { status: 403 },
      ),
    };
  }
  return { session };
}

export function jsonOk(data, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(message, status = 400) {
  if (Number(status) >= 500) {
    import('@/lib/ipOpsAlert')
      .then(({ reportOpsFailureBackground }) => {
        reportOpsFailureBackground({
          kind: 'UNEXPECTED_API',
          message: String(message || 'Server error'),
          statusCode: Number(status),
          route: 'apiAuth.jsonError',
        });
      })
      .catch(() => {});
  }
  return NextResponse.json({ error: message }, { status });
}
