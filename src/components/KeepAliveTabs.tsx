import React from 'react';

type Tab = {
  key: string;
  render: () => React.ReactNode;
};

export default function KeepAliveTabs({
  activeKey,
  tabs,
}: {
  activeKey: string;
  tabs: Tab[];
}) {
  const rendered = React.useRef<Record<string, React.ReactNode>>({});

  // Keep a cached element for every tab that has been visited at least once
  tabs.forEach(t => {
    if (!rendered.current[t.key]) {
      rendered.current[t.key] = t.render();
    }
  });

  return (
    <div className="relative w-full h-full">
      {tabs.map(t => (
        <div
          key={t.key}
          className={t.key === activeKey ? 'block w-full h-full' : 'hidden'}
        >
          {rendered.current[t.key]}
        </div>
      ))}
    </div>
  );
}
