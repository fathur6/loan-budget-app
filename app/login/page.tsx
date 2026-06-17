'use client' // Tambahkan ini di paling atas

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr' // Tukar kepada browser client
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const router = useRouter()

  // Inisialisasi Supabase Client untuk Browser
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(true)
    } else {
      router.push('/')
      router.refresh() // Pastikan session dikemaskini
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0e14] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#161a23] border border-[#272b38] rounded-2xl shadow-2xl p-8">
        
        {/* Header anda (sama seperti asal) */}
        
        <form onSubmit={handleSignIn} className="space-y-5">
          {error && <div className="text-rose-400 text-xs text-center font-bold">Invalid credentials.</div>}
          
          <div>
            <label className="text-[10px] text-[#8a93a6] block mb-2 uppercase tracking-widest font-bold">Admin Email</label>
            <input 
              type="email" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-teal-500/50" 
            />
          </div>
          <div>
            <label className="text-[10px] text-[#8a93a6] block mb-2 uppercase tracking-widest font-bold">Passphrase</label>
            <input 
              type="password" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-teal-500/50" 
            />
          </div>
          <button 
            type="submit" 
            className="w-full bg-teal-500/10 text-teal-400 border border-teal-500/30 hover:bg-teal-500/20 font-bold py-3.5 rounded-lg transition-colors text-xs uppercase tracking-[0.15em] mt-4"
          >
            Initiate Uplink
          </button>
        </form>
      </div>
    </main>
  )
}