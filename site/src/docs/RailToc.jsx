import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useSpring } from 'motion/react';

/*
 * Mount: place the dot at the reader's position without an entrance.
 * Scroll: glide along the dotted path, including its subsection bends.
 * Select: hold the chosen stop until the reader scrolls again.
 * Reduced motion: place the dot immediately, without spring travel.
 */
const RAIL = {
  x: 5,
  indent: 12,
  labelGap: 14,
  offset: 120,
  nodeRadius: 3,
  cursorRadius: 4,
  clearance: 6,
  spring: { stiffness: 140, damping: 26, mass: 0.6 },
};

function buildPath(nodes) {
  const points = [{ x: nodes[0].x, y: 0 }, nodes[0]];
  for (let i = 1; i < nodes.length; i++) {
    const from = nodes[i - 1];
    const to = nodes[i];
    if (from.x !== to.x) {
      const bend = (to.y - from.y) * 0.3;
      points.push({ x: from.x, y: from.y + bend }, { x: to.x, y: to.y - bend });
    }
    points.push(to);
  }
  return points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
}

function lengthAtY(path, total, y) {
  let lo = 0;
  let hi = total;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (path.getPointAtLength(mid).y < y) lo = mid;
    else hi = mid;
  }
  return hi;
}

export function RailToc({ items }) {
  const reduceMotion = useReducedMotion();
  const id = `toc-${useId().replace(/[^\w-]/g, '')}`;
  const list = useRef(null);
  const rows = useRef([]);
  const path = useRef(null);
  const hole = useRef(null);
  const lengths = useRef([]);
  const total = useRef(0);
  const placed = useRef(false);
  const pinned = useRef(null);
  const [geometry, setGeometry] = useState(null);
  const [reached, setReached] = useState(1);
  const target = useMotionValue(0);
  const travel = useSpring(target, RAIL.spring);
  const distance = reduceMotion ? target : travel;
  const x = useMotionValue(RAIL.x);
  const y = useMotionValue(0);

  const pose = useCallback((value) => {
    if (!path.current || !total.current) return;
    const at = path.current.getPointAtLength(Math.max(0, Math.min(total.current, value)));
    x.set(at.x);
    y.set(at.y);
    hole.current?.setAttribute('cx', `${at.x}`);
    hole.current?.setAttribute('cy', `${at.y}`);
    setReached(lengths.current.filter((n) => n <= value + 0.5).length);
  }, [x, y]);

  useMotionValueEvent(distance, 'change', pose);

  const sync = useCallback(() => {
    const nodes = lengths.current;
    if (!nodes.length) return;
    let next;
    if (pinned.current !== null) {
      next = nodes[pinned.current];
    } else {
      const remaining = Math.max(0, document.documentElement.scrollHeight - innerHeight - scrollY);
      const line = Math.min(RAIL.offset, scrollY);
      const anchor = line + Math.max(0, innerHeight - line - remaining);
      const tops = items.map((item) => document.getElementById(item.id)?.getBoundingClientRect().top ?? Infinity);
      const index = tops.findLastIndex((top) => top <= anchor);
      if (index < 0) next = nodes[0];
      else if (index === nodes.length - 1) next = nodes[index];
      else {
        const span = tops[index + 1] - tops[index];
        const progress = span > 0 ? (anchor - tops[index]) / span : 0;
        next = nodes[index] + Math.min(1, Math.max(0, progress)) * (nodes[index + 1] - nodes[index]);
      }
    }
    target.set(next);
    if (!placed.current || reduceMotion) {
      placed.current = true;
      travel.jump(next);
      pose(next);
    }
  }, [items, target, travel, pose, reduceMotion]);

  useLayoutEffect(() => {
    const measure = () => {
      if (!list.current?.offsetWidth) {
        setGeometry(null);
        lengths.current = [];
        return;
      }
      const nodes = items.map((item, i) => ({
        x: RAIL.x + item.depth * RAIL.indent,
        y: rows.current[i].offsetTop + rows.current[i].offsetHeight / 2,
      }));
      setGeometry({ nodes, d: buildPath(nodes), width: Math.max(...nodes.map((n) => n.x)) + RAIL.clearance, height: list.current.offsetHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list.current);
    document.fonts.ready.then(measure);
    return () => observer.disconnect();
  }, [items]);

  useLayoutEffect(() => {
    if (!geometry || !path.current) return;
    total.current = path.current.getTotalLength();
    lengths.current = geometry.nodes.map((n) => lengthAtY(path.current, total.current, n.y));
    placed.current = false;
    sync();
  }, [geometry, sync]);

  useEffect(() => {
    let frame;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = null; sync(); });
    };
    const unpin = () => { pinned.current = null; };
    const onKey = (event) => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) unpin();
    };
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
    addEventListener('wheel', unpin, { passive: true });
    addEventListener('touchstart', unpin, { passive: true });
    addEventListener('pointerdown', unpin);
    addEventListener('keydown', onKey);
    addEventListener('popstate', unpin);
    const observer = new ResizeObserver(schedule);
    observer.observe(document.querySelector('.doc'));
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      removeEventListener('scroll', schedule);
      removeEventListener('resize', schedule);
      removeEventListener('wheel', unpin);
      removeEventListener('touchstart', unpin);
      removeEventListener('pointerdown', unpin);
      removeEventListener('keydown', onKey);
      removeEventListener('popstate', unpin);
    };
  }, [sync]);

  const select = (event, index) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const heading = document.getElementById(items[index].id);
    if (!heading) return;
    event.preventDefault();
    pinned.current = index;
    sync();
    const instant = reduceMotion || event.detail === 0;
    if (instant) { travel.jump(target.get()); pose(target.get()); }
    const hash = `#${items[index].id}`;
    if (location.hash !== hash) history.pushState(null, '', hash);
    window.scrollTo({ top: heading.getBoundingClientRect().top + scrollY - RAIL.offset, behavior: instant ? 'instant' : 'smooth' });
  };

  const active = Math.max(0, reached - 1);
  return (
    <>
      <p className="toc-title">On this page</p>
      <div className="toc-list">
        {geometry && <>
          <svg className="toc-path" width={geometry.width} height={geometry.height} aria-hidden="true">
            <defs>
              <mask id={`${id}-gaps`} maskUnits="userSpaceOnUse" x={-RAIL.clearance} y={0} width={geometry.width + RAIL.clearance * 2} height={geometry.height}>
                <rect x={-RAIL.clearance} width={geometry.width + RAIL.clearance * 2} height={geometry.height} fill="white" />
                {geometry.nodes.map((node, i) => <circle key={items[i].id} cx={node.x} cy={node.y} r={RAIL.clearance - 1} fill="black" />)}
                <circle ref={hole} r={RAIL.clearance} fill="black" />
              </mask>
              <mask id={`${id}-progress`} maskUnits="userSpaceOnUse" x={0} y={0} width={geometry.width} height={geometry.height}>
                <motion.rect width={geometry.width} height={y} fill="white" />
              </mask>
            </defs>
            <g mask={`url(#${id}-gaps)`}>
              <path ref={path} d={geometry.d} className="toc-path-rest" />
              <path d={geometry.d} className="toc-path-reached" mask={`url(#${id}-progress)`} />
            </g>
            {geometry.nodes.map((node, i) => <circle key={items[i].id} cx={node.x} cy={node.y} r={RAIL.nodeRadius} className={`toc-node${i < reached ? ' reached' : ''}`} />)}
          </svg>
          <motion.span className="toc-cursor" style={{ x, y, width: RAIL.cursorRadius * 2, height: RAIL.cursorRadius * 2 }} aria-hidden="true" />
        </>}
        <ul ref={list}>
          {items.map((item, i) => <li key={item.id} ref={(el) => { rows.current[i] = el; }} className={item.depth ? 'd3' : 'd2'}>
            <a href={`#${item.id}`} aria-current={i === active ? 'location' : undefined} onClick={(event) => select(event, i)} style={{ paddingInlineStart: RAIL.x + item.depth * RAIL.indent + RAIL.labelGap }}>{item.label}</a>
          </li>)}
        </ul>
      </div>
    </>
  );
}
