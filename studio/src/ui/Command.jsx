/** A command to run in the terminal, with a button that copies it and says so. */
import { useEffect, useState } from 'react';
import { Button } from './controls.jsx';

const CONFIRM_MS = 1500;

export function Command({ text }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  return (
    <span className="cmd">
      <code>{text}</code>
      <Button size="s" icon={copied ? 'check' : 'copy'} onClick={copy} data-copied={copied || undefined} aria-label={`Copy ${text}`}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </span>
  );
}
