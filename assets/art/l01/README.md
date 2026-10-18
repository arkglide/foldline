# L01 production art sources

The installed downloaded textures are **Concrete023** (colour) and **Metal032**
(colour + converted NormalGL), by **Lennart Demes / ambientCG**, **CC0 1.0**.

- https://ambientcg.com/a/Concrete023
- https://ambientcg.com/a/Metal032
- https://docs.ambientcg.com/license/
- Author/operator confirmation: https://docs.ambientcg.com/legal/

`manifest.json` records the exact official API-linked surface map URL, original
2048px download hash, shipped 512px hash/bytes, and processing. The API snapshots
and official license page are in `sources/` (license HTML has trailing
whitespace normalized; its text is preserved). The official license explicitly
covers downloadable assets **and material preview renders**; these files are
actual surface maps linked by the API, not screenshots of thumbnail spheres.
The public ZIP endpoints returned HTTP 403 in this environment.

The 512px derivatives were made with ImageMagick 6:

```sh
convert original.jpg -resize 512x512 -strip -quality 88 derived.jpg
convert original-normal-dx.jpg -resize 512x512 -channel G -negate +channel -strip -quality 88 metal032-normal-gl.jpg
```

The game preparation requires only the committed derivatives; Windows does not
need ImageMagick, Python, Chromium or a network asset service to rebuild them.
No displacement/tessellation is used. The source NormalDX green channel is inverted for glTF/OpenGL NormalGL;
Babylon's glTF loader supplies the scene handedness conversion. Concrete uses a colour map with baked vertex lighting; the
small steel detail batch retains actual PBR/normal shading. The sampled concrete
normal was omitted after profiling, rather than shipped as an unused texture.

`signage.svg` and `gate.svg` are original Foldline graphics (MIT, repository
LICENSE). Their committed PNGs were rasterized in Chromium 154 at the SVG's
intrinsic dimensions, DPR 1, no margin/background. They use the system DejaVu
Sans rasterizer; no font software is distributed. Restore/regenerate the PNGs
only when intentionally updating the SVG, then update the manifest checksum.

The industrial geometry and static light colours are authored in
`game/art/l01-visuals.mjs` and `geometry.mjs`. `prepare:game` deterministically
packs ordinary self-contained glTF 2.0 in memory through ArkGlide's official
exporter. No engine code, downloaded model pack or hidden collider is embedded.
The companion is the original native visual mesh in `game/companion.js`, with
compact chamfers, tool ribs and shared Metal032 colour texture.

`node --test tests/l01-art.test.mjs` checks asset integrity and preservation of
all native collision/player descriptors; browser checks cover actual decoding,
imported coordinates, view composition and traversal.
