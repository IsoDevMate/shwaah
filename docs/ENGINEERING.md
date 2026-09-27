# Shwaah engineering guide

## Product boundaries

Shwaah's backend already has working media upload, Instagram/TikTok publishing,
OAuth, token encryption, scheduling, and social tooling. New work must be
additive and preserve those paths.

## Service shape

- Express route handlers validate/authenticate and delegate.
- Services contain external API and analysis logic.
- Turso models own persistence.
- R2 stores media objects; Turso stores metadata and public URLs.
- Credit guards protect paid actions, not free diagnosis.

## Definition of done

1. Request and response shapes are explicit.
2. Database writes are persisted and user-scoped.
3. External failures return useful non-secret errors.
4. `npm run build` passes.
5. Relevant HTTP, DB, and R2 behavior is recorded as evidence.

## Security

- Never log decrypted OAuth tokens.
- Never trust a client-supplied Instagram media URL.
- Fetch selected media through the authenticated user's connected account.
- Validate media type and size before R2 upload.
- Never commit `.env` or credentials.
