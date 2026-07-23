// MetadataManager — reads EXIF/orientation/capture info before optimization strips it, restores it after processing.
class MetadataManager {
  async read(blob, loaded) {
    const meta = {
      width: loaded.width, height: loaded.height, mimeType: loaded.mimeType,
      orientation: 1, captureDate: null, camera: null,
    };
    if (blob.type === 'image/jpeg') {
      try { Object.assign(meta, this._parseExif(await blob.arrayBuffer())); } catch { /* EXIF optional */ }
    }
    return meta;
  }

  // Minimal EXIF parser: orientation (0x0112), DateTime (0x0132), Make (0x010F), Model (0x0110).
  _parseExif(buffer) {
    const view = new DataView(buffer);
    if (view.getUint16(0) !== 0xffd8) return {};
    let offset = 2;
    while (offset < view.byteLength - 4) {
      if (view.getUint16(offset) === 0xffe1) {
        const tiff = offset + 10;
        if (view.getUint32(offset + 4) !== 0x45786966) return {};
        const little = view.getUint16(tiff) === 0x4949;
        const ifd = tiff + view.getUint32(tiff + 4, little);
        const count = view.getUint16(ifd, little);
        const out = {};
        for (let i = 0; i < count; i++) {
          const e = ifd + 2 + i * 12;
          const tag = view.getUint16(e, little);
          if (tag === 0x0112) out.orientation = view.getUint16(e + 8, little);
          if (tag === 0x0132 || tag === 0x010f || tag === 0x0110) {
            const len = view.getUint32(e + 4, little);
            const ptr = len > 4 ? tiff + view.getUint32(e + 8, little) : e + 8;
            let str = '';
            for (let c = 0; c < len - 1 && ptr + c < view.byteLength; c++) str += String.fromCharCode(view.getUint8(ptr + c));
            if (tag === 0x0132) out.captureDate = str.trim();
            else out.camera = ((out.camera || '') + ' ' + str.trim()).trim();
          }
        }
        return out;
      }
      offset += 2 + view.getUint16(offset + 2);
    }
    return {};
  }

  // Restore: canvas re-encoding strips EXIF; we carry metadata alongside the result.
  restore(result, meta) {
    return { ...result, metadata: meta };
  }
}

export const metadataManager = new MetadataManager();