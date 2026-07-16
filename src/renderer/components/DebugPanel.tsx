import React from 'react';
import { VMDebugInfo } from '../../shared/types';

interface DebugPanelProps {
  info: VMDebugInfo;
}

const DebugPanel: React.FC<DebugPanelProps> = ({ info }) => {
  const stats = [
    { label: 'CPU Usage', value: info.cpuUsage.toFixed(1) + '%' },
    { label: 'RAM Usage', value: (() => {
      const ru = info.ramUsage;
      const rt = info.ramTotal;
      if (ru < 1024) return ru + ' B / ' + (rt / 1024 / 1024).toFixed(0) + ' MB';
      if (ru < 1024 * 1024) return (ru / 1024).toFixed(1) + ' KB / ' + (rt / 1024 / 1024).toFixed(0) + ' MB';
      return (ru / 1024 / 1024).toFixed(2) + ' MB / ' + (rt / 1024 / 1024).toFixed(0) + ' MB';
    })() },
    { label: 'Allocated Objects', value: info.allocatedObjects },
    { label: 'Instr/s', value: info.instructionsPerSecond },
    { label: 'FPS', value: info.fps },
    { label: 'Running Processes', value: info.processCount },
    { label: 'GPU calls/s', value: info.gpuCommandsPerSecond },
  ];

  return (
    <div className="debug-panel"
      style={{ display: 'flex', flexDirection: 'column', border: '2px solid #c0c0c0', background: '#fff', marginLeft: 4, width: 280 }}>
      <div className="title-bar" style={{ flexShrink: 0 }}>
        <div className="title-bar-text">Debug Info</div>
        <div className="title-bar-controls">
          <button aria-label="Close" />
        </div>
      </div>
      <div style={{ padding: '6px', overflowY: 'auto', flex: 1 }}>
        {stats.map(s => (
          <div className="stat" key={s.label}>
            <span className="label">{s.label}</span>
            <span className="value">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DebugPanel;