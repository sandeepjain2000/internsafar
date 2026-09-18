import { CheckCircle2, CircleAlert } from 'lucide-react';
import AuthShell from '@/components/ip/AuthShell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { recordUnsubscribeRequest } from '@/lib/ipEmailUnsubscribe';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Unsubscribe · InternSafar',
  description: 'Confirm an Internship Portal email unsubscribe request.',
};

export default async function UnsubscribePage({ searchParams }) {
  const params = await searchParams;
  const token = Array.isArray(params?.token) ? params.token[0] : params?.token;
  let result;
  try {
    result = await recordUnsubscribeRequest(token);
  } catch (err) {
    console.error('[unsubscribe page]', err.message);
    result = { ok: false, reason: 'unavailable' };
  }

  const received = Boolean(result.ok);
  const unavailable = result.reason === 'unavailable';

  return (
    <AuthShell subtitle="Email notifications">
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            {received ? (
              <CheckCircle2 className="size-5 text-emerald-600" aria-hidden />
            ) : (
              <CircleAlert className="size-5 text-destructive" aria-hidden />
            )}
            {received ? 'Request received' : unavailable ? 'Could not process request' : 'Link not valid'}
          </CardTitle>
          <CardDescription>
            {received
              ? 'Your unsubscribe request is on file. Emails are not turned off yet.'
              : unavailable
                ? 'This unsubscribe link could not be processed right now. Try again later.'
                : 'This unsubscribe link is invalid or has expired.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {received ? (
            <Alert>
              <AlertTitle>Pending</AlertTitle>
              <AlertDescription>
                We recorded this request with status PENDING. A later step will apply it to your
                notification settings.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertTitle>{unavailable ? 'Try again later' : 'Could not unsubscribe'}</AlertTitle>
              <AlertDescription>
                {unavailable
                  ? 'The request was not saved. Open the unsubscribe link again in a few minutes.'
                  : 'Use the unsubscribe link from a recent Internship Portal email. The address is not shown in the URL, so a missing or altered token cannot be completed.'}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
