import zlib from 'zlib';
import { PNG } from 'pngjs';

class PNGImage {
  constructor(data, label) {
    this.label = label;
    this.image = PNG.sync.read(Buffer.from(data));
    this.width = this.image.width;
    this.height = this.image.height;
    this.obj = null;
  }

  get imgData() {
    return this._imgData;
  }

  set imgData(value) {
    this._imgData = value;
  }

  embed(document) {
    this.document = document;
    if (this.obj) {
      return;
    }

    const hasAlphaChannel = this.image.alpha;

    this.obj = this.document.ref({
      Type: 'XObject',
      Subtype: 'Image',
      BitsPerComponent: hasAlphaChannel ? 8 : this.image.depth,
      Width: this.width,
      Height: this.height,
      Filter: 'FlateDecode',
    });

    if (!hasAlphaChannel) {
      const params = this.document.ref({
        Predictor: 1,
        Colors: this.image.color ? 3 : 1,
        BitsPerComponent: this.image.depth,
        Columns: this.width,
      });

      this.obj.data['DecodeParms'] = params;
      params.end();
    }

    if (!this.image.palette || this.image.palette.length === 0) {
      this.obj.data['ColorSpace'] = this.image.color ? 'DeviceRGB' : 'DeviceGray';
    } else {
      // embed the color palette in the PDF as an object stream
      const paletteData = [];
      for (const entry of this.image.palette) {
        paletteData.push(entry[0], entry[1], entry[2]);
      }
      const palette = this.document.ref();
      palette.end(Buffer.from(paletteData));

      // build the color space array for the image
      this.obj.data['ColorSpace'] = [
        'Indexed',
        'DeviceRGB',
        this.image.palette.length - 1,
        palette,
      ];
    }

    // For PNG color types 0, 2 and 3, the transparency data is stored in
    // a dedicated PNG chunk.
    if (this.image.transColor && !this.image.color) {
      // Use Color Key Masking (spec section 4.8.5)
      // An array with N elements, where N is two times the number of color components.
      const val = this.image.transColor[0];
      this.obj.data['Mask'] = [val, val];
    } else if (this.image.transColor && this.image.color) {
      // Use Color Key Masking (spec section 4.8.5)
      // An array with N elements, where N is two times the number of color components.
      const rgb = this.image.transColor;
      const mask = [];
      for (let x of rgb) {
        mask.push(x, x);
      }

      this.obj.data['Mask'] = mask;
    } else if (this._hasIndexedAlpha()) {
      // Create a transparency SMask for the image based on the data
      // in the PLTE and tRNS sections. See below for details on SMasks.
      return this.loadIndexedAlphaChannel();
    } else if (hasAlphaChannel) {
      // For PNG color types 4 and 6, the transparency data is stored as a alpha
      // channel mixed in with the main image data. Separate this data out into an
      // SMask object and store it separately in the PDF.
      return this.splitAlphaChannel();
    }

    this.decodeData();
  }

  _hasIndexedAlpha() {
    if (!this.image.palette || this.image.palette.length === 0) return false;
    return this.image.palette.some((entry) => entry[3] < 255);
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
    this.image = null;
    return (this.imgData = null);
  }

  splitAlphaChannel() {
    const pixels = this.image.data;
    const colorCount = this.image.color ? 3 : 1;
    const pixelCount = this.width * this.height;
    const imgData = Buffer.alloc(pixelCount * colorCount);
    const alphaChannel = Buffer.alloc(pixelCount);

    let i = 0;
    let p = 0;
    let a = 0;
    const len = pixels.length;

    while (i < len) {
      for (let colorIndex = 0; colorIndex < colorCount; colorIndex++) {
        imgData[p++] = pixels[i++];
      }
      alphaChannel[a++] = pixels[i++];
    }

    this.imgData = zlib.deflateSync(imgData);
    this.alphaChannel = zlib.deflateSync(alphaChannel);
    return this.finalize();
  }

  loadIndexedAlphaChannel() {
    const pixels = this.image.data;
    const alphaChannel = Buffer.alloc(this.width * this.height);

    // pngjs expands palette images to RGBA, so we extract alpha directly
    for (let j = 0; j < this.width * this.height; j++) {
      alphaChannel[j] = pixels[j * 4 + 3];
    }

    this.alphaChannel = zlib.deflateSync(alphaChannel);
    this.decodeData();
  }

  decodeData() {
    const pixels = this.image.data;
    const colorCount = this.image.color ? 3 : 1;
    const pixelCount = this.width * this.height;

    // For palette images, pngjs expands to RGBA, so we treat as RGB
    let imgData;
    if (this.image.palette?.length > 0) {
      imgData = Buffer.alloc(pixelCount * 3);
      for (let j = 0; j < pixelCount; j++) {
        imgData[j * 3] = pixels[j * 4];
        imgData[j * 3 + 1] = pixels[j * 4 + 1];
        imgData[j * 3 + 2] = pixels[j * 4 + 2];
      }
      this.obj.data['ColorSpace'] = 'DeviceRGB';
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
}

export default PNGImage;
