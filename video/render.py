# Renders the promo frame by frame: python3 video/render.py [fps] [width] [height] [out_dir]
import subprocess, sys, time, os
from playwright.sync_api import sync_playwright
fps = int(sys.argv[1]) if len(sys.argv) > 1 else 24
w = int(sys.argv[2]) if len(sys.argv) > 2 else 1280
h = int(sys.argv[3]) if len(sys.argv) > 3 else 720
out = sys.argv[4] if len(sys.argv) > 4 else '/tmp/claude-0/promo_frames'
only = [float(x) for x in sys.argv[5].split(',')] if len(sys.argv) > 5 else None      # optional: list of times for a still test
os.makedirs(out, exist_ok=True)
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen(['python3', '-m', 'http.server', '8777', '-d', root], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = b.new_page(viewport={'width': w, 'height': h}); pg.set_default_timeout(600000)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:8777/video/promo.html' + ('?nofx' if os.environ.get('NOFX') else '')); pg.wait_for_function("document.title==='ready'")
        dur = pg.evaluate('window.DUR')
        times = only if only else [i / fps for i in range(int(dur * fps) + 1)]
        t0 = time.time()
        part, nparts = (int(x) for x in os.environ.get('PART', '0/1').split('/'))
        for i, t in enumerate(times):
            if i % nparts != part: continue
            fn = f'{out}/f{i:05d}.png' if not only else f'{out}/still_{t:05.1f}.png'
            if os.path.exists(fn) and not only: continue
            pg.evaluate(f'window.renderAt({t})')
            pg.screenshot(path=fn)
            if i % 24 == 0: print(f'{i}/{len(times)}  t={t:.2f}  {time.time()-t0:.0f}s', flush=True)
        print('errors', errs[:3])
        b.close()
finally:
    srv.kill()
