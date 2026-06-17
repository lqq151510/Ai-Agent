import React, { useState } from 'react';
import { Command, ArrowRight } from 'lucide-react';

export const LoginLayout = ({ onLoginSuccess }: { onLoginSuccess: () => void }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setLoading(true);
    // Mock authentication delay
    setTimeout(() => {
      setLoading(false);
      onLoginSuccess();
    }, 1200);
  };

  return (
    <div className="w-full h-full bg-[#f8f9fa] flex items-center justify-center font-sans relative">
      {/* Background decorations */}
      <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white to-transparent pointer-events-none"></div>
      
      <div className="w-[380px] bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#e5e5e5] p-8 z-10 relative">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-black text-white rounded-xl flex items-center justify-center mb-4 shadow-lg">
            <Command size={24} />
          </div>
          <h1 className="text-[22px] font-semibold text-[#111]">Welcome to AI-Agent</h1>
          <p className="text-[13px] text-[#666] mt-2 text-center">Sign in to your account to continue</p>
        </div>

        <div className="space-y-3 mb-6">
          <button 
            type="button"
            className="w-full flex items-center justify-center gap-2 bg-white border border-[#e5e5e5] hover:bg-[#f9f9f9] text-[#333] py-2.5 rounded-lg text-[14px] font-medium transition-colors cursor-pointer"
          >
            Continue with GitHub
          </button>
          
          <div className="relative flex items-center justify-center py-2">
            <div className="absolute border-t border-[#e5e5e5] w-full"></div>
            <span className="bg-white px-3 text-[12px] text-[#888] relative z-10">or sign in with email</span>
          </div>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="block text-[12px] font-medium text-[#555] mb-1.5">Email address</label>
            <input 
              type="email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-[#fafafa] border border-[#e5e5e5] rounded-lg px-3 py-2 text-[14px] outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
              placeholder="name@example.com"
              required
            />
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[12px] font-medium text-[#555]">Password</label>
              <span className="text-[12px] text-blue-600 hover:underline cursor-pointer">Forgot?</span>
            </div>
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-[#fafafa] border border-[#e5e5e5] rounded-lg px-3 py-2 text-[14px] outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
              placeholder="••••••••"
              required
            />
          </div>

          <button 
            type="submit" 
            disabled={loading || !email || !password}
            className="w-full bg-black text-white hover:bg-[#222] disabled:bg-[#ccc] disabled:cursor-not-allowed py-2.5 rounded-lg text-[14px] font-medium mt-2 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>Sign In <ArrowRight size={16} /></>
            )}
          </button>
        </form>
      </div>
      
      {/* Bottom text */}
      <div className="absolute bottom-8 text-[12px] text-[#888]">
        By continuing, you agree to our <span className="underline hover:text-[#555] cursor-pointer">Terms of Service</span> and <span className="underline hover:text-[#555] cursor-pointer">Privacy Policy</span>.
      </div>
    </div>
  );
};
