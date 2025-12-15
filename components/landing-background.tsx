"use client"

export function LandingBackground() {
  return (
    <div className="absolute inset-0 z-0 bg-[#09090B] overflow-hidden">
      {/* Abstract geometric shapes */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/5 blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/5 blur-[120px]" />
      
      {/* Dot Pattern */}
      <div 
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #3f3f46 1px, transparent 0)',
          backgroundSize: '24px 24px'
        }}
      />
      
      {/* Gradient Overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#09090B]/50 to-[#09090B]" />
    </div>
  )
}
