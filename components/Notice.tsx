"use client";

import { useEffect, useState } from "react";

export function Notice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("notice:closed")) return;
    setOpen(true);
  }, []);

  if (!open) return null;

  return (
    <div className="houston-notice">
      <p>
        This is a minimal AI chat web UI built with Vercel AI Chatbot,
        <br />
        styled with the HoustonAI interface from Astro.
        <br />
        <br />
        It is for personal, NON-COMMERCIAL purposes, and is NOT an OFFICIAL
        project of the Astro team.
      </p>
      <div className="houston-notice-links">
        <a
          href="https://github.com/withastro/houston.astro.build"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn More →
        </a>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            sessionStorage.setItem("notice:closed", "true");
            setOpen(false);
          }}
        >
          Close ✕
        </a>
      </div>
    </div>
  );
}
