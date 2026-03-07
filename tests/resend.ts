// This file tests the connection to Resend using the provided environment variables
// Run this file with npm run test:resend to verify that the connection is working

import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY!)

async function main() {
  const { error } = await resend.apiKeys.list()

  if (error) {
    console.error('Resend connection failed:', error.message)
    process.exit(1)
  }

  console.log('Resend connection working')
}

main()
