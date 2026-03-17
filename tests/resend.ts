// This file tests the connection to Resend using the provided environment variables
// Run this file with npm run test:resend to verify that the connection is working

import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY!)

async function main() {
  const to = process.env.RESEND_TEST_EMAIL
  if (!to) {
    console.error('Missing RESEND_TEST_EMAIL in .env — set it to your Resend account email')
    process.exit(1)
  }

  const { data, error } = await resend.emails.send({
    // from: 'queuo@ariqmuldi.com', in production
    from: 'onboarding@resend.dev',
    to,
    subject: 'Resend connection test',
    html: '<p>Resend connection is working!</p>',
  })

  if (error) {
    console.error('Resend connection failed:', error.message)
    process.exit(1)
  }

  console.log('Resend connection working — email sent:', data?.id)
}

main()
