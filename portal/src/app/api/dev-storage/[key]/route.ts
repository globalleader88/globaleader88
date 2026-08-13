import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/env';
import { requireOrganizationMembership } from '@/lib/authz';
import { getStorage } from '@/lib/storage';
import { assertKeyBelongsToOrg } from '@/lib/storage/keys';
import { toPublicError } from '@/lib/errors';

/**
 * LOCAL-DEV storage endpoint. Stands in for S3 presigned URLs when
 * STORAGE_DRIVER=local. It is authenticated and hard-scoped to the caller's
 * organization prefix, so it cannot read or write another tenant's objects.
 * Disabled entirely unless the local driver is active.
 */

function ensureLocal(): void {
  if (env.STORAGE_DRIVER !== 'local') {
    throw new Error('dev-storage is only available with STORAGE_DRIVER=local');
  }
}

export async function PUT(req: NextRequest, { params }: { params: { key: string } }) {
  try {
    ensureLocal();
    const ctx = await requireOrganizationMembership({ minRole: 'ANALYST' });
    const key = decodeURIComponent(params.key);
    assertKeyBelongsToOrg(key, ctx.organization.id);
    const body = Buffer.from(await req.arrayBuffer());
    if (body.length > env.MAX_UPLOAD_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large' }, { status: 413 });
    }
    await getStorage().putObject(
      key,
      body,
      req.headers.get('content-type') ?? 'application/octet-stream',
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const e = toPublicError(err);
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

export async function GET(_req: NextRequest, { params }: { params: { key: string } }) {
  try {
    ensureLocal();
    const ctx = await requireOrganizationMembership();
    const key = decodeURIComponent(params.key);
    assertKeyBelongsToOrg(key, ctx.organization.id);
    const body = await getStorage().getObject(key);
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  } catch (err) {
    const e = toPublicError(err);
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
