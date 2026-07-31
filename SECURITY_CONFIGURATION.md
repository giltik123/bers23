# Security Configuration

This document describes the server-side trusted asset host policy used by the
Reve image-editing function. The policy controls which remote hosts the server
may contact when it receives an `image_url`.

> These variables are server deployment configuration. Do not expose provider
> secrets or copy server-only configuration into client-side `VITE_*` variables.

## Trusted Asset Hosts

The allowlist is **explicit and fail-closed**. No storage provider is trusted by
default. Every permitted hostname must be configured in the environment where
the Base44 server function runs.

Only exact hostnames are accepted. Do not include URL schemes, paths, query
strings, credentials, or wildcard patterns.

| Variable | Purpose | Example value |
| --- | --- | --- |
| `BASE44_ASSET_HOST` | Exact hostname used by Base44 Storage | `assets.example-base44-host.com` |
| `R2_ASSET_HOST` | Exact public hostname for a Cloudflare R2 bucket or its custom domain | `assets-dev.example.com` |
| `S3_ASSET_HOST` | Exact public hostname for an Amazon S3 bucket | `example-prod-assets.s3.us-east-1.amazonaws.com` |
| `TRUSTED_ASSET_HOSTS` | Comma-separated exact hostnames for additional approved sources | `storage.googleapis.com,images.example.com` |

Example syntax:

```dotenv
BASE44_ASSET_HOST=assets.example-base44-host.com
R2_ASSET_HOST=assets.example.com
S3_ASSET_HOST=example-assets.s3.us-east-1.amazonaws.com
TRUSTED_ASSET_HOSTS=storage.googleapis.com,images.example.com
```

Empty variables may be omitted. Values are trimmed and compared
case-insensitively. Duplicate hostnames are harmless.

### Invalid values

Do not configure values such as:

```dotenv
# Schemes and paths are not part of a hostname.
BASE44_ASSET_HOST=https://assets.example.com/project/

# Wildcards are not supported and will not trust subdomains.
R2_ASSET_HOST=*.r2.dev

# This trusts the attacker-controlled hostname, not Google Storage.
TRUSTED_ASSET_HOSTS=storage.googleapis.com.attacker.example
```

The code uses exact hostname equality. Configuring `storage.googleapis.com`
does not trust `bucket.storage.googleapis.com`, and configuring
`assets.example.com` does not trust `cdn.assets.example.com`. Add every hostname
that the application actually produces as a separate entry.

## Environment examples

The hostnames below are illustrative placeholders. Replace them with the exact
hostnames observed in each deployment. Do not copy a production allowlist into
Development or Staging unless those environments intentionally share storage.

### Development

Use a development-only bucket or storage hostname. Local HTTP asset servers are
not supported because remote image URLs must use HTTPS.

```dotenv
BASE44_ASSET_HOST=dev-assets.example-base44-host.com
R2_ASSET_HOST=berserk-dev-assets.example.com
S3_ASSET_HOST=
TRUSTED_ASSET_HOSTS=storage.googleapis.com
```

If Development uses only one source, configure only that source:

```dotenv
TRUSTED_ASSET_HOSTS=dev-images.example.com
```

### Staging

Staging should use isolated storage so that tests cannot read arbitrary
Production assets through the server function.

```dotenv
BASE44_ASSET_HOST=staging-assets.example-base44-host.com
R2_ASSET_HOST=berserk-staging-assets.example.com
S3_ASSET_HOST=berserk-staging-assets.s3.eu-central-1.amazonaws.com
TRUSTED_ASSET_HOSTS=staging-images.example.com
```

### Production

Production should contain only hostnames required by active storage paths.
Avoid keeping retired migration or test hosts in the allowlist.

```dotenv
BASE44_ASSET_HOST=prod-assets.example-base44-host.com
R2_ASSET_HOST=assets.example.com
S3_ASSET_HOST=berserk-prod-assets.s3.us-east-1.amazonaws.com
TRUSTED_ASSET_HOSTS=storage.googleapis.com,images.example.com
```

After changing Production configuration, verify at least one valid asset URL
from every configured provider and verify that an unlisted hostname is rejected.

## Behavior when configuration is missing

If all four variables are absent or empty, the allowlist is empty. The Reve
function rejects the image before making any outbound request. The client
receives HTTP `422` with the stable error code `invalid_image`.

This is intentional fail-closed behavior. It prevents a deployment mistake from
silently turning the server into an unrestricted URL fetcher. It also means a
new environment will not process remote Reve images until at least one trusted
hostname is configured.

An individual empty variable does not cause an error when another variable
provides at least one trusted hostname.

## Adding a new trusted source

1. Identify the **final hostname** in the generated image URL. Use the hostname,
   not the provider name, bucket label, full URL, or upload endpoint.
2. Confirm the source serves the required image over HTTPS. Redirects are
   rejected, so the configured URL must point directly to the final asset.
3. Confirm the source returns a supported MIME type: `image/jpeg`, `image/png`,
   or `image/webp`. SVG, AVIF, HEIC/HEIF, BMP, GIF, TIFF, and ZIP are rejected.
4. Add the hostname to its dedicated variable, or append it to
   `TRUSTED_ASSET_HOSTS` using a comma separator.
5. Apply the change only to the intended environment and redeploy/restart the
   server function according to the normal Base44 deployment workflow.
6. Test a known valid asset from the new hostname.
7. Test a hostname that merely contains the trusted name, such as
   `trusted.example.attacker.test`, and confirm that it is rejected.
8. Record the owner and reason for the new source in the deployment change so
   the hostname can be removed when it is no longer needed.

Example of adding a CDN without changing existing providers:

```dotenv
# Before
TRUSTED_ASSET_HOSTS=storage.googleapis.com

# After
TRUSTED_ASSET_HOSTS=storage.googleapis.com,images.example.com
```

No application code or database migration is required for an allowlist update.
Do not broaden the policy with a parent domain or wildcard to avoid listing an
exact hostname.

## Additional enforced checks

Host allowlisting is only the first boundary. The Reve function also enforces:

- HTTPS URLs without embedded credentials;
- no redirects;
- a 15-second download timeout;
- a 25 MiB encoded/download limit, including streamed bytes;
- JPEG, PNG, or WebP MIME and encoded-header validation;
- maximum dimensions of 8192 pixels per side;
- a maximum of 40 million pixels;
- a maximum estimated decoded footprint of 160 MiB.

These checks are implemented before the image is sent to the AI provider. They
do not replace antivirus scanning or a sandboxed decoder; those controls remain
separate security backlog items.
