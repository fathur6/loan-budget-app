'use client'

import { useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'

export default function AutoCarryForward({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const run = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.rpc('auto_carry_forward_balances')
      }
    }

    run()
  }, [])

  return <>{children}</>
}
