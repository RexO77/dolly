/** Dolly's mark: the crop frame and its lens, in the version for the page's theme. */
import { useEffect, useState } from 'react';

export function BrandMark() {
  const [theme, setTheme] = useState(() => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'));
  useEffect(() => {
    /* The theme is set on <html> by the theme control, so watch it there. */
    const read = () => {
      const t = document.documentElement.dataset.theme;
      setTheme(t === 'light' || (t === 'system' && matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark');
    };
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    read();
    return () => mo.disconnect();
  }, []);
  return <img className="brand-mark" src={`/icon-${theme}.svg`} alt="" width="20" height="20" />;
}
