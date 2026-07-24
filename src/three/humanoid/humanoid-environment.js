/**
 * Concrete-room environment for the humanoid, extracted from
 * HumanoidStage so the Phase 5 reveal can mount the same room inside
 * BrainStage's scene. Target: docs/reference/humanoid-target-*.png --
 * warm-gray concrete panels, off-left doorway with bright daylight,
 * beige carpet, one warm back-left key, soft fill.
 *
 * All positions assume the figure stands at the origin with feet at y=0;
 * callers scale/position the returned group for their own world scale.
 *
 * @param {Object} opts
 * @param {boolean} [opts.fadeable=false] -- make every material
 *   transparent so setIntensity(t) can fade the room up from black
 *   (the reveal's "environment lights up as the camera retreats").
 * @returns {{ group, lights: {hemi, key, fill}, setIntensity(t): void, dispose(): void }}
 */
import * as THREE from 'three';

/** Subtle per-pixel noise so the flat panels read as concrete, not CSS. */
function noiseTexture({ base, spread = 10, seams = 0, w = 256, h = 256 }) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const c = new THREE.Color(base);
    ctx.fillStyle = `rgb(${c.r * 255}, ${c.g * 255}, ${c.b * 255})`;
    ctx.fillRect(0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
        const n = (Math.random() - 0.5) * spread;
        img.data[i] += n;
        img.data[i + 1] += n;
        img.data[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    if (seams > 0) {
        ctx.strokeStyle = 'rgba(0,0,0,0.10)';
        ctx.lineWidth = 2;
        for (let s = 1; s <= seams; s++) {
            const x = (w / (seams + 1)) * s;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

export function buildConcreteRoom({ fadeable = false } = {}) {
    const group = new THREE.Group();
    const materials = [];

    const track = (mat) => {
        if (fadeable) {
            mat.transparent = true;
            mat.opacity = 0;
        }
        materials.push(mat);
        return mat;
    };

    const concrete = (base, seams, repeat = 1) => {
        const map = noiseTexture({ base, spread: 9, seams });
        map.repeat.set(repeat, 1);
        return track(new THREE.MeshStandardMaterial({ map, roughness: 0.94 }));
    };

    // Beige carpet floor (heavier noise = pile).
    const floorMat = track(new THREE.MeshStandardMaterial({
        map: noiseTexture({ base: 0xa89d8c, spread: 15, w: 512, h: 512 }),
        roughness: 1,
    }));
    floorMat.map.repeat.set(6, 6);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);

    // Back wall split by a doorway gap; the gap holds the bright
    // "daylight" panel the key light pretends to come from.
    const wallH = 6;
    const backL = new THREE.Mesh(new THREE.BoxGeometry(5.0, wallH, 0.3), concrete(0xa8a298, 3));
    backL.position.set(-4.2, wallH / 2, -3.2);
    const backR = new THREE.Mesh(new THREE.BoxGeometry(8.0, wallH, 0.3), concrete(0xaea89e, 4));
    backR.position.set(3.3, wallH / 2, -3.6);
    const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, wallH),
        track(new THREE.MeshBasicMaterial({ color: 0xf7f1e4, fog: false })),
    );
    glow.position.set(-1.15, wallH / 2, -5.5);
    // Side walls, further out so wide framings still see room edges.
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.3, wallH, 14), concrete(0xa29c92, 5));
    sideL.position.set(-5.5, wallH / 2, 2);
    const sideR = new THREE.Mesh(new THREE.BoxGeometry(0.3, wallH, 14), concrete(0xb1aba1, 5));
    sideR.position.set(5.8, wallH / 2, 2);
    group.add(backL, backR, glow, sideL, sideR);

    // Soft contact-shadow disc under the feet (cheap, in addition to
    // any real shadow, matches the screenshots' diffuse grounding).
    const discCanvas = document.createElement('canvas');
    discCanvas.width = discCanvas.height = 128;
    const dctx = discCanvas.getContext('2d');
    const grad = dctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0, 'rgba(40,34,26,0.42)');
    grad.addColorStop(1, 'rgba(40,34,26,0)');
    dctx.fillStyle = grad;
    dctx.fillRect(0, 0, 128, 128);
    const disc = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 0.9),
        track(new THREE.MeshBasicMaterial({
            map: new THREE.CanvasTexture(discCanvas),
            transparent: true,
            depthWrite: false,
        })),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.01;
    group.add(disc);

    // One large warm key from the back-left (per the screenshots),
    // hemisphere bounce fill, no colored lights, no hard shadows.
    const hemi = new THREE.HemisphereLight(0xe9e3d7, 0x8f8577, 0.85);
    const key = new THREE.DirectionalLight(0xfff1dd, 1.6);
    key.position.set(-4.5, 5.5, -4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -3;
    key.shadow.camera.right = 3;
    key.shadow.camera.top = 4;
    key.shadow.camera.bottom = -1;
    key.shadow.radius = 6;
    key.shadow.bias = -0.0004;
    const fill = new THREE.DirectionalLight(0xdfd9cf, 0.35);
    fill.position.set(3, 2.5, 4);
    group.add(hemi, key, fill);

    const base = { hemi: hemi.intensity, key: key.intensity, fill: fill.intensity };

    return {
        group,
        disc,
        lights: { hemi, key, fill },
        /** 0 = invisible/black, 1 = full room. Only meaningful when fadeable. */
        setIntensity(t) {
            hemi.intensity = base.hemi * t;
            key.intensity = base.key * t;
            fill.intensity = base.fill * t;
            if (fadeable) {
                group.visible = t > 0.001;
                for (const m of materials) m.opacity = t;
            }
        },
        dispose() {
            group.traverse((node) => {
                if (node.isMesh) {
                    node.geometry.dispose();
                    node.material.map?.dispose();
                    node.material.dispose();
                }
            });
            if (group.parent) group.parent.remove(group);
        },
    };
}
