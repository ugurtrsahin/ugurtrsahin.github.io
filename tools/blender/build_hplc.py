"""
HPLC cihaz modeli üreticisi (Blender bpy, betikle tam yeniden üretilebilir).

Çıktı: glTF 2.0 (GLB) — assets/models/hplc-system.glb (tools/blender/build-model.sh
sıkıştırma adımıyla birlikte çalıştırır). Model jenerik bir modüler HPLC tasarımıdır;
herhangi bir üreticinin endüstriyel tasarımını veya markasını kopyalamaz.

Ölçek: metre, gerçek ölçü (modül 370 × 420 mm taban). Blender ekseni: X sağ, Y derinlik
(ön yüz −Y), Z yukarı. glTF dışa aktarımında Y yukarıya çevrilir.

Yükleyiciyle (assets/hplc-sim/scene-gltf.js) düğüm adlandırma sözleşmesi:
  Mod_<id>             modül kök boşluğu; özel özellik moduleId → glTF extras
  Screen_* / Label_*   canvas dokusu bağlanacak düzlemler (UV 0..1); px_w / px_h özellikleri
  LED_<ad>             kendine ait emisif malzeme
  Pivot_*              hareketli parçaların pivotu (kimlik dönüşümlü; yerel eksen = dünya ekseni)
  Column_In/Out        kolon dolgu yatağı uçları; col_r = iç yarıçap
  Det_Cell             akış hücresi ışın merkezi; beam_len
  Lamp_*               iç bölme aydınlatması için konum
  FlowPaths            paths = akış hatları (JSON, glTF koordinatı: metre, Y yukarı)

Kullanım (pip ile kurulan bpy modülü veya Blender'ın kendi Python'u):
  python build_hplc.py --out model.glb [--render önizleme.png] [--samples 64]
"""
import argparse
import json
import math
import os
import sys

import bpy  # bpy önce içe aktarılmalı: pip paketinde bmesh/mathutils onunla gelir
import bmesh
from mathutils import Matrix, Vector

# ---------------------------------------------------------------------------
# Parametreler
# ---------------------------------------------------------------------------
ap = argparse.ArgumentParser()
ap.add_argument('--out', required=True)
ap.add_argument('--render', default='')
ap.add_argument('--samples', type=int, default=64)
ap.add_argument('--res', default='1600x1000')
ap.add_argument('--camera', default='front34', choices=['front34', 'close_oven', 'close_as', 'close_pump', 'close_det'])
args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
args.out = os.path.abspath(args.out)
args.render = os.path.abspath(args.render) if args.render else ''

W, D = 0.370, 0.420              # modül genişliği ve derinliği
HW = W / 2
YF = -D / 2                      # gövde ön yüzü
FT = 0.006                       # ön panel (fascia) kalınlığı
YP = YF - FT                     # ön panel ön yüzü
MODS = {                         # alt kenar z0 ve yükseklik h
    'degasser':    (0.008, 0.080),
    'pump':        (0.096, 0.180),
    'autosampler': (0.284, 0.230),
    'oven':        (0.522, 0.150),
    'detector':    (0.680, 0.150),
}
TRAY_Z0 = 0.838

bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene

# ---------------------------------------------------------------------------
# Malzemeler (renkler sRGB olarak yazılır, Blender'a lineer verilir)
# ---------------------------------------------------------------------------
def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

MATS = {}
def mat(name, color, metal=0.0, rough=0.5, alpha=1.0, emit=None, emit_str=0.0, spec=0.5):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*srgb(color), 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    p.inputs['Specular IOR Level'].default_value = spec
    if alpha < 1:
        p.inputs['Alpha'].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except AttributeError:
            m.blend_method = 'BLEND'
    if emit:
        p.inputs['Emission Color'].default_value = (*srgb(emit), 1)
        p.inputs['Emission Strength'].default_value = emit_str
    MATS[name] = m
    return m

M = {
    'body':     mat('PowderCoat', '#c9cdd1', 0.0, 0.48),
    'fascia':   mat('Fascia', '#25292e', 0.0, 0.34),
    'frame':    mat('DoorFrame', '#34393f', 0.0, 0.40),
    'interior': mat('Interior', '#111316', 0.0, 0.85),
    'print':    mat('Print', '#d5dbe0', 0.0, 0.55),
    'accent':   mat('Accent', '#0f766e', 0.0, 0.35, emit='#25d0c4', emit_str=0.6),
    'steel':    mat('Steel', '#c4c9ce', 1.0, 0.24),
    'steel_d':  mat('SteelBrushed', '#9aa1a8', 1.0, 0.36),
    'alu':      mat('Aluminium', '#a9b0b6', 0.9, 0.42),
    'anod':     mat('AnodisedDark', '#3a4047', 0.7, 0.45),
    'peek':     mat('PEEK', '#c8ae86', 0.0, 0.42),
    'black':    mat('BlackPlastic', '#141619', 0.0, 0.5),
    'rubber':   mat('Rubber', '#0e0f10', 0.0, 0.9),
    'vent':     mat('VentDark', '#1b1e22', 0.0, 0.8),
    'bezel':    mat('ScreenBezel', '#08090a', 0.0, 0.15),
    'screen':   mat('ScreenPlaceholder', '#050607', 0.0, 0.2, emit='#0b2a2a', emit_str=0.5),
    'label':    mat('LabelPlaceholder', '#eef1f3', 0.0, 0.6),
    'glass':    mat('GlassSmoked', '#b9d3dc', 0.0, 0.03, alpha=0.10, spec=0.22),
    'glass_b':  mat('GlassBottle', '#e6f2f6', 0.0, 0.03, alpha=0.20),
    'glass_v':  mat('GlassVial', '#eef6f8', 0.0, 0.03, alpha=0.30),
    'hdpe':     mat('GlassHDPE', '#eef0ea', 0.0, 0.55, alpha=0.42),
    'cap_blue': mat('CapBlue', '#2a5db0', 0.0, 0.42),
    'cap_vial': mat('CapVial', '#1d4e9e', 0.0, 0.45),
    'septum':   mat('Septum', '#e9e4da', 0.0, 0.7),
    'liq_a':    mat('LiquidA', '#9ccaff', 0.0, 0.08, alpha=0.38),
    'liq_b':    mat('LiquidB', '#c9adff', 0.0, 0.08, alpha=0.38),
    'liq_s':    mat('LiquidSample', '#f3c56b', 0.0, 0.08, alpha=0.62),
    'liq_v':    mat('LiquidVial', '#d9eef5', 0.0, 0.08, alpha=0.30),
    'liq_w':    mat('LiquidWaste', '#d8b86c', 0.0, 0.1, alpha=0.55),
    'sapphire': mat('Sapphire', '#e8eef2', 0.1, 0.12),
    'lamp':     mat('EmitLamp', '#f4ecff', 0.0, 0.2, emit='#c7b2ff', emit_str=6.0),
    'col':      mat('ColumnSteel_Cutaway', '#cfd6dc', 1.0, 0.2),
}
def led_mat(key, color):
    return mat('LED_' + key, '#101214', 0.0, 0.3, emit=color, emit_str=3.0)

# ---------------------------------------------------------------------------
# Geometri yardımcıları
# ---------------------------------------------------------------------------
COLL = SC.collection
def link(o):
    COLL.objects.link(o)
    return o

def new_obj(name, me, m=None, loc=(0, 0, 0)):
    o = link(bpy.data.objects.new(name, me))
    o.location = loc
    if m is not None:
        me.materials.append(m)
    return o

def box(name, size, center, m, bevel=0.0, segs=3):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bm.to_mesh(me); bm.free()
    o = new_obj(name, me, m, center)
    if bevel > 0:
        b = o.modifiers.new('Bevel', 'BEVEL')
        b.width = bevel; b.segments = segs; b.limit_method = 'ANGLE'
        b.angle_limit = math.radians(40)
    return o

def cyl(name, r, depth, center, axis, m, verts=32, bevel=0.0, r2=None):
    """axis: 'x', 'y' veya 'z' — silindir ekseni."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts,
                          radius1=r, radius2=r if r2 is None else r2, depth=depth)
    rot = {'z': Matrix.Identity(4), 'x': Matrix.Rotation(math.pi / 2, 4, 'Y'),
           'y': Matrix.Rotation(math.pi / 2, 4, 'X')}[axis]
    bmesh.ops.transform(bm, matrix=rot, verts=bm.verts)
    bm.to_mesh(me); bm.free()
    o = new_obj(name, me, m, center)
    if bevel > 0:
        b = o.modifiers.new('Bevel', 'BEVEL')
        b.width = bevel; b.segments = 2; b.limit_method = 'ANGLE'
    return o

def lathe(name, profile, center, m, steps=40):
    """profile: [(r, z), ...] — Z ekseni etrafında döndürülmüş yüzey."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new((r, 0, z)) for r, z in profile]
    es = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    bmesh.ops.spin(bm, geom=vs + es, cent=(0, 0, 0), axis=(0, 0, 1),
                   angle=2 * math.pi, steps=steps, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    return new_obj(name, me, m, center)

def plane(name, w, h, center, m):
    """Ön yüze (−Y) bakan, UV'si 0..1 olan düzlem (u sağa, v yukarı)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    pts = [(-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2)]
    uvs = [(0, 0), (1, 0), (1, 1), (0, 1)]
    vs = [bm.verts.new(p) for p in pts]
    f = bm.faces.new(vs)
    for loop, t in zip(f.loops, uvs):
        loop[uv].uv = t
    f.normal_update()
    if f.normal.y > 0:                       # normal −Y (öne) bakmalı
        bmesh.ops.reverse_faces(bm, faces=[f])
    bm.to_mesh(me); bm.free()
    return new_obj(name, me, m, center)

def wrap_label(name, r, h, half_angle, center, m, steps=24):
    """Silindir yüzeyine sarılı etiket (ön yarım), UV u soldan sağa, v aşağıdan yukarı."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    grid = []
    for i in range(steps + 1):
        a = -half_angle + 2 * half_angle * i / steps
        x, y = r * math.sin(a), -r * math.cos(a)
        grid.append((bm.verts.new((x, y, -h / 2)), bm.verts.new((x, y, h / 2)), i / steps))
    for i in range(steps):
        (b0, t0, u0), (b1, t1, u1) = grid[i], grid[i + 1]
        f = bm.faces.new((b0, b1, t1, t0))
        for loop, t in zip(f.loops, [(u0, 0), (u1, 0), (u1, 1), (u0, 1)]):
            loop[uv].uv = t
        f.normal_update()
        mid = (b0.co + t1.co) / 2
        if f.normal.dot(Vector((mid.x, mid.y, 0))) < 0:
            bmesh.ops.reverse_faces(bm, faces=[f])
    bm.to_mesh(me); bm.free()
    return new_obj(name, me, m, center)

def text(name, body, size, loc, m, align='LEFT'):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body; cu.size = size; cu.extrude = 0.00015
    cu.resolution_u = 3                      # glif eğrisi çözünürlüğü (üçgen bütçesi)
    cu.align_x = align; cu.align_y = 'CENTER'
    cu.materials.append(m)
    o = link(bpy.data.objects.new(name, cu))
    o.location = loc
    o.rotation_euler = (math.pi / 2, 0, 0)
    return o

def tube(name, pts, r, m, res=10):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 3; cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    sp.resolution_u = res
    cu.materials.append(m)
    return link(bpy.data.objects.new(name, cu))

def boolean(target, cutter, transfer=True):
    b = target.modifiers.new('Cut_' + cutter.name, 'BOOLEAN')
    b.object = cutter; b.operation = 'DIFFERENCE'; b.solver = 'EXACT'
    if transfer:
        b.material_mode = 'TRANSFER'
    # Pah, boolean'dan sonra değil önce uygulanır (kesik kenarlar keskin kalır)
    if len(target.modifiers) > 1:
        target.modifiers.move(len(target.modifiers) - 1, 0)
    cutter.hide_render = True
    CUTTERS.append(cutter)

def empty(name, loc, props=None):
    e = link(bpy.data.objects.new(name, None))
    e.location = loc
    e.empty_display_size = 0.01
    for k, v in (props or {}).items():
        e[k] = v
    return e

def parent(children, p):
    # matrix_world yalnızca görünüm katmanı güncellendiğinde hesaplanır; güncellenmeden
    # okunursa birim matris döner ve çocukların konumu kaybolur.
    bpy.context.view_layer.update()
    inv = p.matrix_world.inverted()
    for c in children:
        c.parent = p
        c.matrix_parent_inverse = inv

CUTTERS = []
KEEP = set()           # birleştirilmeyecek (adı korunacak) nesneler

# ---------------------------------------------------------------------------
# Ortak modül parçaları
# ---------------------------------------------------------------------------
def chassis(mid, opening=None):
    z0, h = MODS[mid]
    zc = z0 + h / 2
    parts = []
    body = box(f'{mid}_body', (W, D, h), (0, 0, zc), M['body'], bevel=0.005, segs=4)
    fas = box(f'{mid}_fascia', (W - 0.006, FT + 0.001, h - 0.006), (0, YF - FT / 2 + 0.0005, zc),
              M['fascia'], bevel=0.0018, segs=2)
    parts += [body, fas]
    if opening:
        x0, x1, zb, zt, ydepth = opening
        cut = box(f'{mid}_cav', (x1 - x0, ydepth - (YF - 0.03), zt - zb),
                  ((x0 + x1) / 2, (ydepth + YF - 0.03) / 2, (zb + zt) / 2), M['interior'])
        boolean(body, cut)
        boolean(fas, cut)
    # Yan havalandırma yarıkları (dizi)
    n = max(3, int((h - 0.04) / 0.008))
    for sgn in (-1, 1):
        v = box(f'{mid}_vent{sgn}', (0.0012, 0.10, 0.0028), (sgn * (HW + 0.0003), -0.12, z0 + 0.02), M['vent'])
        a = v.modifiers.new('Array', 'ARRAY')
        a.count = n; a.use_relative_offset = False; a.use_constant_offset = True
        a.constant_offset_displace = (0, 0, 0.008)
        parts.append(v)
    # Kauçuk ayaklar
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(cyl(f'{mid}_foot', 0.009, 0.008, (sx * (HW - 0.035), sy * (D / 2 - 0.045), z0 - 0.004),
                             'z', M['rubber'], verts=20))
    # Alt kenarda ince vurgu şeridi
    parts.append(box(f'{mid}_accent', (0.06, 0.0012, 0.0016), (HW - 0.045, YP - 0.0004, z0 + 0.010), M['accent']))
    return parts

def led(mid, key, color, x, z):
    o = box(f'LED_{key}', (0.010, 0.0025, 0.004), (x, YP - 0.001, z), led_mat(key, color), bevel=0.0008, segs=2)
    KEEP.add(o.name)
    return o

def label_text(mid, body, x, z, size=0.0068):
    return text(f'{mid}_txt', body, size, (x, YP - 0.0002, z), M['print'])

def screen(key, w, h, x, z, pxw, pxh):
    bez = box(f'{key}_bezel', (w + 0.007, 0.002, h + 0.007), (x, YP - 0.0008, z), M['bezel'], bevel=0.0008, segs=2)
    s = plane(f'Screen_{key}', w, h, (x, YP - 0.0021, z), M['screen'])
    s['px_w'] = pxw; s['px_h'] = pxh
    KEEP.add(s.name)
    return [bez, s]

def fitting(name, x, z, m=None, y0=YP, length=0.010, axis_dir=(0, -1, 0)):
    """Parmakla sıkılan fitting: gövde + uç; uç konumunu döndürür."""
    m = m or M['peek']
    d = Vector(axis_dir)
    c1 = Vector((x, y0, z)) + d * (length / 2)
    ax = 'y' if abs(d.y) > 0.5 else ('x' if abs(d.x) > 0.5 else 'z')
    a = cyl(name + '_nut', 0.0042, length, c1, ax, m, verts=12, bevel=0.0006)
    tip = Vector((x, y0, z)) + d * (length + 0.002)
    b = cyl(name + '_tip', 0.0022, 0.004, Vector((x, y0, z)) + d * (length + 0.0005), ax, M['steel'], verts=12)
    return [a, b], tip

def door(mid, x0, x1, zb, zt, y=YP - 0.004, handle=True):
    parts = []
    fr = box(f'{mid}_door', (x1 - x0, 0.008, zt - zb), ((x0 + x1) / 2, y, (zb + zt) / 2), M['frame'], bevel=0.0015, segs=2)
    cut = box(f'{mid}_doorcut', (x1 - x0 - 0.020, 0.03, zt - zb - 0.020), ((x0 + x1) / 2, y, (zb + zt) / 2), M['frame'])
    boolean(fr, cut, transfer=False)
    g = box(f'{mid}_glass', (x1 - x0 - 0.016, 0.003, zt - zb - 0.016), ((x0 + x1) / 2, y + 0.001, (zb + zt) / 2), M['glass'])
    parts += [fr, g]
    if handle:
        parts.append(box(f'{mid}_handle', (0.006, 0.010, (zt - zb) * 0.55), (x1 - 0.007, y - 0.008, (zb + zt) / 2),
                         M['steel_d'], bevel=0.0015, segs=2))
    return parts

MODROOT = {}
def module_root(mid, parts, center):
    e = empty(f'Mod_{mid}', center, {'moduleId': mid})
    MODROOT[mid] = e
    parent(parts, e)
    return e

PORTS = {}
def to_gltf(p):
    """Blender (Z yukarı) → glTF (Y yukarı): (x, y, z) → (x, z, −y)"""
    return [round(p[0], 5), round(p[2], 5), round(-p[1], 5)]

# ---------------------------------------------------------------------------
# DEGAZÖR
# ---------------------------------------------------------------------------
z0, h = MODS['degasser']
parts = chassis('degasser')
parts.append(led('degasser', 'deg', '#59d97a', -HW + 0.022, z0 + h - 0.016))
parts.append(label_text('degasser', 'VAKUM DEGAZÖR', HW - 0.012 - 0.0, z0 + 0.024))
parts[-1].data.align_x = 'RIGHT'
for ch, x in (('A', -0.140), ('B', -0.110), ('C', -0.080), ('D', -0.050)):
    pin, tin = fitting(f'deg_{ch}_in', x, z0 + 0.056, M['peek'] if ch in 'AB' else M['black'])
    pout, tout = fitting(f'deg_{ch}_out', x, z0 + 0.030, M['peek'] if ch in 'AB' else M['black'])
    parts += pin + pout
    PORTS[f'deg_{ch}_in'] = tin; PORTS[f'deg_{ch}_out'] = tout
    parts.append(text(f'deg_ch{ch}', ch, 0.0055, (x, YP - 0.0002, z0 + 0.069), M['print'], align='CENTER'))
module_root('degasser', parts, (0, 0, z0 + h / 2))

# ---------------------------------------------------------------------------
# POMPA (düşük basınç karıştırmalı ikili piston pompa)
# ---------------------------------------------------------------------------
z0, h = MODS['pump']
REC = (-0.015, 0.180, z0 + 0.030, z0 + 0.158, YF + 0.035)      # piston bölmesi (girinti)
parts = chassis('pump', opening=REC)
parts += screen('pump', 0.110, 0.042, -0.105, z0 + h - 0.040, 320, 122)
parts.append(led('pump', 'pump', '#4aa3ff', -HW + 0.022, z0 + h - 0.016))
parts.append(label_text('pump', 'GRADİENT POMPA', -HW + 0.016, z0 + 0.020))
# Güç düğmesi
parts.append(cyl('pump_power', 0.007, 0.004, (-HW + 0.030, YP - 0.002, z0 + 0.052), 'y', M['black'], verts=24, bevel=0.001))
parts.append(cyl('pump_power_ring', 0.0085, 0.0015, (-HW + 0.030, YP - 0.0005, z0 + 0.052), 'y', M['accent'], verts=24))
# Oransal valf (MCGV) bloğu ve A/B girişleri
parts.append(box('pump_mcgv', (0.046, 0.018, 0.028), (-0.118, YP - 0.008, z0 + 0.050), M['anod'], bevel=0.002))
for ch, x in (('A', -0.130), ('B', -0.106)):
    p, t = fitting(f'pump_{ch}_in', x, z0 + 0.050, M['peek'], y0=YP - 0.017)
    parts += p; PORTS[f'pump_{ch}_in'] = t
parts.append(text('pump_mcgv_t', 'A    B', 0.0045, (-0.118, YP - 0.0172, z0 + 0.070), M['print'], align='CENTER'))
# Piston başlıkları: tahrik duvarından 18 mm açıklıkla monte; açıklıkta safir piston görünür
heads = []
YB = REC[4]                       # girinti arka duvarı
for i, x in enumerate((0.040, 0.118)):
    zc = z0 + 0.098
    yh0 = YB - 0.018              # başlık arka yüzü
    hd = cyl(f'pump_head{i}', 0.021, 0.050, (x, yh0 - 0.025, zc), 'y', M['steel'], verts=40, bevel=0.0015)
    parts.append(hd)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        parts.append(cyl(f'pump_screw{i}{k}', 0.0026, 0.003, (x + 0.0145 * math.cos(a), yh0 - 0.0515, zc + 0.0145 * math.sin(a)),
                         'y', M['steel_d'], verts=6))
    # destek pimleri
    for sx in (-1, 1):
        parts.append(cyl(f'pump_pin{i}{sx}', 0.003, 0.019, (x + sx * 0.015, YB - 0.009, zc - 0.012), 'y', M['steel_d'], verts=12))
    # giriş (aktif giriş valfi, altta) ve çıkış (üstte)
    parts.append(cyl(f'pump_inv{i}', 0.0075, 0.022, (x, yh0 - 0.030, zc - 0.030), 'z', M['black'], verts=20, bevel=0.0008))
    parts.append(cyl(f'pump_outv{i}', 0.0055, 0.012, (x, yh0 - 0.030, zc + 0.026), 'z', M['steel_d'], verts=6))
    # piston (hareketli; pivot kimlik dönüşümlü)
    pv = empty(f'Pivot_piston_{"LR"[i]}', (x, YB - 0.009, zc))
    rod = cyl(f'pump_piston{i}', 0.0035, 0.024, (x, YB - 0.009, zc), 'y', M['sapphire'], verts=20)
    parent([rod], pv); KEEP.add(rod.name)
    parts.append(pv)
    heads.append((x, yh0, zc))
# Başlıklar arası kapiler, MCGV → 1. başlık girişi
parts.append(tube('pump_cap1', [(heads[0][0], heads[0][1] - 0.030, heads[0][2] + 0.032), (0.079, heads[0][1] - 0.034, heads[0][2] + 0.052),
                                (heads[1][0], heads[1][1] - 0.030, heads[1][2] - 0.040), (heads[1][0], heads[1][1] - 0.030, heads[1][2] - 0.041)],
                  0.0009, M['steel']))
parts.append(tube('pump_cap0', [(-0.095, YP - 0.012, z0 + 0.050), (-0.03, YP - 0.030, z0 + 0.040),
                                (heads[0][0], heads[0][1] - 0.030, heads[0][2] - 0.044)], 0.0011, M['peek']))
# Boşaltma (purge) valfi ve çıkış
parts.append(box('pump_purge_blk', (0.020, 0.024, 0.030), (0.164, YB - 0.012, z0 + 0.112), M['steel_d'], bevel=0.0015))
parts.append(cyl('pump_purge_knob', 0.0105, 0.012, (0.164, YB - 0.030, z0 + 0.112), 'y', M['black'], verts=28, bevel=0.001))
parts.append(tube('pump_cap2', [(heads[1][0], heads[1][1] - 0.030, heads[1][2] + 0.032), (0.140, heads[1][1] - 0.030, z0 + 0.150),
                                (0.164, YB - 0.012, z0 + 0.128)], 0.0009, M['steel']))
p, t = fitting('pump_out', 0.164, z0 + 0.088, M['steel_d'], y0=YB - 0.024, length=0.008)
parts += p; PORTS['pump_out'] = t
module_root('pump', parts, (0, 0, z0 + h / 2))

# ---------------------------------------------------------------------------
# OTOSAMPLER
# ---------------------------------------------------------------------------
z0, h = MODS['autosampler']
OP = (-0.177, 0.075, z0 + 0.018, z0 + h - 0.014, 0.17)
parts = chassis('autosampler', opening=OP)
parts += door('autosampler', OP[0] - 0.004, OP[1] + 0.006, OP[2] - 0.006, OP[3] + 0.006)
parts.append(led('autosampler', 'as', '#ffb347', 0.110, z0 + h - 0.016))
parts.append(label_text('autosampler', 'OTOSAMPLER', 0.090, z0 + 0.020))
# Termostatlı numune tepsisi ve vial rafı
zt = z0 + 0.030
parts.append(box('as_tray', (0.230, 0.300, 0.008), (-0.050, -0.020, zt), M['alu'], bevel=0.0015))
parts.append(box('as_rack', (0.150, 0.090, 0.012), (-0.065, -0.105, zt + 0.010), M['anod'], bevel=0.0015))
vial_profile = [(0, 0), (0.0055, 0), (0.006, 0.0012), (0.006, 0.026), (0.0052, 0.028), (0.0042, 0.029), (0.0042, 0.032)]
liq_profile = [(0, 0.0015), (0.0052, 0.0015), (0.0052, 0.016), (0, 0.016)]
SAMPLE = (1, 2)                   # (satır, sütun) — enjeksiyon yapılan vial
xs = [-0.065 + (c - 3.5) * 0.0175 for c in range(8)]
ys = [-0.105 + (r - 1.5) * 0.020 for r in range(4)]
for r, y in enumerate(ys):
    for c, x in enumerate(xs):
        zb = zt + 0.016
        parts.append(lathe('as_vial', vial_profile, (x, y, zb), M['glass_v'], steps=20))
        smp = (r, c) == SAMPLE
        parts.append(lathe('as_liq', liq_profile, (x, y, zb), M['liq_s'] if smp else M['liq_v'], steps=16))
        parts.append(cyl('as_cap', 0.0063, 0.0065, (x, y, zb + 0.0352), 'z', M['cap_vial'], verts=20, bevel=0.0006))
        parts.append(cyl('as_septum', 0.0040, 0.0008, (x, y, zb + 0.0388), 'z', M['septum'], verts=16))
# Enjektör portalı: ray, taşıyıcı, iğne
xn, yn = xs[SAMPLE[1]], ys[SAMPLE[0]]
parts.append(box('as_rail', (0.240, 0.014, 0.012), (-0.050, -0.035, z0 + h - 0.030), M['steel_d'], bevel=0.0015))
parts.append(box('as_carriage', (0.030, 0.030, 0.026), (xn, -0.050, z0 + h - 0.034), M['black'], bevel=0.002))
parts.append(box('as_arm', (0.016, yn - (-0.050) - 0.0, 0.010), (xn, (yn - 0.050) / 2, z0 + h - 0.044), M['black'], bevel=0.0015))
needle_top = z0 + h - 0.046
pv = empty('Pivot_needle', (xn, yn, needle_top))
nd = cyl('as_needle', 0.0008, 0.060, (xn, yn, needle_top - 0.030), 'z', M['steel'], verts=10)
sl = cyl('as_needle_sleeve', 0.0030, 0.018, (xn, yn, needle_top - 0.006), 'z', M['steel_d'], verts=16)
parent([nd, sl], pv); KEEP.update([nd.name, sl.name])
parts.append(pv)
parts.append(box('as_seat', (0.022, 0.022, 0.020), (0.050, -0.105, zt + 0.014), M['anod'], bevel=0.0015))
# 6 yollu enjeksiyon valfi (sağ panel)
xv, zv = 0.133, z0 + 0.128
parts.append(cyl('as_valve_body', 0.024, 0.010, (xv, YP - 0.005, zv), 'y', M['steel'], verts=48, bevel=0.0012))
for k in range(6):
    a = math.radians(30 + 60 * k)
    p, t = fitting(f'as_vport{k}', xv + 0.0150 * math.cos(a), zv + 0.0150 * math.sin(a), M['peek'], y0=YP - 0.010, length=0.007)
    parts += p
    PORTS[f'as_vport{k}'] = t
pv = empty('Pivot_valve', (xv, YP - 0.011, zv))
rot = cyl('as_valve_rotor', 0.0065, 0.003, (xv, YP - 0.0115, zv), 'y', M['black'], verts=24)
slot = box('as_valve_slot', (0.010, 0.001, 0.0016), (xv, YP - 0.0132, zv), M['accent'])
parent([rot, slot], pv); KEEP.update([rot.name, slot.name])
parts.append(pv)
parts.append(text('as_valve_t', 'LOAD / INJECT', 0.0042, (xv, YP - 0.0002, zv - 0.034), M['print'], align='CENTER'))
# Numune döngüsü (sarmal)
coil = [(xv - 0.018 + 0.036 * i / 160, YP - 0.020 - 0.008 * math.cos(i / 160 * 8 * math.pi),
         z0 + 0.062 + 0.008 * math.sin(i / 160 * 8 * math.pi)) for i in range(161)]
cu = bpy.data.curves.new('as_loop', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.0008; cu.bevel_resolution = 2
sp = cu.splines.new('POLY'); sp.points.add(len(coil) - 1)
for pt, c in zip(sp.points, coil):
    pt.co = (*c, 1)
cu.materials.append(M['steel'])
parts.append(link(bpy.data.objects.new('as_loop', cu)))
p4, p5 = PORTS['as_vport4'], PORTS['as_vport5']
parts.append(tube('as_loop_a', [p4, (p4.x - 0.010, p4.y - 0.006, p4.z - 0.010), coil[0]], 0.0008, M['steel']))
parts.append(tube('as_loop_b', [p5, (p5.x + 0.012, p5.y - 0.006, p5.z - 0.012), coil[-1]], 0.0008, M['steel']))
module_root('autosampler', parts, (0, 0, z0 + h / 2))

# ---------------------------------------------------------------------------
# KOLON FIRINI + KOLON
# ---------------------------------------------------------------------------
z0, h = MODS['oven']
OP = (-0.177, 0.110, z0 + 0.016, z0 + h - 0.016, 0.15)
parts = chassis('oven', opening=OP)
# Kapı kapiler geçişleri için solda ve sağda 8 mm boşluk bırakır
parts += door('oven', OP[0] + 0.008, OP[1] - 0.008, OP[2] - 0.006, OP[3] + 0.006)
parts += screen('oven', 0.050, 0.026, 0.150, z0 + h - 0.040, 220, 114)
parts.append(led('oven', 'oven', '#ff8f4a', 0.130, z0 + h - 0.016))
parts.append(label_text('oven', 'KOLON FIRINI', 0.118, z0 + 0.020, size=0.0060))
# Isı değiştirici (kanatlı alüminyum blok) ve kolon klipsleri
COLZ, COLY = z0 + 0.075, -0.150
he = box('oven_hex', (0.030, 0.050, 0.060), (0.078, COLY + 0.055, COLZ), M['alu'], bevel=0.0015)
parts.append(he)
for i in range(7):
    parts.append(box('oven_fin', (0.030, 0.002, 0.060), (0.078, COLY + 0.025 - 0.003 * i - 0.004, COLZ), M['alu']))
for x in (-0.075, 0.000):
    parts.append(box('oven_clip', (0.010, 0.014, 0.018), (x, COLY + 0.009, COLZ - 0.006), M['anod'], bevel=0.001))
    parts.append(box('oven_clipbase', (0.016, 0.050, 0.006), (x, COLY + 0.035, COLZ - 0.014), M['anod'], bevel=0.001))
module_root('oven', parts, (0, 0, z0 + h / 2))
LAMP_OVEN = (-0.03, -0.12, z0 + h - 0.03)

# Kolon (ayrı seçilebilir modül): 150 mm dolgu yatağı, akış sağdan sola
XIN, XOUT = 0.040, -0.110
cparts = []
cparts.append(cyl('Column_Body', 0.0040, XIN - XOUT, ((XIN + XOUT) / 2, COLY, COLZ), 'x', M['col'], verts=40))
for nm, x, sgn in (('in', XIN, 1), ('out', XOUT, -1)):
    cparts.append(cyl(f'col_end_{nm}', 0.0068, 0.012, (x + sgn * 0.006, COLY, COLZ), 'x', M['steel'], verts=6, bevel=0.0007))
    cparts.append(cyl(f'col_nut_{nm}', 0.0035, 0.010, (x + sgn * 0.017, COLY, COLZ), 'x', M['peek'], verts=16))
lab = wrap_label('Label_column', 0.00412, 0.0072, math.radians(80), (-0.030, COLY, COLZ), M['label'], steps=16)
lab['px_w'] = 512; lab['px_h'] = 128
KEEP.add(lab.name)
cparts.append(lab)
# Etiket düzlemi kolon boyunca uzanır: dönüşü uygula (yerel z → dünya x)
lab.rotation_euler = (0, math.pi / 2, 0)
lab.scale = (1, 1, 1)
lab.data.transform(Matrix.Diagonal((1, 1, 0.085 / 0.0072, 1)))
cparts.append(empty('Column_In', (XIN, COLY, COLZ), {'col_r': 0.0023}))
cparts.append(empty('Column_Out', (XOUT, COLY, COLZ), {'col_r': 0.0023}))
module_root('column', cparts, ((XIN + XOUT) / 2, COLY, COLZ))

# ---------------------------------------------------------------------------
# DEDEKTÖR (DAD)
# ---------------------------------------------------------------------------
z0, h = MODS['detector']
OP = (-0.177, -0.030, z0 + 0.020, z0 + h - 0.020, 0.12)
parts = chassis('detector', opening=OP)
parts += door('detector', OP[0] + 0.008, OP[1] + 0.005, OP[2] - 0.006, OP[3] + 0.006)
parts += screen('det', 0.130, 0.052, 0.075, z0 + h - 0.050, 420, 168)
parts.append(led('detector', 'det', '#25d0c4', -0.012, z0 + h - 0.016))
parts.append(label_text('detector', 'DİYOT DİZİSİ DEDEKTÖRÜ', 0.012, z0 + 0.020, size=0.0062))
CZ, CY = z0 + 0.075, -0.110
# Lamba yuvası ve döteryum lambası
parts.append(box('det_lamphouse', (0.034, 0.060, 0.060), (-0.152, CY + 0.030, CZ), M['alu'], bevel=0.002))
lamp_bulb = lathe('det_bulb', [(0, 0), (0.008, 0.0), (0.009, 0.004), (0.009, 0.016), (0.006, 0.022), (0, 0.024)],
                  (-0.150, CY - 0.004, CZ - 0.012), M['glass_b'], steps=24)
lamp_core = cyl('det_arc', 0.0032, 0.010, (-0.150, CY - 0.004, CZ), 'z', M['lamp'], verts=16)
parts += [lamp_bulb, lamp_core]
# Optik eksen: mercekler, akış hücresi, spektrograf
for x in (-0.134, -0.114):
    parts.append(cyl('det_lens', 0.007, 0.003, (x, CY, CZ), 'x', M['glass_b'], verts=24))
    parts.append(cyl('det_lensring', 0.0085, 0.004, (x, CY, CZ), 'x', M['anod'], verts=24))
XC = -0.088
parts.append(box('det_cell', (0.018, 0.022, 0.026), (XC, CY, CZ), M['steel'], bevel=0.0012))
for sgn in (-1, 1):
    parts.append(cyl('det_cellwin', 0.0035, 0.0012, (XC + sgn * 0.0094, CY, CZ), 'x', M['glass_b'], verts=16))
pin, tin = fitting('det_in', XC, CZ - 0.013, M['peek'], y0=CY, length=0.008, axis_dir=(0, 0, -1))
pout, tout = fitting('det_out', XC, CZ + 0.013, M['peek'], y0=CY, length=0.008, axis_dir=(0, 0, 1))
parts += pin + pout
PORTS['det_in'] = Vector((XC, CY, CZ - 0.013 - 0.010)); PORTS['det_out'] = Vector((XC, CY, CZ + 0.013 + 0.010))
parts.append(box('det_spectro', (0.034, 0.060, 0.050), (-0.048, CY + 0.030, CZ), M['alu'], bevel=0.002))
parts.append(empty('Det_Cell', ((-0.150 + XC) / 2, CY, CZ), {'beam_len': XC - (-0.150) - 0.010}))
module_root('detector', parts, (0, 0, z0 + h / 2))

# ---------------------------------------------------------------------------
# SOLVENT TEPSİSİ + ŞİŞELER (1 L, GL45)
# ---------------------------------------------------------------------------
tparts = []
tz = TRAY_Z0
tparts.append(box('tray_base', (W + 0.012, D + 0.010, 0.008), (0, 0, tz + 0.004), M['body'], bevel=0.003))
for sx in (-1, 1):
    tparts.append(box('tray_wall_s', (0.006, D + 0.010, 0.050), (sx * (HW + 0.003), 0, tz + 0.033), M['body'], bevel=0.0025))
tparts.append(box('tray_wall_b', (W + 0.012, 0.006, 0.050), (0, D / 2 + 0.002, tz + 0.033), M['body'], bevel=0.0025))
tparts.append(box('tray_wall_f', (W + 0.012, 0.006, 0.034), (0, -D / 2 - 0.002, tz + 0.025), M['fascia'], bevel=0.0025))
tparts.append(text('tray_txt', 'SOLVENT KABİNİ', 0.0062, (-HW + 0.016, -D / 2 - 0.0052, tz + 0.025), M['print']))
bottle_profile = [(0, 0), (0.044, 0), (0.0495, 0.004), (0.0505, 0.012), (0.0505, 0.150), (0.047, 0.163), (0.036, 0.174),
                  (0.0235, 0.180), (0.0235, 0.204)]
liq_profile = [(0, 0.003), (0.0465, 0.003), (0.0485, 0.010), (0.0485, 0.133), (0, 0.133)]
caps = {}
for key, x, lm in (('A', -0.090, M['liq_a']), ('B', 0.030, M['liq_b'])):
    zb = tz + 0.008
    tparts.append(lathe(f'bottle_{key}', bottle_profile, (x, -0.010, zb), M['glass_b'], steps=48))
    pv = empty(f'Pivot_liquid_{key}', (x, -0.010, zb))
    lq = lathe(f'liquid_{key}', liq_profile, (x, -0.010, zb), lm, steps=40)
    parent([lq], pv); KEEP.add(lq.name)
    tparts.append(pv)
    tparts.append(cyl(f'cap_{key}', 0.0262, 0.026, (x, -0.010, zb + 0.204), 'z', M['cap_blue'], verts=40, bevel=0.002))
    for k in range(24):
        a = 2 * math.pi * k / 24
        tparts.append(box(f'cap_rib_{key}', (0.0016, 0.0016, 0.020), (x + 0.0266 * math.cos(a), -0.010 + 0.0266 * math.sin(a), zb + 0.204), M['cap_blue']))
    for dx in (-0.008, 0.008):
        tparts.append(cyl(f'cap_port_{key}', 0.0035, 0.008, (x + dx, -0.010, zb + 0.221), 'z', M['peek'], verts=12))
    caps[key] = Vector((x - 0.008, -0.010, zb + 0.226))
    lb = wrap_label(f'Label_{key}', 0.0509, 0.060, math.radians(55), (x, -0.010, zb + 0.085), M['label'], steps=20)
    lb['px_w'] = 256; lb['px_h'] = 196
    KEEP.add(lb.name)
    tparts.append(lb)
module_root('bottles', tparts, (0, 0, tz + 0.1))

# ---------------------------------------------------------------------------
# ATIK BİDONU (HDPE, ~3 L) — tezgâhta, yığının solunda
# ---------------------------------------------------------------------------
wx, wy = -0.455, -0.030
wparts = []
wparts.append(box('waste_body', (0.140, 0.110, 0.220), (wx, wy, 0.110), M['hdpe'], bevel=0.016, segs=4))
wparts.append(cyl('waste_neck', 0.020, 0.020, (wx + 0.030, wy - 0.010, 0.229), 'z', M['hdpe'], verts=28))
wparts.append(cyl('waste_cap', 0.0235, 0.020, (wx + 0.030, wy - 0.010, 0.247), 'z', M['black'], verts=32, bevel=0.0015))
wparts.append(cyl('waste_port', 0.004, 0.010, (wx + 0.030, wy - 0.010, 0.262), 'z', M['peek'], verts=12))
wparts.append(box('waste_handle', (0.016, 0.070, 0.026), (wx - 0.035, wy + 0.010, 0.232), M['hdpe'], bevel=0.006, segs=3))
pv = empty('Pivot_liquid_waste', (wx, wy, 0.006))
wl = box('liquid_waste', (0.126, 0.096, 0.200), (wx, wy, 0.006 + 0.100), M['liq_w'], bevel=0.010, segs=3)
parent([wl], pv); KEEP.add(wl.name)
wparts.append(pv)
wlab = plane('Label_waste', 0.090, 0.060, (wx, wy - 0.0556, 0.115), M['label'])
wlab['px_w'] = 256; wlab['px_h'] = 170
KEEP.add(wlab.name)
wparts.append(wlab)
module_root('waste', wparts, (wx, wy, 0.13))

# İç bölme lambaları (konum)
lamp_empties = [empty('Lamp_as', (-0.05, -0.12, MODS['autosampler'][0] + 0.18)),
                empty('Lamp_oven', LAMP_OVEN),
                empty('Lamp_det', (-0.10, -0.12, MODS['detector'][0] + 0.12))]

# ---------------------------------------------------------------------------
# AKIŞ HATLARI (animasyon yolları; tüpler three.js tarafında bu noktalardan kurulur)
# ---------------------------------------------------------------------------
YL = YP - 0.030                    # ön yüzde kapiler dolaşım düzlemi
zO = MODS['oven'][0]; zD = MODS['detector'][0]; zA = MODS['autosampler'][0]; zP = MODS['pump'][0]
pA_in, pB_in = PORTS['deg_A_in'], PORTS['deg_B_in']
pA_out, pB_out = PORTS['deg_A_out'], PORTS['deg_B_out']
vin, vout = PORTS['as_vport3'], PORTS['as_vport0']           # pompa → valf, valf → kolon
def P(*a): return [float(x) for x in a]
paths = [
    {'id': 'A', 'phase': 'A', 'kind': 'lp', 'r': 0.0016, 'color': 0x3f7fe0, 'pts': [
        P(*caps['A']), P(caps['A'].x, caps['A'].y, caps['A'].z + 0.030), P(-0.150, -0.120, TRAY_Z0 + 0.20),
        P(-0.205, YL, TRAY_Z0 + 0.06), P(-0.205, YL, 0.40), P(-0.200, YL, 0.12), P(pA_in.x - 0.012, YL, pA_in.z + 0.012), P(*pA_in)]},
    {'id': 'B', 'phase': 'B', 'kind': 'lp', 'r': 0.0016, 'color': 0x8a5fe0, 'pts': [
        P(*caps['B']), P(caps['B'].x, caps['B'].y, caps['B'].z + 0.036), P(-0.120, -0.140, TRAY_Z0 + 0.21),
        P(-0.196, YL + 0.006, TRAY_Z0 + 0.06), P(-0.196, YL + 0.006, 0.40), P(-0.186, YL + 0.006, 0.13), P(pB_in.x - 0.010, YL + 0.006, pB_in.z + 0.014), P(*pB_in)]},
    {'id': 'degA-pump', 'phase': 'A', 'kind': 'lp', 'r': 0.0013, 'color': 0x3f7fe0, 'pts': [
        P(*pA_out), P(pA_out.x - 0.020, YL, pA_out.z + 0.004), P(-0.168, YL - 0.004, zP + 0.030), P(*PORTS['pump_A_in'])]},
    {'id': 'degB-pump', 'phase': 'B', 'kind': 'lp', 'r': 0.0013, 'color': 0x8a5fe0, 'pts': [
        P(*pB_out), P(pB_out.x + 0.004, YL + 0.004, pB_out.z + 0.010), P(-0.100, YL, zP + 0.030), P(*PORTS['pump_B_in'])]},
    {'id': 'pump-as', 'kind': 'hp', 'r': 0.0012, 'color': 0xb9c4cf, 'pts': [
        P(*PORTS['pump_out']), P(0.178, PORTS['pump_out'].y - 0.012, zP + 0.080), P(0.200, YL, zP + 0.150),
        P(0.200, YL, zA + 0.080), P(vin.x + 0.020, YL + 0.006, vin.z - 0.006), P(*vin)]},
    {'id': 'as-col', 'kind': 'hp', 'r': 0.0012, 'color': 0xb9c4cf, 'pts': [
        P(*vout), P(vout.x + 0.022, YL + 0.004, vout.z + 0.018), P(0.201, YL, zA + 0.210), P(0.198, YL, zO + 0.040),
        P(0.106, YL + 0.004, COLZ + 0.006), P(0.106, -0.205, COLZ + 0.006), P(0.100, -0.175, COLZ), P(0.080, COLY + 0.004, COLZ + 0.034),
        P(0.064, COLY, COLZ + 0.006), P(XIN + 0.023, COLY, COLZ), P(XIN, COLY, COLZ)]},
    {'id': 'column', 'kind': 'col'},
    {'id': 'col-det', 'kind': 'hp', 'r': 0.0011, 'color': 0xb9c4cf, 'pts': [
        P(XOUT, COLY, COLZ), P(XOUT - 0.023, COLY, COLZ), P(-0.150, COLY - 0.012, COLZ + 0.006), P(-0.173, -0.190, COLZ + 0.012),
        P(-0.173, -0.212, COLZ + 0.016), P(-0.192, YL, COLZ + 0.040), P(-0.192, YL, zD + 0.020), P(-0.173, -0.212, zD + 0.036),
        P(-0.150, CY - 0.020, zD + 0.044), P(XC, CY, CZ - 0.040), P(*PORTS['det_in'])]},
    {'id': 'det-waste', 'kind': 'lp', 'r': 0.0015, 'color': 0x9aa6b2, 'pts': [
        P(*PORTS['det_out']), P(XC, CY, CZ + 0.040), P(-0.150, CY - 0.020, CZ + 0.048), P(-0.173, -0.212, CZ + 0.050),
        P(-0.205, YL - 0.004, CZ + 0.030), P(-0.235, YL + 0.020, zD - 0.100), P(-0.300, -0.150, 0.420), P(-0.400, -0.080, 0.330),
        P(wx + 0.030, wy - 0.010, 0.300), P(wx + 0.030, wy - 0.010, 0.266)]},
]
for p_ in paths:
    if 'pts' in p_:
        p_['pts'] = [to_gltf(q) for q in p_['pts']]
fp = empty('FlowPaths', (0, 0, 0), {'paths': json.dumps(paths, separators=(',', ':'))})

# ---------------------------------------------------------------------------
# Değiştiricileri uygula, eğri/metinleri ağa çevir, statik parçaları malzemeye göre birleştir
# ---------------------------------------------------------------------------
def bake_all():
    global CUT_NAMES
    CUT_NAMES = {c.name for c in CUTTERS}
    dg = bpy.context.evaluated_depsgraph_get()
    for o in list(SC.objects):
        if o.name in CUT_NAMES or o.type not in ('MESH', 'CURVE', 'FONT'):
            continue
        if o.type == 'MESH' and not o.modifiers:
            continue
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        n = link(bpy.data.objects.new(o.name + '__b', me))
        n.parent = o.parent
        n.matrix_parent_inverse = o.matrix_parent_inverse.copy()
        n.matrix_basis = o.matrix_basis.copy()
        for k in o.keys():
            n[k] = o[k]
        nm = o.name
        keep = nm in KEEP
        bpy.data.objects.remove(o, do_unlink=True)
        n.name = nm
        if keep:
            KEEP.add(n.name)
    for nm in CUT_NAMES:          # aynı kesici birden çok gövdede kullanılabilir
        bpy.data.objects.remove(bpy.data.objects[nm], do_unlink=True)
    for o in SC.objects:
        if o.type == 'MESH':
            o.data.shade_smooth()
            o.data.set_sharp_from_angle(angle=math.radians(34))

def join_static():
    """Her modülde, adı korunmayan doğrudan çocuk ağları malzeme kümesine göre birleştirir
    (çizim çağrısı sayısını düşürür)."""
    for mid, root in MODROOT.items():
        groups = {}
        for c in list(root.children):
            if c.type != 'MESH' or c.name in KEEP:
                continue
            key = tuple(sorted(m.name for m in c.data.materials if m))
            groups.setdefault(key, []).append(c)
        for key, objs in groups.items():
            bpy.ops.object.select_all(action='DESELECT')
            for o in objs:
                o.select_set(True)
            bpy.context.view_layer.objects.active = objs[0]
            if len(objs) > 1:
                bpy.ops.object.join()
            objs[0].name = f'{mid}_' + '_'.join(key)

bake_all()
join_static()

# ---------------------------------------------------------------------------
# Önizleme render'ı (isteğe bağlı)
# ---------------------------------------------------------------------------
if args.render:
    bpy.ops.mesh.primitive_plane_add(size=4, location=(-0.1, 0, 0))
    bench = bpy.context.object
    bench.data.materials.append(mat('Bench', '#20262d', 0.0, 0.62))
    world = bpy.data.worlds.new('W'); SC.world = world; world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (*srgb('#0b1016'), 1); bg.inputs[1].default_value = 1.0
    def area(loc, rot, size, e, col='#ffffff'):
        bpy.ops.object.light_add(type='AREA', location=loc, rotation=[math.radians(a) for a in rot])
        l = bpy.context.object; l.data.size = size; l.data.energy = e; l.data.color = srgb(col)
    area((1.2, -1.6, 1.8), (50, 0, 35), 1.4, 160)
    area((-1.6, -1.0, 1.0), (65, 0, -60), 1.2, 60, '#a8c8ff')
    area((-0.6, 1.4, 1.6), (-50, 0, 200), 1.0, 70, '#25d0c4')
    for e in lamp_empties:
        bpy.ops.object.light_add(type='POINT', location=e.location)
        bpy.context.object.data.energy = 0.3; bpy.context.object.data.shadow_soft_size = 0.03
    cams = {                                   # konum, hedef, odak uzaklığı (mm)
        'front34':    ((1.05, -1.95, 1.05), (-0.08, 0.0, 0.52), 42),
        'close_oven': ((0.30, -0.62, 0.70), (-0.03, -0.12, 0.597), 50),
        'close_as':   ((0.32, -0.70, 0.52), (-0.02, -0.08, 0.38), 50),
        'close_pump': ((0.36, -0.62, 0.30), (0.04, -0.15, 0.19), 50),
        'close_det':  ((0.10, -0.55, 0.86), (-0.10, -0.08, 0.755), 50),
    }
    loc, tgt, lens = cams[args.camera]
    bpy.ops.object.camera_add(location=loc)
    cam = bpy.context.object
    cam.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cam = bpy.context.object; cam.data.lens = lens; SC.camera = cam
    SC.render.engine = 'CYCLES'; SC.cycles.device = 'CPU'; SC.cycles.samples = args.samples
    SC.cycles.use_denoising = True
    rx, ry = (int(v) for v in args.res.split('x'))
    SC.render.resolution_x, SC.render.resolution_y = rx, ry
    SC.view_settings.view_transform = 'AgX'
    SC.render.filepath = args.render
    bpy.ops.render.render(write_still=True)
    for o in [bench, cam] + [o for o in SC.objects if o.type == 'LIGHT']:
        bpy.data.objects.remove(o, do_unlink=True)

# ---------------------------------------------------------------------------
# Dışa aktarım
# ---------------------------------------------------------------------------
bpy.ops.export_scene.gltf(
    filepath=args.out, export_format='GLB', use_selection=False, export_extras=True, export_yup=True,
    export_apply=False, export_cameras=False, export_lights=False, export_materials='EXPORT',
    export_texcoords=True, export_normals=True)
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in SC.objects if o.type == 'MESH')
print(f'HPLC_MODEL_OK objects={sum(1 for o in SC.objects if o.type == "MESH")} triangles={tris}')
