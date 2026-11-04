import { NextResponse } from 'next/server';
import { endSession } from '@/app/actions/auth';

export async function POST() {
  try {
    await endSession();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
