type CommandPaletteProps = {
  actions?: string[];
};

export function CommandPalette({ actions = ['Create card', 'Move card', 'Ask AI', 'Open board chat'] }: CommandPaletteProps) {
  return (
    <div
      style={{
        width: 'min(420px, 100%)',
        border: '1px solid var(--border)',
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '18px',
        padding: '10px 14px',
      }}
    >
      <div style={{ color: 'var(--muted)', fontSize: '12px', marginBottom: '10px' }}>Cmd/Ctrl + K</div>
      <div style={{ display: 'grid', gap: '8px' }}>
        {actions.map((action) => (
          <div
            key={action}
            style={{
              padding: '10px 12px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.04)',
            }}
          >
            {action}
          </div>
        ))}
      </div>
    </div>
  );
}
