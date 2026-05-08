"use client";

interface RoomsLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export function RoomsLayout({ sidebar, children }: RoomsLayoutProps) {
  return (
    <div className="flex h-full overflow-hidden">
      {sidebar}
      <div className="flex flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
