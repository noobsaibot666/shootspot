import type { NextRequest } from 'next/server';
import { proxy } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export const GET = (req: NextRequest) => proxy(req);
export const POST = (req: NextRequest) => proxy(req);
