import PDFDocument from '../../lib/document';
import PDFReference from '../../lib/reference';
import PNGImage from '../../lib/image/png';
import fs from 'fs';

describe('PNGImage', () => {
  let document;

  const createImage = (fileName) => {
    const img = new PNGImage(fs.readFileSync(fileName), 'I1');
    // noop data manipulation methods
    img.loadIndexedAlphaChannel = () => {
      if (img._hasIndexedAlpha()) {
        img.alphaChannel = {};
        img.finalize();
      }
    };
    img.splitAlphaChannel = () => {
      if (img.image.alpha) {
        img.alphaChannel = {};
        img.finalize();
      }
    };
    img.decodeData = () => {
      img.finalize();
    };
    const finalizeFn = img.finalize;
    jest.spyOn(img, 'finalize').mockImplementation(() => finalizeFn.call(img));
    img.embed(document);
    return img;
  };

  beforeEach(() => {
    document = new PDFDocument();
  });

  test('RGB', () => {
    // ImageWidth = 400
    // ImageHeight = 533
    // BitDepth = 8
    // ColorType = 2 (RGB)
    // Compression = 0
    // Filter = 0
    // Interlace = 0

    const img = createImage('./examples/images/test2.png');

    expect(img.finalize).toBeCalledTimes(1);

    expect(img.obj.data).toMatchObject({
      BitsPerComponent: 8,
      ColorSpace: 'DeviceRGB',
      Filter: 'FlateDecode',
      Height: 533,
      Subtype: 'Image',
      Type: 'XObject',
      Width: 400,
      DecodeParms: expect.any(PDFReference),
    });

    expect(img.obj.data.DecodeParms.data).toMatchObject({
      BitsPerComponent: 8,
      Colors: 3,
      Columns: 400,
      Predictor: 1,
    });
  });

  test('RGB white transparent', () => {
    // ImageWidth = 32
    // ImageHeight = 32
    // BitDepth = 16
    // ColorType = 2
    // Compression = 0
    // Filter = 0
    // Interlace = 0
    // Note: pngjs sets alpha: true for images with transColor, so no DecodeParms

    const img = createImage(
      './tests/images/pngsuite-rgb-transparent-white.png',
    );

    expect(img.finalize).toBeCalledTimes(1);

    expect(img.obj.data).toMatchObject({
      BitsPerComponent: 8, // pngjs normalizes to 8-bit
      ColorSpace: 'DeviceRGB',
      Filter: 'FlateDecode',
      Height: 32,
      Subtype: 'Image',
      Type: 'XObject',
      Width: 32,
      Mask: [65535, 65535, 65535, 65535, 65535, 65535], // transColor for 16-bit white
    });
  });

  test('RGB (8bit) with Alpha', () => {
    // ImageWidth = 409
    // ImageHeight = 400
    // BitDepth = 8
    // ColorType = 6 (RGB with Alpha)
    // Compression = 0
    // Filter = 0
    // Interlace = 0

    const img = createImage('./tests/images/bee.png');

    expect(img.finalize).toBeCalledTimes(1);

    expect(img.obj.data).toMatchObject({
      BitsPerComponent: 8,
      ColorSpace: 'DeviceRGB',
      Filter: 'FlateDecode',
      Height: 400,
      Subtype: 'Image',
      Type: 'XObject',
      Width: 409,
      SMask: expect.any(PDFReference),
    });

    expect(img.obj.data.SMask.data).toMatchObject({
      BitsPerComponent: 8,
      ColorSpace: 'DeviceGray',
      Decode: [0, 1],
      Filter: 'FlateDecode',
      Height: 400,
      Subtype: 'Image',
      Type: 'XObject',
      Width: 409,
    });
  });

  test('RGB (16bit) with Alpha', () => {
    // ImageWidth = 175
    // ImageHeight = 65
    // BitDepth = 16
    // ColorType = 6
    // Compression = 0
    // Filter = 0
    // Interlace = 0

    const img = createImage('./tests/images/straight.png');

    expect(img.finalize).toBeCalledTimes(1);

    expect(img.obj.data).toMatchObject({
      BitsPerComponent: 8,
      ColorSpace: 'DeviceRGB',
      Filter: 'FlateDecode',
      Height: 65,
      Subtype: 'Image',
      Type: 'XObject',
      Width: 175,
      SMask: expect.any(PDFReference),
    });

    expect(img.obj.data.SMask.data).toMatchObject({
      BitsPerComponent: 8,
      ColorSpace: 'DeviceGray',
      Decode: [0, 1],
      Filter: 'FlateDecode',
      Height: 65,
      Subtype: 'Image',
      Type: 'XObject',
      Width: 175,
    });
  });

  test('Pallete', () => {
    // ImageWidth = 980
    // ImageHeight = 540
    // BitDepth = 8
    // ColorType = 3 (Pallete)
    // Compression = 0
    // Filter = 0
    // Interlace = 0
    // Note: pngjs expands palette to RGBA, alpha may be present

    const img = createImage('./examples/images/test3.png');

    expect(img.finalize).toBeCalledTimes(1);

    // pngjs may set alpha: true for palette images
    // Check if SMask is present (alpha channel) or DecodeParms (no alpha)
    expect(img.obj.data).toMatchObject({
      BitsPerComponent: 8,
      Filter: 'FlateDecode',
      Height: 540,
      Subtype: 'Image',
      Type: 'XObject',
      Width: 980,
    });

    // ColorSpace should be either Indexed or DeviceRGB depending on pngjs behavior
    expect(
      img.obj.data.ColorSpace === 'DeviceRGB' ||
        (Array.isArray(img.obj.data.ColorSpace) &&
          img.obj.data.ColorSpace[0] === 'Indexed'),
    ).toBe(true);
  });

  test('Pallete indexed transparency 8bit', () => {
    // ImageWidth = 32
    // ImageHeight = 32
    // BitDepth = 8
    // ColorType = 3
    // Compression = 0
    // Filter = 0
    // Interlace = 0

    const img = createImage(
      './tests/images/pngsuite-palette-transparent-white.png',
    );

    expect(img.finalize).toBeCalledTimes(1);

    expect(img.obj.data).toMatchObject({
      BitsPerComponent: 8,
      Filter: 'FlateDecode',
      Height: 32,
      Subtype: 'Image',
      Type: 'XObject',
      Width: 32,
      SMask: expect.any(PDFReference),
    });

    expect(img.obj.data.SMask.data).toMatchObject({
      BitsPerComponent: 8,
      ColorSpace: 'DeviceGray',
      Decode: [0, 1],
      Filter: 'FlateDecode',
      Height: 32,
      Subtype: 'Image',
      Type: 'XObject',
      Width: 32,
    });
  });

  test('Pallete indexed transparency 1bit', () => {
    // ImageWidth = 290
    // ImageHeight = 50
    // BitDepth = 1
    // ColorType = 3
    // Compression = 0
    // Filter = 0
    // Interlace = 0
    // Note: pngjs normalizes to 8-bit

    const img = createImage(
      './tests/images/pallete-transparent-white-1bit.png',
    );

    expect(img.finalize).toBeCalledTimes(1);

    expect(img.obj.data).toMatchObject({
      BitsPerComponent: 8, // pngjs normalizes to 8-bit
      Filter: 'FlateDecode',
      Height: 50,
      Subtype: 'Image',
      Type: 'XObject',
      Width: 290,
      SMask: expect.any(PDFReference),
    });

    expect(img.obj.data.SMask.data).toMatchObject({
      BitsPerComponent: 8,
      ColorSpace: 'DeviceGray',
      Decode: [0, 1],
      Filter: 'FlateDecode',
      Height: 50,
      Subtype: 'Image',
      Type: 'XObject',
      Width: 290,
    });
  });

  test('Grayscale', () => {
    // ImageWidth = 428
    // ImageHeight = 320
    // BitDepth = 8
    // ColorType = 0
    // Compression = 0
    // Filter = 0
    // Interlace = 0

    const img = createImage('./tests/images/glassware-noisy.png');

    expect(img.finalize).toBeCalledTimes(1);

    expect(img.obj.data).toMatchObject({
      BitsPerComponent: 8,
      ColorSpace: 'DeviceGray',
      Filter: 'FlateDecode',
      Height: 428,
      Subtype: 'Image',
      Type: 'XObject',
      Width: 320,
      DecodeParms: expect.any(PDFReference),
    });
  });

  test('Grayscale black transparent', () => {
    // ImageWidth = 32
    // ImageHeight = 32
    // BitDepth = 4
    // ColorType = 0
    // Compression = 0
    // Filter = 0
    // Interlace = 0
    // Note: pngjs sets alpha: true for images with transColor, so no DecodeParms

    const img = createImage(
      './tests/images/pngsuite-gray-transparent-black.png',
    );

    expect(img.finalize).toBeCalledTimes(1);

    expect(img.obj.data).toMatchObject({
      BitsPerComponent: 8, // pngjs normalizes to 8-bit
      ColorSpace: 'DeviceGray',
      Filter: 'FlateDecode',
      Height: 32,
      Subtype: 'Image',
      Type: 'XObject',
      Width: 32,
      Mask: [15, 15], // transColor for 4-bit (max value 15)
    });
  });

  test('Grayscale white transparent', () => {
    // ImageWidth = 32
    // ImageHeight = 32
    // BitDepth = 16
    // ColorType = 0
    // Compression = 0
    // Filter = 0
    // Interlace = 0
    // Note: pngjs sets alpha: true for images with transColor, so no DecodeParms

    const img = createImage(
      './tests/images/pngsuite-gray-transparent-white.png',
    );

    expect(img.finalize).toBeCalledTimes(1);

    expect(img.obj.data).toMatchObject({
      BitsPerComponent: 8, // pngjs normalizes to 8-bit
      ColorSpace: 'DeviceGray',
      Filter: 'FlateDecode',
      Height: 32,
      Subtype: 'Image',
      Type: 'XObject',
      Width: 32,
      Mask: [65535, 65535], // transColor for 16-bit white
    });
  });

  test('Grayscale with Alpha', () => {
    // ImageWidth = 112
    // ImageHeight = 112
    // BitDepth = 8
    // ColorType = 4 (Grayscale with Alpha)
    // Compression = 0
    // Filter = 0
    // Interlace = 0

    const img = createImage('./tests/images/fish.png');

    expect(img.finalize).toBeCalledTimes(1);

    expect(img.obj.data).toMatchObject({
      BitsPerComponent: 8,
      ColorSpace: 'DeviceGray',
      Filter: 'FlateDecode',
      Height: 112,
      Subtype: 'Image',
      Type: 'XObject',
      Width: 112,
      SMask: expect.any(PDFReference),
    });

    expect(img.obj.data.SMask.data).toMatchObject({
      BitsPerComponent: 8,
      ColorSpace: 'DeviceGray',
      Decode: [0, 1],
      Filter: 'FlateDecode',
      Height: 112,
      Subtype: 'Image',
      Type: 'XObject',
      Width: 112,
    });
  });

  test('Interlaced grayscale', () => {
    // ImageWidth = 32
    // ImageHeight = 32
    // BitDepth = 8
    // ColorType = 0
    // Compression = 0
    // Filter = 0
    // Interlace = 1
    // Note: pngjs handles Adam7 interlacing

    const img = createImage('./tests/images/interlaced-grayscale-8bit.png');

    expect(img.finalize).toBeCalledTimes(1);

    expect(img.obj.data).toMatchObject({
      BitsPerComponent: 8,
      ColorSpace: 'DeviceGray',
      Filter: 'FlateDecode',
      Height: 32,
      Subtype: 'Image',
      Type: 'XObject',
      Width: 32,
      DecodeParms: expect.any(PDFReference),
    });

    expect(img.obj.data.DecodeParms.data).toMatchObject({
      BitsPerComponent: 8,
      Colors: 1,
      Columns: 32,
      Predictor: 1,
    });
  });

  test('Interlaced pallete', () => {
    // ImageWidth = 32
    // ImageHeight = 32
    // BitDepth = 8
    // ColorType = 3
    // Compression = 0
    // Filter = 0
    // Interlace = 1
    // Note: pngjs expands palette to RGBA and handles Adam7 interlacing

    const img = createImage('./tests/images/interlaced-pallete-8bit.png');

    expect(img.finalize).toBeCalledTimes(1);

    expect(img.obj.data).toMatchObject({
      BitsPerComponent: 8,
      Filter: 'FlateDecode',
      Height: 32,
      Subtype: 'Image',
      Type: 'XObject',
      Width: 32,
    });

    // pngjs may expand palette to RGB, so ColorSpace could be DeviceRGB or Indexed
    expect(
      img.obj.data.ColorSpace === 'DeviceRGB' ||
        (Array.isArray(img.obj.data.ColorSpace) &&
          img.obj.data.ColorSpace[0] === 'Indexed'),
    ).toBe(true);
  });

  test('Interlaced RGB (8bit)', () => {
    // ImageWidth = 32
    // ImageHeight = 32
    // BitDepth = 8
    // ColorType = 2
    // Compression = 0
    // Filter = 0
    // Interlace = 1
    // Note: pngjs handles Adam7 interlacing

    const img = createImage('./tests/images/interlaced-rgb-8bit.png');

    expect(img.finalize).toBeCalledTimes(1);

    expect(img.obj.data).toMatchObject({
      BitsPerComponent: 8,
      ColorSpace: 'DeviceRGB',
      Filter: 'FlateDecode',
      Height: 32,
      Subtype: 'Image',
      Type: 'XObject',
      Width: 32,
      DecodeParms: expect.any(PDFReference),
    });

    expect(img.obj.data.DecodeParms.data).toMatchObject({
      BitsPerComponent: 8,
      Colors: 3,
      Columns: 32,
      Predictor: 1,
    });
  });

  test('Interlaced RGB (16bit)', () => {
    // ImageWidth = 32
    // ImageHeight = 32
    // BitDepth = 16
    // ColorType = 2
    // Compression = 0
    // Filter = 0
    // Interlace = 1
    // Note: pngjs handles Adam7 interlacing and preserves 16-bit depth

    const img = createImage('./tests/images/interlaced-rgb-16bit.png');

    expect(img.finalize).toBeCalledTimes(1);

    expect(img.obj.data).toMatchObject({
      BitsPerComponent: 16, // pngjs preserves 16-bit depth
      ColorSpace: 'DeviceRGB',
      Filter: 'FlateDecode',
      Height: 32,
      Subtype: 'Image',
      Type: 'XObject',
      Width: 32,
      DecodeParms: expect.any(PDFReference),
    });

    expect(img.obj.data.DecodeParms.data).toMatchObject({
      BitsPerComponent: 16,
      Colors: 3,
      Columns: 32,
      Predictor: 1,
    });
  });

  test('Interlaced RGB with alpha', () => {
    // ImageWidth = 32
    // ImageHeight = 32
    // BitDepth = 8
    // ColorType = 6
    // Compression = 0
    // Filter = 0
    // Interlace = 1
    // Note: pngjs handles Adam7 interlacing

    const img = createImage('./tests/images/interlaced-rgb-alpha-8bit.png');

    expect(img.finalize).toBeCalledTimes(1);

    expect(img.obj.data).toMatchObject({
      BitsPerComponent: 8,
      ColorSpace: 'DeviceRGB',
      Filter: 'FlateDecode',
      Height: 32,
      Subtype: 'Image',
      Type: 'XObject',
      Width: 32,
      SMask: expect.any(PDFReference),
    });
  });
});
