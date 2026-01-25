import zlib from 'zlib';
import { PNG } from 'pngjs';

class PNGImage {
  constructor(data, label) {
    this.label = label;
    this.data = Buffer.from(data);

    this._parsePNGMetadataCompat();

    this.width = this.ihdr.width;
    this.height = this.ihdr.height;
    this.obj = null;
  }

  // Compatibility getter for tests that access img.image.xxx
  get image() {
    return this;
  }

  // Parse PNG header and chunks to extract image metadata like png-js did
  _parsePNGMetadataCompat() {
    const data = this.data;

    // Verify PNG signature
    const signature = data.subarray(0, 8);
    if (signature.toString('hex') !== '89504e470d0a1a0a') {
      throw new Error('Invalid PNG signature');
    }

    let offset = 8;
    this.ihdr = null;
    this.palette = [];
    this.transparency = {};
    this.imgData = [];

    while (offset < data.length) {
      const length = data.readUInt32BE(offset);
      const type = data.subarray(offset + 4, offset + 8).toString('ascii');
      const chunkData = data.subarray(offset + 8, offset + 8 + length);

      switch (type) {
        case 'IHDR':
          this.ihdr = {
            width: chunkData.readUInt32BE(0),
            height: chunkData.readUInt32BE(4),
            bitDepth: chunkData[8],
            colorType: chunkData[9],
            compressionMethod: chunkData[10],
            filterMethod: chunkData[11],
            interlaceMethod: chunkData[12],
          };
          break;

        case 'PLTE':
          this.palette = chunkData;
          break;

        case 'tRNS':
          switch (this.ihdr.colorType) {
            case 0: // Grayscale
              this.transparency.grayscale = chunkData.readUInt16BE(0);
              break;
            case 2: // RGB
              this.transparency.rgb = [
                chunkData.readUInt16BE(0),
                chunkData.readUInt16BE(2),
                chunkData.readUInt16BE(4),
              ];
              break;
            case 3: // Indexed
              this.transparency.indexed = chunkData;
              break;
          }
          break;

        case 'IDAT':
          this.imgData.push(chunkData);
          break;

        case 'IEND':
          break;
      }

      offset += 12 + length;
    }

    // Concatenate IDAT chunks
    this.imgData = Buffer.concat(this.imgData);

    // Derive properties from IHDR
    const { colorType, bitDepth } = this.ihdr;
    this.bits = bitDepth;
    this.interlaceMethod = this.ihdr.interlaceMethod;

    // Color type determines channels
    // 0: Grayscale (1 channel)
    // 2: RGB (3 channels)
    // 3: Indexed (1 channel, palette)
    // 4: Grayscale + Alpha (2 channels)
    // 6: RGBA (4 channels)
    switch (colorType) {
      case 0:
        this.colorSpace = 'DeviceGray';
        this.colors = 1;
        this.hasAlphaChannel = false;
        break;
      case 2:
        this.colorSpace = 'DeviceRGB';
        this.colors = 3;
        this.hasAlphaChannel = false;
        break;
      case 3:
        this.colorSpace = 'DeviceRGB';
        this.colors = 1;
        this.hasAlphaChannel = false;
        break;
      case 4:
        this.colorSpace = 'DeviceGray';
        this.colors = 1;
        this.hasAlphaChannel = true;
        break;
      case 6:
        this.colorSpace = 'DeviceRGB';
        this.colors = 3;
        this.hasAlphaChannel = true;
        break;
    }
  }

  embed(document) {
    this.document = document;
    if (this.obj) {
      return;
    }

    const hasAlphaChannel = this.hasAlphaChannel;
    const isInterlaced = this.interlaceMethod === 1;

    this.obj = this.document.ref({
      Type: 'XObject',
      Subtype: 'Image',
      BitsPerComponent: hasAlphaChannel ? 8 : this.bits,
      Width: this.width,
      Height: this.height,
      Filter: 'FlateDecode',
    });

    if (!hasAlphaChannel) {
      const params = this.document.ref({
        Predictor: isInterlaced ? 1 : 15,
        Colors: this.colors,
        BitsPerComponent: this.bits,
        Columns: this.width,
      });

      this.obj.data['DecodeParms'] = params;
      params.end();
    }

    if (this.palette.length === 0) {
      this.obj.data['ColorSpace'] = this.colorSpace;
    } else {
      // embed the color palette in the PDF as an object stream
      const palette = this.document.ref();
      palette.end(Buffer.from(this.palette));

      // build the color space array for the image
      this.obj.data['ColorSpace'] = [
        'Indexed',
        'DeviceRGB',
        this.palette.length / 3 - 1,
        palette,
      ];
    }

    // For PNG color types 0, 2 and 3, the transparency data is stored in
    // a dedicated PNG chunk.
    if (this.transparency.grayscale != null) {
      // Use Color Key Masking (spec section 4.8.5)
      // An array with N elements, where N is two times the number of color components.
      const val = this.transparency.grayscale;
      this.obj.data['Mask'] = [val, val];
    } else if (this.transparency.rgb) {
      // Use Color Key Masking (spec section 4.8.5)
      // An array with N elements, where N is two times the number of color components.
      const { rgb } = this.transparency;
      const mask = [];
      for (let x of rgb) {
        mask.push(x, x);
      }

      this.obj.data['Mask'] = mask;
    } else if (this.transparency.indexed) {
      // Create a transparency SMask for the image based on the data
      // in the PLTE and tRNS sections. See below for details on SMasks.
      return this.loadIndexedAlphaChannel();
    } else if (hasAlphaChannel) {
      // For PNG color types 4 and 6, the transparency data is stored as a alpha
      // channel mixed in with the main image data. Separate this data out into an
      // SMask object and store it separately in the PDF.
      return this.splitAlphaChannel();
    }

    if (isInterlaced) {
      return this.decodeData();
    }

    this.finalize();
  }

  finalize() {
    if (this.alphaChannel) {
      const sMask = this.document.ref({
        Type: 'XObject',
        Subtype: 'Image',
        Height: this.height,
        Width: this.width,
        BitsPerComponent: 8,
        Filter: 'FlateDecode',
        ColorSpace: 'DeviceGray',
        Decode: [0, 1],
      });

      sMask.end(this.alphaChannel);
      this.obj.data['SMask'] = sMask;
    }

    // add the actual image data
    this.obj.end(this.imgData);

    // free memory
    this.data = null;
    return (this.imgData = null);
  }

  // Decode pixels using pngjs (for interlaced or alpha images)
  _decodePixels() {
    const png = PNG.sync.read(this.data);
    return png.data;
  }

  splitAlphaChannel() {
    const pixels = this._decodePixels();
    const colorCount = this.colors;
    const pixelCount = this.width * this.height;
    const imgData = Buffer.alloc(pixelCount * colorCount);
    const alphaChannel = Buffer.alloc(pixelCount);

    let i = 0;
    let p = 0;
    let a = 0;
    const len = pixels.length;

    // pngjs always outputs RGBA (4 bytes per pixel)
    while (i < len) {
      for (let colorIndex = 0; colorIndex < colorCount; colorIndex++) {
        imgData[p++] = pixels[i++];
      }
      // Skip extra channels if grayscale (pngjs expands to RGBA)
      if (colorCount === 1) {
        i += 2; // Skip G and B (they're duplicates of R for grayscale)
      }
      alphaChannel[a++] = pixels[i++];
    }

    this.imgData = zlib.deflateSync(imgData);
    this.alphaChannel = zlib.deflateSync(alphaChannel);
    return this.finalize();
  }

  loadIndexedAlphaChannel() {
    const pixels = this._decodePixels();
    const alphaChannel = Buffer.alloc(this.width * this.height);

    // pngjs expands palette images to RGBA, so we extract alpha directly
    for (let j = 0; j < this.width * this.height; j++) {
      alphaChannel[j] = pixels[j * 4 + 3];
    }

    this.alphaChannel = zlib.deflateSync(alphaChannel);
    return this.finalize();
  }

  decodeData() {
    // For interlaced images, decode using pngjs and re-encode
    const pixels = this._decodePixels();
    const colorCount = this.colors;
    const pixelCount = this.width * this.height;

    // For palette images, pngjs expands to RGBA
    let imgData;
    if (this.palette.length > 0) {
      // Re-index the pixels back to palette indices
      imgData = this._reindexPixels(pixels);
    } else {
      imgData = Buffer.alloc(pixelCount * colorCount);
      for (let j = 0; j < pixelCount; j++) {
        for (let c = 0; c < colorCount; c++) {
          imgData[j * colorCount + c] = pixels[j * 4 + c];
        }
      }
    }

    this.imgData = zlib.deflateSync(imgData);
    this.finalize();
  }

  // Re-index expanded RGBA pixels back to palette indices
  _reindexPixels(pixels) {
    const palette = this.palette;
    const pixelCount = this.width * this.height;
    const imgData = Buffer.alloc(pixelCount);

    // Build palette lookup
    const paletteLookup = {};
    for (let i = 0; i < palette.length; i += 3) {
      const key = `${palette[i]},${palette[i + 1]},${palette[i + 2]}`;
      paletteLookup[key] = i / 3;
    }

    for (let j = 0; j < pixelCount; j++) {
      const r = pixels[j * 4];
      const g = pixels[j * 4 + 1];
      const b = pixels[j * 4 + 2];
      const key = `${r},${g},${b}`;
      const index = paletteLookup[key];
      imgData[j] = index !== undefined ? index : 0;
    }

    return imgData;
  }
}

export default PNGImage;
