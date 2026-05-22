# Vendored upscaler binaries

This folder holds the platform-specific **`realesrgan-ncnn-vulkan`** executable and
its bundled model files (`models/*.param`, `models/*.bin`). These are **not**
committed to git — they are downloaded on first run (or fetched by a setup
script in Phase 2) and bundled into packaged builds via `electron-builder`'s
`extraResources`.

Expected layout once provisioned:

```
resources/vendor/
  realesrgan-ncnn-vulkan        # or realesrgan-ncnn-vulkan.exe on Windows
  models/
    realesrgan-x4plus.param
    realesrgan-x4plus.bin
    ...
```

Upstream: https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan (BSD-3-Clause).
This is the same engine Upscayl uses internally; we invoke it directly as a
subprocess rather than depending on the Upscayl GUI.
