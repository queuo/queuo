// This file tests the connection to Supabase using the provided environment variables.
// Run this file with npm run test:supabase to verify that the connection is working.

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!

const supabase = createClient(supabaseUrl, supabaseSecretKey)

async function main() {
  const { error } = await supabase.rpc('version')

  if (error && !error.message.includes('Could not find')) {
    console.error('Supabase connection failed:', error.message)
    process.exit(1)
  }

  console.log('Supabase connection working')
}

main()
