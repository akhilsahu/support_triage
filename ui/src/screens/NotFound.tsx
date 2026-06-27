import { useNavigate } from 'react-router-dom'

export function NotFound() {
  const navigate = useNavigate()

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
      padding: '24px',
      overflow: 'hidden',
      position: 'relative',
    }}>

      {/* Ambient blobs */}
      <div style={{
        position: 'absolute', width: 400, height: 400,
        borderRadius: '50%', top: '-100px', left: '-100px',
        background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', width: 300, height: 300,
        borderRadius: '50%', bottom: '-80px', right: '-80px',
        background: 'radial-gradient(circle, rgba(168,85,247,0.2) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', width: 200, height: 200,
        borderRadius: '50%', top: '40%', right: '15%',
        background: 'radial-gradient(circle, rgba(236,72,153,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Card */}
      <div style={{
        textAlign: 'center',
        maxWidth: 480,
        zIndex: 1,
      }}>
        {/* 404 number */}
        <div style={{
          fontSize: 'clamp(80px, 18vw, 140px)',
          fontWeight: 800,
          lineHeight: 1,
          background: 'linear-gradient(90deg, #818cf8, #c084fc, #f472b6)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: 8,
          letterSpacing: '-4px',
        }}>
          404
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: 'clamp(22px, 4vw, 30px)',
          fontWeight: 700,
          color: '#f1f5f9',
          margin: '0 0 12px',
        }}>
          Lost your way?
        </h1>

        {/* Sub text */}
        <p style={{
          fontSize: 15,
          color: '#94a3b8',
          lineHeight: 1.6,
          margin: '0 0 36px',
        }}>
          The page you're looking for doesn't exist or has been moved.<br />
          Let's get you back on track.
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              padding: '10px 22px',
              borderRadius: 10,
              border: '1px solid rgba(129,140,248,0.4)',
              background: 'rgba(129,140,248,0.1)',
              color: '#a5b4fc',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
              transition: 'all .2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(129,140,248,0.2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(129,140,248,0.1)')}
          >
            ← Go Back
          </button>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '10px 22px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
              transition: 'opacity .2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
