import { useEffect, useState } from "react";

export function DesktopTitleBar() {
  const controls = window.tripPlanner?.windowControls;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!controls) return;
    void controls.isMaximized().then(setMaximized);
    return controls.onMaximizedChange(setMaximized);
  }, [controls]);

  if (!controls) return null;

  return (
    <header className="desktop-titlebar">
      <div className="desktop-titlebar__identity">
        <span className="desktop-titlebar__mark" aria-hidden="true">
          旅
        </span>
        <span>旅迹</span>
        <i>LOCAL</i>
      </div>
      <div className="desktop-titlebar__drag" />
      <div className="desktop-titlebar__controls">
        <button aria-label="最小化" title="最小化" onClick={() => void controls.minimize()}>
          <svg viewBox="0 0 12 12"><path d="M2 6.5h8"/></svg>
        </button>
        <button aria-label={maximized ? "还原" : "最大化"} title={maximized ? "还原" : "最大化"} onClick={() => void controls.toggleMaximize().then(setMaximized)}>
          {maximized ? <svg viewBox="0 0 12 12"><path d="M3.5 3.5V2h6.5v6.5H8.5M2 3.5h6.5V10H2z"/></svg> : <svg viewBox="0 0 12 12"><path d="M2 2h8v8H2z"/></svg>}
        </button>
        <button className="desktop-titlebar__close" aria-label="关闭" title="关闭" onClick={() => void controls.close()}>
          <svg viewBox="0 0 12 12"><path d="m2.5 2.5 7 7m0-7-7 7"/></svg>
        </button>
      </div>
    </header>
  );
}
