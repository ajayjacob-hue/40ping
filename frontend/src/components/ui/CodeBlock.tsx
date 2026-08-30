'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
}

export default function CodeBlock({ code, language = 'cpp', filename }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="dev-panel overflow-hidden border border-zinc-800 bg-[#09090b]">
      {filename && (
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/90 border-b border-zinc-800 text-xs font-mono text-zinc-400">
          <span>{filename}</span>
          <button
            onClick={handleCopy}
            className="flex items-center space-x-1 hover:text-zinc-100 transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      )}
      <div className="p-4 overflow-x-auto font-mono text-xs text-zinc-300 leading-relaxed">
        <pre>{code}</pre>
      </div>
    </div>
  );
}
