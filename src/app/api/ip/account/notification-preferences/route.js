import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { listNotificationPreferences, saveNotificationPreferences } from '@/lib/ipNotificationPreferences';

export async function GET() {
  const { session, error } = await requireSession(['candidate']);
  if (error) return error;
  const items = await listNotificationPreferences(session.user.id);
  return jsonOk({
    items,
    smsDelivery: false,
    smsNote:
      'SMS / WhatsApp choices are stored. We cannot send SMS until a carrier is connected. In-app and email follow your saved settings now.',
  });
}

export async function PUT(request) {
  const { session, error } = await requireSession(['candidate']);
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const items = await saveNotificationPreferences(session.user.id, body.items);
  return jsonOk({
    ok: true,
    items,
    smsDelivery: false,
    smsNote:
      'SMS / WhatsApp choices are stored. We cannot send SMS until a carrier is connected. In-app and email follow your saved settings now.',
  });
}
