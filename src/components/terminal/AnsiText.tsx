import React from 'react';

const ANSI_COLORS: Record<string, string> = {
  '30': 'text-black',
  '31': 'text-red-500',
  '32': 'text-emerald-500',
  '33': 'text-yellow-500',
  '34': 'text-blue-500',
  '35': 'text-purple-500',
  '36': 'text-cyan-500',
  '37': 'text-white',
  '90': 'text-zinc-500',
  '1': 'font-bold',
};

export function AnsiText({ text }: { text: string }) {
  if (!text) return null;

  // Simple parser for ANSI escape codes (CSI)
  const parts = text.split(/\x1b\[/);
  if (parts.length === 1) return <span>{text}</span>;

  return (
    <>
      {parts.map((part, i) => {
        if (i === 0) return <span key={i}>{part}</span>;

        const match = part.match(/^([0-9;]+)m(.*)/s);
        if (!match) return <span key={i}>{"\x1b[" + part}</span>;

        const codes = match[1].split(';');
        const content = match[2];
        
        let classes = '';
        codes.forEach(code => {
          if (ANSI_COLORS[code]) {
            classes += ANSI_COLORS[code] + ' ';
          }
        });

        return (
          <span key={i} className={classes.trim()}>
            {content}
          </span>
        );
      })}
    </>
  );
}
