// Switch estilo iOS.
export default function Toggle({ checked, onChange, label, ariaLabel }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
      {label && <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--mu-text-muted)', fontFamily: 'var(--mu-font-ui)' }}>{label}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel || label}
        title={ariaLabel || label}
        onClick={() => onChange(!checked)}
        style={{
          position: 'relative',
          width: '51px',
          height: '31px',
          padding: 0,
          border: 'none',
          borderRadius: '999px',
          background: checked ? '#34C759' : '#E9E9EA',
          transition: 'background 0.25s ease',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '2px',
            left: checked ? '22px' : '2px',
            width: '27px',
            height: '27px',
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.16)',
            transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </button>
    </label>
  )
}
