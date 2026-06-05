"use client";

import React from "react";

interface PhoneFrameProps {
  title?: string;
  subline?: string;
  time?: string;
  children: React.ReactNode;
}

/**
 * Killio Vault — reusable Android-ish phone mockup frame.
 *
 * Renders the outer rounded bezel, top notch, status bar (time + signal +
 * battery SVGs) and a header strip. The screen body is whatever `children`
 * passes in — each individual screen mockup lives under
 * `components/vault/mockups/`.
 */
export function PhoneFrame({
  title,
  subline,
  time = "9:41",
  children,
}: PhoneFrameProps) {
  return (
    <div className="phone-frame">
      <div className="phone-screen">
        <div className="phone-notch" aria-hidden="true" />
        <div className="phone-status">
          <span>{time}</span>
          <div className="phone-status-right">
            {/* Signal */}
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true">
              <rect x="0" y="7" width="2.5" height="3" rx="0.5" fill="currentColor" />
              <rect x="3.5" y="5" width="2.5" height="5" rx="0.5" fill="currentColor" />
              <rect x="7" y="3" width="2.5" height="7" rx="0.5" fill="currentColor" />
              <rect x="10.5" y="0.5" width="2.5" height="9.5" rx="0.5" fill="currentColor" opacity="0.4" />
            </svg>
            {/* Wifi */}
            <svg width="13" height="10" viewBox="0 0 13 10" fill="none" aria-hidden="true">
              <path d="M6.5 8.5a1 1 0 100-2 1 1 0 000 2z" fill="currentColor" />
              <path d="M3.2 5.4a4.7 4.7 0 016.6 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
              <path d="M1 3.2a7.8 7.8 0 0111 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
            </svg>
            {/* Battery */}
            <svg width="22" height="10" viewBox="0 0 22 10" fill="none" aria-hidden="true">
              <rect x="0.5" y="0.5" width="18" height="9" rx="2" stroke="currentColor" strokeWidth="0.8" fill="none" />
              <rect x="2" y="2" width="13" height="6" rx="1" fill="currentColor" />
              <rect x="19.5" y="3" width="1.5" height="4" rx="0.5" fill="currentColor" />
            </svg>
          </div>
        </div>
        <div className="phone-body">
          {title ? <div className="phone-header-title">{title}</div> : null}
          {subline ? <div className="phone-subline">{subline}</div> : null}
          {children}
        </div>
      </div>
    </div>
  );
}
