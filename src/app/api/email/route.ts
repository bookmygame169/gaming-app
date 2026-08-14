import { NextRequest, NextResponse } from 'next/server';
import {
  sendLoginAlert,
  sendBookingConfirmation,
  sendBookingCancellation,
  sendWelcomeEmail,
  LoginAlertParams,
  BookingConfirmationParams,
  BookingCancellationParams,
  WelcomeEmailParams,
} from '@/lib/email';
import { requireInternalApiSecret } from '@/lib/internalApiAuth';
import { emailRateLimiter, enforceRateLimit } from '@/lib/ratelimit';

type EmailType = 'login_alert' | 'booking_confirmation' | 'booking_cancellation' | 'welcome';

interface EmailRequestBody {
  type: EmailType;
  data: LoginAlertParams | BookingConfirmationParams | BookingCancellationParams | WelcomeEmailParams;
}

export async function POST(request: NextRequest) {
  const authResponse = requireInternalApiSecret(request);
  if (authResponse) return authResponse;

  const rateLimitResponse = await enforceRateLimit(request, emailRateLimiter, 10, 10 * 60 * 1000);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body: EmailRequestBody = await request.json();
    const { type, data } = body;

    if (!type || !data) {
      return NextResponse.json(
        { error: 'Missing required fields: type and data' },
        { status: 400 }
      );
    }

    if (!data.email) {
      return NextResponse.json(
        { error: 'Missing email address' },
        { status: 400 }
      );
    }

    let result;

    switch (type) {
      case 'login_alert':
        result = await sendLoginAlert(data as LoginAlertParams);
        break;

      case 'booking_confirmation':
        result = await sendBookingConfirmation(data as BookingConfirmationParams);
        break;

      case 'booking_cancellation':
        result = await sendBookingCancellation(data as BookingCancellationParams);
        break;

      case 'welcome':
        result = await sendWelcomeEmail(data as WelcomeEmailParams);
        break;

      default:
        return NextResponse.json(
          { error: `Invalid email type: ${type}` },
          { status: 400 }
        );
    }

    if (result.success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: result.error || 'Failed to send email' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Email API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
