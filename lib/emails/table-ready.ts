interface TableReadyProps {
  email: string;
  partySize: number;
  tableName: string;
}

export function tableReadyHtml({ email, partySize, tableName }: TableReadyProps): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your table is ready</title>
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

          <!-- Hero -->
          <tr>
            <td style="background-color:#09090b;padding:36px 40px 32px;">
              <p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#71717a;">Table Ready</p>
              <h1 style="margin:0;font-size:38px;font-weight:700;letter-spacing:-1px;color:#ffffff;line-height:1.15;">
                Your table<br/>is ready.
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px 28px;">
              <p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:#52525b;">
                Great news — a table for <strong style="color:#09090b;">${partySize} ${partySize === 1 ? "guest" : "guests"}</strong> is now available. Head back to the restaurant and check in at the kiosk.
              </p>

              <!-- Table name card -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f4f4f5;border-radius:12px;margin-bottom:28px;">
                <tr>
                  <td style="padding:22px 28px;">
                    <p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#71717a;">Your Table</p>
                    <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:-0.5px;color:#09090b;">${tableName}</p>
                  </td>
                  <td style="padding:22px 28px;text-align:right;vertical-align:middle;">
                    <!-- Checkmark icon -->
                    <div style="display:inline-block;width:44px;height:44px;background-color:#000000;border-radius:50%;text-align:center;line-height:44px;">
                      <span style="color:#ffffff;font-size:20px;font-weight:700;">&#10003;</span>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #e4e4e7;margin:0 0 24px;" />

              <p style="margin:0;font-size:13px;line-height:1.6;color:#a1a1aa;">
                Please return promptly — if you don't check in within a few minutes your table may be released to the next guest in line.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f4f4f5;padding:20px 40px;border-top:1px solid #e4e4e7;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.5;">
                This notification was sent to ${email} by Queuo on behalf of the restaurant.
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
