import { fn } from 'monoserve';
import { object, string, optional } from 'valibot';
import { PETITION_WEBHOOK } from '$env/static/private';

const schema = object({
  name: string(),
  message: optional(string()),
});
export default fn(schema, async (params) => {
  const body: Record<string, unknown> = {
    content: `**${params.name}** signed the petition!`,
  };
  if (params.message) {
    body.embeds = [
      {
        description: params.message.slice(0, 4096),
        color: 0xa81c7c,
      },
    ];
  }
  const r = await fetch(PETITION_WEBHOOK, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(`Webhook returned ${r.status}`);
  }

  return 'ok';
});
