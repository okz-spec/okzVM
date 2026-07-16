import React, { useRef, useEffect, useCallback } from 'react';

interface VMConsoleProps {
  lines: Array<{ text: string; type: string }>;
  height?: number;
}

const VMConsole: React.FC<VMConsoleProps> = ({ lines, height = 120 }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [lines]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const sel = window.getSelection();
    if (sel && sel.toString()) {
      navigator.clipboard.writeText(sel.toString());
    }
  }, []);

  return (
    <div className="console-panel" ref={ref} onContextMenu={handleContextMenu}
      style={{ height, display: 'flex', flexDirection: 'column', border: '2px solid #c0c0c0', background: '#fff', margin: 0 }}>
      <div className="title-bar" style={{ flexShrink: 0 }}>
        <div className="title-bar-text">Output Console</div>
        <div className="title-bar-controls">
          <button aria-label="Close" />
        </div>
      </div>
      <div style={{ padding: '3px 5px', overflowY: 'auto', flex: 1, fontFamily: 'Consolas, monospace', fontSize: 11 }}>
        {lines.map((line, i) => (
          <div key={i} className={'line ' + line.type}>{line.text}</div>
        ))}
      </div>
    </div>
  );
};

export default VMConsole;