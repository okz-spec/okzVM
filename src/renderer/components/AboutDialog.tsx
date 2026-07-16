import React from 'react';

interface AboutDialogProps {
  onClose: () => void;
}

const AboutDialog: React.FC<AboutDialogProps> = ({ onClose }) => {
  const openGitHub = () => {
    const api = (window as any).electronAPI;
    if (api?.shellOpenExternal) {
      api.shellOpenExternal('https://github.com/okz-spec/okzVM');
    }
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="window-body" onClick={e => e.stopPropagation()}
        style={{ width: 340, padding: 0, background: '#c0c0c0', border: '2px outset #c0c0c0' }}>
        <div className="title-bar">
          <div className="title-bar-text">About okzVM</div>
          <div className="title-bar-controls">
            <button aria-label="Close" onClick={onClose} />
          </div>
        </div>
        <div style={{ padding: '16px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 4, color: '#000080' }}>okzVM</div>
          <div style={{ fontSize: 11, color: '#555', marginBottom: 12 }}>Lightweight stack-based virtual machine</div>
          <div style={{ fontSize: 11, color: '#000', marginBottom: 4 }}>Lua-inspired scripting language</div>
          <div style={{ fontSize: 11, color: '#000', marginBottom: 4 }}>Pixel graphics, software 3D rasterizer, audio</div>
          <div style={{ fontSize: 11, color: '#000', marginBottom: 16 }}>File I/O, multitasking, native API</div>
          <div style={{ marginBottom: 12 }}>
            <button onClick={openGitHub}
              style={{ padding: '4px 16px', fontSize: 11, cursor: 'pointer' }}>
              GitHub
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutDialog;