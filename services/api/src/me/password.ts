import { z } from 'zod';
import { MIN_PASSWORD } from '../auth';
import { HttpError, type AppDeps, type Viewer } from '../http/context';

/** A password change without the current one needs a sign-in this recent (an email code). */
const FRESH_MINUTES = 15;

export const passwordSchema = z.object({
  newPassword: z.string().min(MIN_PASSWORD).max(128),
  currentPassword: z.string().max(128).optional(),
});

export async function hasPassword(deps: AppDeps, userId: string) {
  const ctx = await deps.auth.$context;
  return Boolean((await ctx.internalAdapter.findCredentialAccount(userId))?.password);
}

/**
 * Sets or changes the signed-in user's password. A first password needs only the session. A
 * change needs the current password, or a sign-in from the last 15 minutes (the "forgot password"
 * path: sign in with an email code, then set a new one). Other sessions are signed out on a change.
 */
export async function setPassword(
  deps: AppDeps,
  viewer: Viewer,
  body: z.infer<typeof passwordSchema>,
) {
  const ctx = await deps.auth.$context;
  const account = await ctx.internalAdapter.findCredentialAccount(viewer.userId);
  const hash = await ctx.password.hash(body.newPassword);
  if (account?.password) {
    const current = body.currentPassword
      ? await ctx.password.verify({ hash: account.password, password: body.currentPassword })
      : false;
    if (!current) {
      const { rows } = await deps.pool.query(
        `select 1 from auth_sessions where id = $1 and "createdAt" > now() - make_interval(mins => $2)`,
        [viewer.sessionId, FRESH_MINUTES],
      );
      if (!rows[0]) {
        throw new HttpError(
          403,
          body.currentPassword ? 'wrong_password' : 'recent_sign_in_required',
        );
      }
    }
    await ctx.internalAdapter.updatePassword(viewer.userId, hash);
    await deps.pool.query(`delete from auth_sessions where "userId" = $1 and id <> $2`, [
      viewer.userId,
      viewer.sessionId,
    ]);
  } else {
    await ctx.internalAdapter.linkAccount({
      userId: viewer.userId,
      providerId: 'credential',
      accountId: viewer.userId,
      password: hash,
    });
  }
  await deps.mailer
    ?.send({
      to: viewer.email,
      subject: account?.password ? 'Your ShootSpot password was changed' : 'ShootSpot password set',
      text:
        `The password for your ShootSpot account ${viewer.email} was ${account?.password ? 'changed' : 'set'}.\n\n` +
        `If this wasn't you, sign in with an email code and change it, or contact hello@expose-u.com.`,
    })
    .catch(() => {});
}
