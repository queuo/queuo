interface WaitlistConfirmationProps {
  email: string;
  partySize: number;
  estimatedWait: number;
  position: number;
}

export function waitlistConfirmationHtml({
  email,
  partySize,
  estimatedWait,
  position,
}: WaitlistConfirmationProps): string {
  const waitText =
    estimatedWait <= 5
      ? "less than 5 minutes"
      : `approximately ${estimatedWait} minutes`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You're on the waitlist</title>
</head>
<body style="margin:0;padding:0;background-color:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#fafafa;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;background-color:#ffffff;border-radius:16px;border:1px solid #e4e4e7;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background-color:#000000;padding:28px 40px;">
              <p style="margin:0;font-size:22px;font-weight:700;letter-spacing:-0.5px;color:#ffffff;">Queuo</p>
              <p style="margin:4px 0 0;font-size:12px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:#a1a1aa;">Smart Guest Reception</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 28px;">
              <p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#71717a;">Waitlist Confirmed</p>
              <h1 style="margin:0 0 20px;font-size:30px;font-weight:700;letter-spacing:-0.5px;color:#09090b;line-height:1.2;">
                You're on<br/>the list.
              </h1>
              <p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:#52525b;">
                Hi there — we've saved your spot for a party of <strong style="color:#09090b;">${partySize}</strong>. We'll send you another email the moment your table is ready.
              </p>

              <!-- Wait time card -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f4f4f5;border-radius:12px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#71717a;">Estimated Wait</p>
                    <p style="margin:0;font-size:28px;font-weight:700;letter-spacing:-0.5px;color:#09090b;">${waitText}</p>
                  </td>
                  <td style="padding:20px 24px;text-align:right;vertical-align:middle;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#71717a;">Queue Position</p>
                    <p style="margin:0;font-size:28px;font-weight:700;letter-spacing:-0.5px;color:#09090b;">#${position}</p>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #e4e4e7;margin:0 0 28px;" />

              <p style="margin:0 0 8px;font-size:14px;color:#71717a;">
                <strong style="color:#09090b;">Party size:</strong> ${partySize} ${partySize === 1 ? "guest" : "guests"}
              </p>
              <p style="margin:0 0 28px;font-size:14px;color:#71717a;">
                <strong style="color:#09090b;">Notification email:</strong> ${email}
              </p>

              <p style="margin:0;font-size:14px;line-height:1.6;color:#71717a;">
                No need to stay at the kiosk — feel free to wait nearby and we'll reach out as soon as a table opens up for you.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f4f4f5;padding:20px 40px;border-top:1px solid #e4e4e7;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.5;">
                This is an automated message from Queuo. If you didn't join a waitlist, please disregard this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
