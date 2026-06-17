import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const sp = await searchParams
  const hasError = sp.error === 'true'

  // Server action that authenticates the user
  const signIn = async (formData: FormData) => {
    'use server'
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
            } catch {}
          },
        },
      }
    )

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return redirect('/login?error=true')
    }

    // Redirect to dashboard on success
    return redirect('/')
  }

  return (
    <main className="min-h-screen bg-[#0b0e14] flex flex-col items-center justify-center p-4 antialiased font-sans text-slate-200">
      <div className="w-full max-w-md bg-[#161a23] border border-[#272b38] rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-8 border-b border-[#272b38] bg-[#0b0e14] flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full border border-teal-500/50 flex items-center justify-center bg-teal-500/10 shadow-[0_0_15px_rgba(20,184,166,0.15)] mb-4">
            <svg className="w-7 h-7 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12h4l3-9 5 18 3-9h6" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-white tracking-widest uppercase">
            Finance <span className="text-amber-400">PULSE</span>
          </h1>
          <p className="text-[10px] text-[#8a93a6] tracking-[0.2em] mt-2 uppercase font-bold">Encrypted Access</p>
        </div>

        {/* Login Form */}
        <div className="p-8 space-y-6">
          {hasError && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-3 rounded-lg text-xs font-bold text-center tracking-wider uppercase">
              Invalid credentials. Try again.
            </div>
          )}

          <form action={signIn} className="space-y-5">
            <div>
              <label className="text-[10px] text-[#8a93a6] block mb-2 uppercase tracking-widest font-bold">Admin Email</label>
              <input 
                name="email" 
                type="email" 
                required 
                className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-teal-500/50 transition-colors" 
                placeholder="commander@finapulse.com" 
              />
            </div>
            <div>
              <label className="text-[10px] text-[#8a93a6] block mb-2 uppercase tracking-widest font-bold">Passphrase</label>
              <input 
                name="password" 
                type="password" 
                required 
                className="w-full bg-[#0b0e14] border border-[#272b38] rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-teal-500/50 transition-colors" 
                placeholder="••••••••••••" 
              />
            </div>
            <button 
              type="submit" 
              className="w-full bg-teal-500/10 text-teal-400 border border-teal-500/30 hover:bg-teal-500/20 font-bold py-3.5 rounded-lg transition-colors text-xs uppercase tracking-[0.15em] mt-4 shadow-[0_0_15px_rgba(20,184,166,0.1)]"
            >
              Initiate Uplink
            </button>
          </form>
        </div>
        
      </div>
    </main>
  )
}